/**
 * Auto-initialize sync client with stored or new passphrase.
 * Manages user_preferences in SCC_Identity for sync settings.
 */

import { openDB } from '../lib/idb.js';
import { generatePassphrase } from './passphrase.js';
import { initSync } from './syncClient.js';

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

    await initSync(passphrase);
    initialized = true;
    console.log('[Server] Sync initialized');
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
