import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { env_exit } from '@btc-vision/btc-runtime/runtime/env/global';
import { CollectionTemplate } from './contracts/CollectionTemplate';

Blockchain.contract = (): CollectionTemplate => {
    return new CollectionTemplate();
};

export * from '@btc-vision/btc-runtime/runtime/exports';

/**
 * Custom abort handler — zero-byte revert data.
 *
 * The OPNet VM has a very small revert error buffer limit. Even 32 bytes
 * triggers "Revert error too long". We send ZERO bytes of data — just
 * exit code 1 to signal revert. Error messages are lost but the TX
 * doesn't break with a misleading error.
 */
export function abort(_msg: string, _file: string, _line: u32, _col: u32): void {
    env_exit(1, new ArrayBuffer(0), 0);
}
