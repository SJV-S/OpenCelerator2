/**
 * Backup Storage - Full backup export/import for charts and identity
 *
 * Handles creating complete backup data and restoring from backup files.
 * Each function opens its own IDB connections (stateless pattern).
 */

import { openDB } from '../../lib/idb.js';
import { resetSync, initServerSync } from '../../Server/init.js';

/**
 * Create a full backup of all charts and identity data.
 * @returns {Promise<{backupVersionFormat: number, exportedAt: string, identity: object, charts: Array}>}
 */
export async function createBackupData() {
    const identityDb = await openDB('SCC_Identity', 1);
    const tx = identityDb.transaction('credentials', 'readonly');
    const store = tx.objectStore('credentials');
    const [passphrase, publicKey, display_name, user_preferences] = await Promise.all([
        store.get('passphrase'),
        store.get('publicKey'),
        store.get('display_name'),
        store.get('user_preferences'),
    ]);
    await tx.done;

    const identity = {
        passphrase: passphrase || null,
        publicKey: publicKey || null,
        display_name: display_name || null,
        user_preferences: user_preferences || null,
    };

    const chartsDb = await openDB('SCC_Charts', 1);
    const charts = await chartsDb.getAll('charts');

    return {
        backupVersionFormat: 1,
        exportedAt: new Date().toISOString(),
        identity,
        charts,
    };
}

/**
 * Restore charts and identity from a backup file.
 * @param {object} backup - Parsed backup JSON
 * @param {{discardExisting: boolean}} options
 * @returns {Promise<{chartsRestored: number}>}
 */
export async function restoreFromBackup(backup, { discardExisting }) {
    if (discardExisting) {
        const chartsDb = await openDB('SCC_Charts', 1);
        const tx = chartsDb.transaction('charts', 'readwrite');
        await tx.objectStore('charts').clear();
        await tx.done;
    }

    // Write identity data
    const identityDb = await openDB('SCC_Identity', 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('credentials')) {
                db.createObjectStore('credentials');
            }
        }
    });

    const identity = backup.identity || {};
    if (identity.passphrase) await identityDb.put('credentials', identity.passphrase, 'passphrase');
    if (identity.publicKey) await identityDb.put('credentials', identity.publicKey, 'publicKey');
    if (identity.display_name) await identityDb.put('credentials', identity.display_name, 'display_name');
    if (identity.user_preferences) await identityDb.put('credentials', identity.user_preferences, 'user_preferences');

    // Write all backup charts
    let chartsRestored = 0;
    if (backup.charts?.length > 0) {
        const chartsDb = await openDB('SCC_Charts', 1);
        for (const chart of backup.charts) {
            await chartsDb.put('charts', chart);
        }
        chartsRestored = backup.charts.length;
    }

    // Reset sync state and reinitialize
    resetSync();
    await initServerSync();

    return { chartsRestored };
}
