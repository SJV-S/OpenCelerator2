/**
 * BIP39 passphrase generation and user identity
 */

import { BIP39_WORDLIST } from '../util/BIP39Words.js';
import { sha256, deriveKey } from '../../Server/crypto.js';

const WORD_COUNT = 12;
const VALID_WORD_COUNTS = [8, 10, 12];

export function generatePassphrase() {
    const indices = crypto.getRandomValues(new Uint32Array(WORD_COUNT));
    return Array.from(indices).map(i => BIP39_WORDLIST[i % BIP39_WORDLIST.length]).join(' ');
}

export function validatePassphrase(passphrase) {
    const words = passphrase.trim().toLowerCase().split(/\s+/);
    return VALID_WORD_COUNTS.includes(words.length) && words.every(w => BIP39_WORDLIST.includes(w));
}

export async function getUserKey(passphrase) {
    const salt = await sha256(passphrase);
    return deriveKey(passphrase, salt);
}