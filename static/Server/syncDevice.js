/**
 * Sync Device - Identity switching and pull operations
 *
 * Handles switching to a different sync passphrase (different identity)
 * and pulling charts for the current identity.
 */

import { openDB } from '../lib/idb.js';
import { initSync, pullCharts } from './syncClient.js';
import { resetSync, initServerSync } from './init.js';

/**
 * Get the stored passphrase from SCC_Identity.
 * @returns {Promise<string|null>}
 */
export async function getStoredPassphrase() {
    try {
        const db = await openDB('SCC_Identity', 1);
        return await db.get('credentials', 'passphrase');
    } catch {
        return null;
    }
}

/**
 * Switch to a new identity by writing a new passphrase and pulling its charts.
 * @param {string} newPassphrase
 * @param {{discardExisting: boolean}} options
 * @returns {Promise<{downloads: number}>}
 */
export async function switchIdentity(newPassphrase, { discardExisting }) {
    if (discardExisting) {
        const chartsDb = await openDB('SCC_Charts', 1);
        const tx = chartsDb.transaction('charts', 'readwrite');
        await tx.objectStore('charts').clear();
        await tx.done;
    }

    // Write new passphrase to SCC_Identity
    const identityDb = await openDB('SCC_Identity', 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('credentials')) {
                db.createObjectStore('credentials');
            }
        }
    });
    await identityDb.put('credentials', newPassphrase, 'passphrase');

    // Reset and reinitialize sync with new passphrase
    resetSync();
    await initSync(newPassphrase);

    // Pull all charts for the new identity
    const result = await pullCharts();
    const downloads = result.downloads;

    // Store each downloaded chart in IndexedDB with original IDs
    if (downloads.length > 0) {
        const chartsDb = await openDB('SCC_Charts', 1);
        for (const dl of downloads) {
            const chartData = dl.data;
            chartData.id = dl.id;
            chartData.shared = true;
            chartData.lastModified = dl.updatedAt;
            await chartsDb.put('charts', chartData);
        }
    }

    return { downloads: downloads.length };
}

/**
 * Pull charts for the current identity (same passphrase, no switch).
 * @returns {Promise<{downloads: number}>}
 */
export async function pullCurrentIdentity() {
    await initServerSync();
    const result = await pullCharts();

    if (result.downloads.length > 0) {
        const chartsDb = await openDB('SCC_Charts', 1);
        for (const dl of result.downloads) {
            const chartData = dl.data;
            chartData.id = dl.id;
            chartData.shared = true;
            chartData.lastModified = dl.updatedAt;
            await chartsDb.put('charts', chartData);
        }
    }

    return { downloads: result.downloads.length };
}
