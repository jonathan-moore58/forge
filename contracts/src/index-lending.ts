import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { env_exit } from '@btc-vision/btc-runtime/runtime/env/global';
import { NFTLending } from './contracts/NFTLending';

Blockchain.contract = (): NFTLending => {
    return new NFTLending();
};

export * from '@btc-vision/btc-runtime/runtime/exports';

export function abort(message: string, _fileName: string, _line: u32, _column: u32): void {
    const selector: u32 = 0x63739d5c;
    const msg: string = message.length > 64 ? message.substring(0, 64) : message;
    const msgBytes: Uint8Array = Uint8Array.wrap(String.UTF8.encode(msg));
    const buf: ArrayBuffer = new ArrayBuffer(4 + 4 + msgBytes.length);
    const view: DataView = new DataView(buf);
    view.setUint32(0, selector, false);
    view.setUint32(4, msgBytes.length, false);
    for (let i: i32 = 0; i < msgBytes.length; i++) {
        view.setUint8(8 + i, msgBytes[i]);
    }
    env_exit(1, buf, buf.byteLength);
}
