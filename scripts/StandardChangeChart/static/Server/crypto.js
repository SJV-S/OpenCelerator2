/**
 * Crypto module - Web Crypto API wrappers for AES-256-GCM encryption
 */

const PBKDF2_ITERATIONS = 100000;

// Hex encode/decode helpers
const toHex = bytes => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = hex => new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

export async function sha256(input) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return toHex(new Uint8Array(hash));
}

export async function deriveKey(passphrase, salt) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
}

export async function encrypt(key, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
    const combined = new Uint8Array(12 + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), 12);
    return toHex(combined);
}

export async function decrypt(key, encryptedHex, parseJson = true) {
    const combined = fromHex(encryptedHex);
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12)
    );
    const text = new TextDecoder().decode(plaintext);
    return parseJson ? JSON.parse(text) : text;
}

export async function generateChartKey() {
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapKey(chartKey, wrappingKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.wrapKey('raw', chartKey, wrappingKey, { name: 'AES-GCM', iv });
    const combined = new Uint8Array(12 + wrapped.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(wrapped), 12);
    return toHex(combined);
}

export async function unwrapKey(wrappedHex, unwrappingKey) {
    const combined = fromHex(wrappedHex);
    return crypto.subtle.unwrapKey(
        'raw', combined.slice(12), unwrappingKey,
        { name: 'AES-GCM', iv: combined.slice(0, 12) },
        { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );
}