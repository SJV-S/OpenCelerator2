/**
 * Auto-initialize sync client with stored or new passphrase
 */

import { openDB } from '../SCC/lib/idb.js';
import { generatePassphrase } from './passphrase.js';
import { initSync } from './syncClient.js';

const DB_NAME = 'SCC_Identity';
const STORE_NAME = 'credentials';

let initialized = false;

export async function initServerSync() {
    if (initialized) return;

    const db = await openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        }
    });

    let passphrase = await db.get(STORE_NAME, 'passphrase');

    if (!passphrase) {
        passphrase = generatePassphrase();
        await db.put(STORE_NAME, passphrase, 'passphrase');
        console.log('[Server] Generated new passphrase');
    }

    await initSync(passphrase);
    initialized = true;
    console.log('[Server] Sync initialized');
}

export function resetSync() {
    initialized = false;
}