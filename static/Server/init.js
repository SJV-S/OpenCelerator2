/**
 * Auto-initialize sync client with stored or new passphrase.
 * Manages user_preferences in SCC_Identity for sync settings.
 * Derives ECDSA signing key pair deterministically from passphrase.
 */

import { openDB } from '../lib/idb.js';
import { generatePassphrase } from '../SCC/storage/passphrase.js';
import { initSync, setSigningDisplayName } from './syncClient.js';
import { deriveSigningKeyPair, exportPublicKey } from './crypto.js';
import { eventBus, EVENTS } from '../SCC/eventBus.js';

const DB_NAME = 'SCC_Identity';
const STORE_NAME = 'credentials';
const PREFS_KEY = 'user_preferences';

const DEFAULT_PREFERENCES = {
    syncAllChartsToServer: true
};

let initialized = false;
let userPreferences = null;
let publicKeyB64Cache = null;

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
        if (!window.location.pathname.startsWith('/welcome')) {
            window.location.href = '/welcome';
            return;
        }
        // On welcome page: don't generate yet, just return early
        return;
    }

    let prefs = await db.get(STORE_NAME, PREFS_KEY);
    if (!prefs) {
        prefs = { ...DEFAULT_PREFERENCES };
        await db.put(STORE_NAME, prefs, PREFS_KEY);
    }
    userPreferences = prefs;

    // Read display name (human-readable, display only)
    const displayName = await db.get(STORE_NAME, 'display_name') || null;

    // Derive ECDSA signing key pair (need private key for signing)
    const keyPair = await deriveSigningKeyPair(passphrase);

    // Ensure publicKey is derived and persisted
    publicKeyB64Cache = await db.get(STORE_NAME, 'publicKey');
    if (!publicKeyB64Cache) {
        publicKeyB64Cache = await exportPublicKey(keyPair.publicKey);
        await db.put(STORE_NAME, publicKeyB64Cache, 'publicKey');
    }

    await initSync(passphrase, keyPair.privateKey, publicKeyB64Cache, displayName);
    initialized = true;
    console.log('[Server] Sync initialized');
    eventBus.emit(EVENTS.SYNC_READY);
}

export function getPublicKeyB64() {
    return publicKeyB64Cache;
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

export async function getDisplayName() {
    const db = await openDB(DB_NAME, 1);
    return await db.get(STORE_NAME, 'display_name') || null;
}

export async function setDisplayName(name) {
    const val = name || null;
    const db = await openDB(DB_NAME, 1);
    await db.put(STORE_NAME, val, 'display_name');
    setSigningDisplayName(val);
}

export function resetSync() {
    initialized = false;
}
