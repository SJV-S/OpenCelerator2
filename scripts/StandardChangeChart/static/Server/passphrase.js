/**
 * BIP39 passphrase generation and user identity
 */

import { BIP39_WORDLIST } from './BIP39Words.js';
import { sha256, deriveKey } from './crypto.js';

const WORD_COUNT = 8;

export function generatePassphrase() {
    const indices = crypto.getRandomValues(new Uint32Array(WORD_COUNT));
    return Array.from(indices).map(i => BIP39_WORDLIST[i % BIP39_WORDLIST.length]).join(' ');
}

export function validatePassphrase(passphrase) {
    const words = passphrase.trim().toLowerCase().split(/\s+/);
    return words.length === WORD_COUNT && words.every(w => BIP39_WORDLIST.includes(w));
}

export async function getUserId(passphrase) {
    return sha256(passphrase);
}

export async function getUserKey(passphrase) {
    const userId = await getUserId(passphrase);
    return deriveKey(passphrase, userId);
}