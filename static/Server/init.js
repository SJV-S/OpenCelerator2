/**
 * Auto-initialize sync client with stored or new passphrase.
 * Manages user_preferences in SCC_Identity for sync settings.
 * Derives ECDSA signing key pair deterministically from passphrase.
 */

import { openDB } from '../lib/idb.js';
import { generatePassphrase } from './passphrase.js';
import { initSync } from './syncClient.js';
import { deriveSigningKeyPair, exportPublicKey } from './crypto.js';

const DB_NAME = 'SCC_Identity';
const STORE_NAME = 'credentials';
const PREFS_KEY = 'user_preferences';

const DEFAULT_PREFERENCES = {
    syncAllChartsToServer: true
};

let initialized = false;
let userPreferences = null;

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

    let prefs = await db.get(STORE_NAME, PREFS_KEY);
    if (!prefs) {
        prefs = { ...DEFAULT_PREFERENCES };
        await db.put(STORE_NAME, prefs, PREFS_KEY);
    }
    userPreferences = prefs;

    // Derive ECDSA signing key pair deterministically from passphrase
    const keyPair = await deriveSigningKeyPair(passphrase);
    const publicKeyB64 = await exportPublicKey(keyPair.publicKey);

    // One-time migration: reclaim broken-era charts with stale random publicKey
    await migrateSigningKeys(publicKeyB64);

    await initSync(passphrase, keyPair.privateKey, publicKeyB64);
    initialized = true;
    console.log('[Server] Sync initialized');
}

async function migrateSigningKeys(newPublicKeyB64) {
    try {
        const db = await openDB('SCC_Charts', 1);
        const tx = db.transaction('charts', 'readwrite');
        const store = tx.objectStore('charts');
        let cursor = await store.openCursor();
        let migrated = 0;

        while (cursor) {
            const chart = cursor.value;
            let updated = false;

            // Clean up legacy owner field
            if ('owner' in chart) {
                delete chart.owner;
                updated = true;
            }

            // Reclaim broken-era charts: stale random publicKey, not an edit-link chart
            if (chart.publicKey && chart.publicKey !== newPublicKeyB64 && !chart.acceptingEdits) {
                chart.publicKey = newPublicKeyB64;
                updated = true;
                migrated++;
            }

            if (updated) await cursor.update(chart);
            cursor = await cursor.continue();
        }

        await tx.done;
        if (migrated > 0) console.log(`[Server] Migrated ${migrated} chart(s) to deterministic signing key`);
    } catch (e) {
        // SCC_Charts DB may not exist yet on first visit
        console.debug('[Server] Chart migration skipped:', e.message);
    }
}

export function isSyncEnabled() {
    return userPreferences?.syncAllChartsToServer ?? false;
}

export function getUserPreferences() {
    return { ...DEFAULT_PREFERENCES, ...userPreferences };
}

export async function setUserPreference(key, value) {
    if (!userPreferences) {
        userPreferences = { ...DEFAULT_PREFERENCES };
    }
    userPreferences[key] = value;
    const db = await openDB(DB_NAME, 1);
    await db.put(STORE_NAME, { ...userPreferences }, PREFS_KEY);
}

export function resetSync() {
    initialized = false;
}
