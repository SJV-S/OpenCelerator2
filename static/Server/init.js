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
    syncAllChartsToServer: true,
    backupRemindersEnabled: false,
    backupReminderInterval: 1,
    backupReminderUnit: 'weeks',
    lastBackupTimestamp: 0
};

let initialized = false;
let userPreferences = null;
let publicKeyB64Cache = null;
let displayNameCache = null;

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
        // On the welcome page (manual import flow), leave identity creation to the user.
        if (window.location.pathname.startsWith('/welcome')) return;

        // First visit: silently create an "Unnamed" identity so the app works immediately.
        // The user can import or change their identity via settings later.
        passphrase = generatePassphrase();
        const autoKeyPair = await deriveSigningKeyPair(passphrase);
        const autoPublicKeyB64 = await exportPublicKey(autoKeyPair.publicKey);
        await db.put(STORE_NAME, passphrase, 'passphrase');
        await db.put(STORE_NAME, autoPublicKeyB64, 'publicKey');
        await db.put(STORE_NAME, 'Unnamed', 'display_name');
        await db.put(STORE_NAME, 'Both', 'use_case');
        await db.put(STORE_NAME, { ...DEFAULT_PREFERENCES }, PREFS_KEY);
    }

    let prefs = await db.get(STORE_NAME, PREFS_KEY);
    if (!prefs) {
        prefs = { ...DEFAULT_PREFERENCES };
        await db.put(STORE_NAME, prefs, PREFS_KEY);
    }
    userPreferences = prefs;

    // Read display name (human-readable, display only)
    displayNameCache = await db.get(STORE_NAME, 'display_name') || null;

    // Derive ECDSA signing key pair (need private key for signing)
    const keyPair = await deriveSigningKeyPair(passphrase);

    // Ensure publicKey is derived and persisted
    publicKeyB64Cache = await db.get(STORE_NAME, 'publicKey');
    if (!publicKeyB64Cache) {
        publicKeyB64Cache = await exportPublicKey(keyPair.publicKey);
        await db.put(STORE_NAME, publicKeyB64Cache, 'publicKey');
    }

    await initSync(passphrase, keyPair.privateKey, publicKeyB64Cache, displayNameCache);
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
    if (displayNameCache !== null) return displayNameCache;
    const db = await openDB(DB_NAME, 1);
    return await db.get(STORE_NAME, 'display_name') || null;
}

export async function setDisplayName(name) {
    const val = name || null;
    displayNameCache = val;
    const db = await openDB(DB_NAME, 1);
    await db.put(STORE_NAME, val, 'display_name');
    setSigningDisplayName(val);
}

export function getDisplayNameCached() {
    return displayNameCache;
}

export function resetSync() {
    initialized = false;
}
