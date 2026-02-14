/**
 * Gzip compression layer for server-bound chart data.
 *
 * Wraps encrypt/decrypt to compress JSON before encryption and
 * decompress after decryption. Uses the native CompressionStream API.
 *
 * Backwards compatible: decryptCompressed auto-detects compressed vs
 * legacy uncompressed payloads via the gzip magic number (0x1F 0x8B).
 * Valid JSON/UTF-8 never starts with those bytes.
 */

import { encrypt, decrypt } from './crypto.js';

async function gzipCompress(data) {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(data);
    writer.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function gzipDecompress(data) {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(data);
    writer.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/**
 * Stringify, gzip-compress, then AES-256-GCM encrypt.
 * @param {CryptoKey} key
 * @param {object|string} data
 * @returns {Promise<string>} hex-encoded encrypted payload
 */
export async function encryptCompressed(key, data) {
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    const compressed = await gzipCompress(new TextEncoder().encode(json));
    return encrypt(key, compressed);
}

/**
 * AES-256-GCM decrypt, auto-detect gzip, decompress if needed, JSON-parse.
 * Handles both compressed (new) and uncompressed (legacy) payloads.
 * @param {CryptoKey} key
 * @param {string} encryptedHex
 * @returns {Promise<object>} parsed chart data
 */
export async function decryptCompressed(key, encryptedHex) {
    const raw = await decrypt(key, encryptedHex, 'raw');
    const bytes = (raw[0] === 0x1F && raw[1] === 0x8B)
        ? await gzipDecompress(raw)
        : raw;
    return JSON.parse(new TextDecoder().decode(bytes));
}
