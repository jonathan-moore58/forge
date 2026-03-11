/**
 * Hybrid fetch — try Node.js native fetch first (fast), fall back to curl on failure.
 *
 * Why: Hotspot Shield VPN routes via Windows Schannel (curl uses it) but
 * Node.js uses bundled OpenSSL which sometimes bypasses the VPN adapter,
 * causing ETIMEDOUT. Native fetch is 10× faster though, so we try it first.
 *
 * Strategy:
 *   1. Try native fetch (fast, ~100ms per call)
 *   2. On ETIMEDOUT / network error → retry once with curl (slow, ~2-3s per call)
 *   3. Track consecutive curl fallbacks; if native keeps failing, switch to
 *      curl-only mode temporarily and re-check native periodically.
 *
 * Import this module BEFORE any library that caches globalThis.fetch.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createLogger } from './logger.js';

const log = createLogger('curl-fetch');

let _reqCounter = 0;

/** How many consecutive native failures before switching to curl-only mode */
const NATIVE_FAILURE_THRESHOLD = 5;
/** How many curl-only calls before retrying native */
const NATIVE_RECHECK_INTERVAL = 50;

let _nativeFailCount = 0;
let _curlOnlyCount = 0;
let _curlOnlyMode = false;

/** Promisified execFile wrapper */
function execFileAsync(
    cmd: string,
    args: string[],
    options: { encoding: 'utf8'; timeout: number; maxBuffer: number },
): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, options, (err, stdout) => {
            if (err) return reject(err);
            resolve(stdout);
        });
    });
}

/** Execute a fetch via curl subprocess */
async function curlFetch(
    url: string,
    method: string,
    headers: Record<string, string> | null,
    body: string | null,
): Promise<Response> {
    const args: string[] = ['-s', '-S', '--connect-timeout', '30', '-X', method];

    if (headers) {
        for (const [k, v] of Object.entries(headers)) {
            args.push('-H', `${k}: ${v}`);
        }
    }

    let tmpFile: string | null = null;
    if (body) {
        if (body.length > 8000) {
            tmpFile = path.join(os.tmpdir(), `curl-backend-${process.pid}-${++_reqCounter}.json`);
            fs.writeFileSync(tmpFile, body, 'utf8');
            args.push('-d', `@${tmpFile}`);
        } else {
            args.push('-d', body);
        }
    }

    args.push('-w', '\n%{http_code}');
    args.push(url);

    try {
        const raw = await execFileAsync('curl', args, {
            encoding: 'utf8',
            timeout: 120_000,
            maxBuffer: 50 * 1024 * 1024,
        });

        const lines = raw.trimEnd().split('\n');
        const statusCode = parseInt(lines.pop() ?? '200', 10);
        const responseBody = lines.join('\n');

        return new Response(responseBody, {
            status: statusCode,
            headers: { 'content-type': 'application/json' },
        });
    } finally {
        if (tmpFile) {
            try { fs.unlinkSync(tmpFile); } catch {}
        }
    }
}

const _originalFetch = globalThis.fetch;
globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> => {
    const url =
        typeof input === 'string'
            ? input
            : input instanceof URL
                ? input.toString()
                : (input as Request).url;

    const method = init?.method ?? 'GET';
    const body = init?.body;
    const bodyStr = body
        ? (typeof body === 'string'
            ? body
            : body instanceof ArrayBuffer || body instanceof Uint8Array
                ? Buffer.from(body as ArrayBuffer).toString('utf8')
                : String(body))
        : null;

    // Extract headers as plain object
    let headers: Record<string, string> | null = null;
    if (init?.headers) {
        headers = init.headers instanceof Headers
            ? Object.fromEntries(init.headers.entries())
            : Array.isArray(init.headers)
                ? Object.fromEntries(init.headers)
                : (init.headers as Record<string, string>);
    }

    // In curl-only mode, periodically re-check if native works
    if (_curlOnlyMode) {
        _curlOnlyCount++;
        if (_curlOnlyCount >= NATIVE_RECHECK_INTERVAL) {
            _curlOnlyMode = false;
            _curlOnlyCount = 0;
            _nativeFailCount = 0;
            log.info('Re-checking native fetch...');
        } else {
            return curlFetch(url, method, headers, bodyStr);
        }
    }

    // Try native fetch first (fast path)
    try {
        const response = await _originalFetch(input, {
            ...init,
            signal: AbortSignal.timeout(30_000), // 30s timeout
        });
        // Native succeeded — reset failure counter
        if (_nativeFailCount > 0) {
            _nativeFailCount = 0;
        }
        return response;
    } catch {
        // Native failed — fall back to curl
        _nativeFailCount++;
        if (_nativeFailCount >= NATIVE_FAILURE_THRESHOLD && !_curlOnlyMode) {
            _curlOnlyMode = true;
            _curlOnlyCount = 0;
            log.warn(`Native fetch failed ${_nativeFailCount}× consecutively — switching to curl-only mode (will re-check after ${NATIVE_RECHECK_INTERVAL} calls)`);
        }
    }

    // Curl fallback
    try {
        return await curlFetch(url, method, headers, bodyStr);
    } catch (err) {
        throw new TypeError(`fetch failed (native + curl): ${(err as Error).message?.slice(0, 200)}`);
    }
};

log.info('globalThis.fetch patched: native-first with curl fallback');
