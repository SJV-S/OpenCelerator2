/**
 * Account Link — create and redeem one-time encrypted identity transfer links.
 *
 * The server only stores an opaque AES-256-GCM blob it cannot decrypt.
 * The link secret (in the URL fragment-like path) is never sent to the server.
 */

import { deriveKey, encrypt, decrypt } from './crypto.js';
import { api } from './client-api.js';

/**
 * Generate a hex string from random bytes.
 * @param {number} byteLength
 * @returns {string}
 */
function randomHex(byteLength) {
    const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create an account link: encrypt identity, POST blob to server, return URL.
 * @param {string} passphrase  - BIP39 passphrase to transfer
 * @param {string} displayName - user's display name
 * @returns {Promise<{url: string, linkId: string}>}
 */
export async function createAccountLink(passphrase, displayName) {
    const linkId = crypto.randomUUID();
    const linkSecret = randomHex(32); // 32 bytes = 64 hex chars

    // Derive an AES-256-GCM key from the link secret, salted with the linkId
    const key = await deriveKey(linkSecret, linkId);

    // Encrypt the identity payload
    const encryptedBlob = await encrypt(key, { passphrase, displayName });

    // POST the opaque blob to the server
    const res = await api('/api/account-link', {
        method: 'POST',
        body: { link_id: linkId, encrypted_blob: encryptedBlob }
    });

    if (res.status === 409) throw new Error('Link ID collision — try again');
    if (res.status === 429) throw new Error('Too many links created. Please wait a minute.');
    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const url = `${location.origin}/sync/${linkId}/${linkSecret}`;
    return { url, linkId };
}

/**
 * Redeem an account link: fetch blob from server, decrypt with link secret.
 * @param {string} linkId
 * @param {string} linkSecret
 * @returns {Promise<{passphrase: string, displayName: string}>}
 */
export async function redeemAccountLink(linkId, linkSecret) {
    const res = await api(`/api/account-link/${encodeURIComponent(linkId)}`);

    if (res.status === 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Link not found or already used');
    }
    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const { encrypted_blob } = await res.json();

    // Derive the same key and decrypt
    const key = await deriveKey(linkSecret, linkId);
    const payload = await decrypt(key, encrypted_blob);

    return { passphrase: payload.passphrase, displayName: payload.displayName };
}
