/**
 * Crypto module - Web Crypto API wrappers for AES-256-GCM encryption and ECDSA signing
 */

const PBKDF2_ITERATIONS = 100000;

// Hex encode/decode helpers
const toHex = bytes => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
export const fromHex = hex => new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

// Base64 encode/decode helpers (for ECDSA key serialization)
const toBase64 = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const fromBase64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;

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

// ============================================================================
// ECDSA Signing (P-256)
// ============================================================================

const ECDSA_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' };

// --- P-256 scalar base multiplication (the one op Web Crypto can't do) ---

const P  = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const A  = 0xffffffff00000001000000000000000000000000fffffffffffffffffffffffcn; // = p - 3
const N  = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const Gx = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n;
const Gy = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;

function mod(a, m = P) { const r = a % m; return r >= 0n ? r : r + m; }

function modInv(num, md = P) {
    let [a, b, x, u] = [mod(num, md), md, 0n, 1n];
    while (a !== 0n) {
        const q = b / a;
        [b, a] = [a, b - q * a];
        [x, u] = [u, x - q * u];
    }
    return mod(x, md);
}

function pointAdd(x1, y1, x2, y2) {
    if (x1 === null) return [x2, y2];
    if (x2 === null) return [x1, y1];
    if (x1 === x2 && y1 === y2) {
        // Point doubling: lambda = (3x² + a) / 2y — the +a is essential for P-256
        const lam = mod((3n * x1 * x1 + A) * modInv(2n * y1));
        const rx = mod(lam * lam - 2n * x1);
        return [rx, mod(lam * (x1 - rx) - y1)];
    }
    if (x1 === x2) return [null, null]; // point at infinity
    const lam = mod((y2 - y1) * modInv(x2 - x1));
    const rx = mod(lam * lam - x1 - x2);
    return [rx, mod(lam * (x1 - rx) - y1)];
}

function scalarMul(k, px, py) {
    let [rx, ry] = [null, null];
    let [qx, qy] = [px, py];
    while (k > 0n) {
        if (k & 1n) [rx, ry] = pointAdd(rx, ry, qx, qy);
        [qx, qy] = pointAdd(qx, qy, qx, qy);
        k >>= 1n;
    }
    return [rx, ry];
}

function bytesToBigInt(bytes) {
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    return n;
}

function bigIntToBytes(n, len) {
    const arr = new Uint8Array(len);
    for (let i = len - 1; i >= 0; i--) { arr[i] = Number(n & 0xffn); n >>= 8n; }
    return arr;
}

function buildPkcs8P256(d, x, y) {
    const prefix = new Uint8Array([
        0x30,0x81,0x87, 0x02,0x01,0x00, 0x30,0x13,
        0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,
        0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,
        0x04,0x6d, 0x30,0x6b, 0x02,0x01,0x01, 0x04,0x20
    ]);
    const mid = new Uint8Array([0xa1,0x44, 0x03,0x42, 0x00, 0x04]);
    const buf = new Uint8Array(138);
    buf.set(prefix, 0);    // bytes 0-35
    buf.set(d, 36);         // bytes 36-67
    buf.set(mid, 68);       // bytes 68-73
    buf.set(x, 74);         // bytes 74-105
    buf.set(y, 106);        // bytes 106-137
    return buf;
}

export async function deriveSigningKeyPair(passphrase) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']
    );

    // Derive 32 bytes with signing-specific salt
    let rawBytes = new Uint8Array(await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode('ecdsa-signing'), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial, 256
    ));

    // Validate scalar is in [1, n-1]; rehash if out of range (~2^-32 probability)
    let d = bytesToBigInt(rawBytes);
    while (d === 0n || d >= N) {
        rawBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', rawBytes));
        d = bytesToBigInt(rawBytes);
    }

    // Compute public point Q = d * G
    const [qx, qy] = scalarMul(d, Gx, Gy);

    // Build PKCS8 DER and import
    const pkcs8 = buildPkcs8P256(bigIntToBytes(d, 32), bigIntToBytes(qx, 32), bigIntToBytes(qy, 32));
    const privateKey = await crypto.subtle.importKey(
        'pkcs8', pkcs8.buffer, ECDSA_PARAMS, true, ['sign']
    );

    // Extract public key via JWK round-trip
    const jwk = await crypto.subtle.exportKey('jwk', privateKey);
    const publicKey = await crypto.subtle.importKey(
        'jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
        ECDSA_PARAMS, true, ['verify']
    );

    return { privateKey, publicKey };
}

export async function sign(dataHex, privateKey) {
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' }, privateKey, fromHex(dataHex)
    );
    return toHex(new Uint8Array(signature));
}

export async function verify(dataHex, signatureHex, publicKey) {
    return crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' }, publicKey, fromHex(signatureHex), fromHex(dataHex)
    );
}

export async function exportPublicKey(key) {
    return toBase64(await crypto.subtle.exportKey('spki', key));
}

export async function importPublicKey(base64) {
    return crypto.subtle.importKey('spki', fromBase64(base64), ECDSA_PARAMS, true, ['verify']);
}

export async function exportPrivateKey(key) {
    return toBase64(await crypto.subtle.exportKey('pkcs8', key));
}

export async function importPrivateKey(base64) {
    return crypto.subtle.importKey('pkcs8', fromBase64(base64), ECDSA_PARAMS, true, ['sign']);
}
