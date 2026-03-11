#!/usr/bin/env node
/**
 * Upload all 50 NFT SVGs to IPFS as a directory via OPNet pinning endpoint.
 * Uses the IPFS HTTP API with wrap-with-directory=true.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const IPFS_ENDPOINT = 'https://ipfs.opnet.org/api/v0/add';
const NFT_DIR = path.join(__dirname, 'nfts');

async function uploadFile(filePath, fileName) {
    return new Promise((resolve, reject) => {
        const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
        const fileData = fs.readFileSync(filePath);

        const bodyParts = [];
        bodyParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/svg+xml\r\n\r\n`));
        bodyParts.push(fileData);
        bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
        const body = Buffer.concat(bodyParts);

        const url = new URL(`${IPFS_ENDPOINT}?pin=true`);
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length,
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    reject(new Error(`Parse error: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function main() {
    console.log('Uploading 50 NFT SVGs to IPFS...\n');

    const results = {};
    const files = fs.readdirSync(NFT_DIR).filter(f => f.endsWith('.svg')).sort((a, b) => {
        return parseInt(a) - parseInt(b);
    });

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(NFT_DIR, file);
        try {
            const result = await uploadFile(filePath, file);
            results[file] = result.Hash;
            if ((i + 1) % 10 === 0 || i === files.length - 1) {
                console.log(`  Uploaded ${i + 1}/${files.length} — ${file} → ${result.Hash}`);
            }
        } catch (err) {
            console.error(`  FAILED ${file}: ${err.message}`);
        }
    }

    // Save CID mapping
    const mapPath = path.join(__dirname, 'ipfs-cids.json');
    fs.writeFileSync(mapPath, JSON.stringify(results, null, 2));
    console.log(`\nCID mapping saved to: ${mapPath}`);
    console.log(`Total uploaded: ${Object.keys(results).length} files`);

    // Print summary
    console.log('\nSample CIDs:');
    console.log(`  1.svg  → ipfs://${results['1.svg']}`);
    console.log(`  25.svg → ipfs://${results['25.svg']}`);
    console.log(`  50.svg → ipfs://${results['50.svg']}`);
}

main().catch(console.error);
