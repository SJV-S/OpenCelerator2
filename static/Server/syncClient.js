/**
 * Sync client - communicates with /api/sync endpoint
 * Signs all pushes with ECDSA, verifies pulls based on chart ownership policy
 */

import { encrypt, decrypt, generateChartKey, wrapKey, unwrapKey, deriveKey, sign, verify, importPublicKey } from './crypto.js';
import { getUserId, getUserKey } from './passphrase.js';
import { openDB } from '../lib/idb.js';
import { eventBus, EVENTS } from '../SCC/eventBus.js';
import { connectToChart, disconnectFromChart } from './wsClient.js';

async function getChartFromIndexedDB(chartId) {
    const db = await openDB('SCC_Charts', 1);
    return db.get('charts', chartId);
}

let userKey = null;
let userId = null;
let lastSyncAt = 0;
let signingPrivateKey = null;   // CryptoKey (ECDSA P-256), set by initSync
let signingPublicKeyB64 = null; // base64 string (for embedding in chart JSON), set by initSync
let signingPublicKey = null;    // CryptoKey (for verification), set by initSync
let signingDisplayName = null;  // Human-readable owner name (display only), set by initSync

export async function initSync(passphrase, privateKey, publicKeyB64, displayName = null) {
    userId = await getUserId(passphrase);
    userKey = await getUserKey(passphrase);
    signingPrivateKey = privateKey;
    signingPublicKeyB64 = publicKeyB64;
    signingPublicKey = await importPublicKey(publicKeyB64);
    signingDisplayName = displayName || null;
}

export function setSigningDisplayName(name) {
    signingDisplayName = name || null;
}

export function isInitialized() {
    return userKey !== null && userId !== null;
}

// ============================================================================
// Signature Verification (Pull Policy)
// ============================================================================

const _writeBackInProgress = new Set();

/**
 * Verify a pulled chart according to the signing policy.
 * @param {string} encryptedDataHex - The encrypted payload hex string
 * @param {string|null} signatureHex - The signature hex string (null for legacy)
 * @param {object} chartData - The decrypted chart data
 * @param {object|null} localChart - The local IDB chart (null for first pull/join)
 * @returns {{ accepted: boolean, reason?: string }}
 */
async function verifyPull(encryptedDataHex, signatureHex, chartData, localChart) {
    // Legacy chart: no publicKey means pre-signing era — accept without verification
    if (!chartData.publicKey) {
        return { accepted: true };
    }

    if (!signatureHex) {
        return { accepted: false, reason: 'Missing signature on signed chart' };
    }

    if (chartData.publicKey === signingPublicKeyB64) {
        if (!await verify(encryptedDataHex, signatureHex, signingPublicKey)) {
            return { accepted: false, reason: 'Signature does not match owner key' };
        }
    } else if (chartData.acceptingEdits) {
        // Edit link: skip verification, accept any push
    } else {
        const ownerPub = await importPublicKey(chartData.publicKey);
        if (!await verify(encryptedDataHex, signatureHex, ownerPub)) {
            return { accepted: false, reason: 'Signature verification failed for view-only chart' };
        }
    }

    // Monotonic timestamp: reject if remote is older than local (replay protection)
    if (localChart?.lastModified && chartData.lastModified && chartData.lastModified < localChart.lastModified) {
        return { accepted: false, reason: 'Replay detected: remote lastModified older than local' };
    }

    return { accepted: true };
}

/**
 * Write-back: re-push local version to overwrite invalid server data.
 * Guarded by a Set to prevent infinite loops.
 */
async function writeBack(chartUuid) {
    if (_writeBackInProgress.has(chartUuid)) return;
    _writeBackInProgress.add(chartUuid);
    try {
        await pushChart(chartUuid);
    } catch (e) {
        console.warn('[Sync] Write-back failed:', e);
    } finally {
        _writeBackInProgress.delete(chartUuid);
    }
}

/**
 * Sign encrypted data with client's ECDSA private key.
 * Returns hex signature string, or null if signing key not available.
 */
async function signPayload(encryptedDataHex) {
    if (!signingPrivateKey) return null;
    return sign(encryptedDataHex, signingPrivateKey);
}

/**
 * Stamp signing identity on chart data before encryption.
 * Sets publicKey on new charts or charts we own. Cleans up legacy owner field.
 */
function stampOwnerFields(chart) {
    delete chart.owner;
    if (!chart.publicKey || chart.publicKey === signingPublicKeyB64) {
        chart.publicKey = signingPublicKeyB64;
        chart.ownerName = signingDisplayName;
    }
}

/**
 * Process downloaded items: unwrap, decrypt, verify, collect accepted charts.
 * Triggers write-back for rejected pulls that have a local version.
 */
async function processDownloads(items) {
    const accepted = [];
    for (const item of items) {
        const chartKey = await unwrapKey(item.wrapped_key, userKey);
        const data = await decrypt(chartKey, item.data);

        const localChart = await getChartFromIndexedDB(item.chart_uuid);
        const verification = await verifyPull(item.data, item.signature, data, localChart);

        if (verification.accepted) {
            accepted.push({ id: item.chart_uuid, data, updatedAt: item.updated_at });
        } else {
            console.warn(`[Sync] Rejected pull for ${item.chart_uuid}: ${verification.reason}`);
            if (localChart) writeBack(item.chart_uuid);
        }
    }
    return accepted;
}

// ============================================================================
// Push Paths (All Signed)
// ============================================================================

export async function uploadCharts(localCharts) {
    if (!isInitialized()) throw new Error('Sync not initialized - call initSync first');

    const now = Math.floor(Date.now() / 1000);
    const uploads = [];
    for (const chart of localCharts) {
        let chartKey;
        if (chart.chartKeyHex) {
            const keyBytes = new Uint8Array(chart.chartKeyHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
            chartKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        } else {
            chartKey = await generateChartKey();
        }
        stampOwnerFields(chart.data);
        const encryptedData = await encrypt(chartKey, chart.data);
        const signature = await signPayload(encryptedData);
        const wrappedKey = await wrapKey(chartKey, userKey);

        uploads.push({
            chart_uuid: chart.id,
            data: encryptedData,
            updated_at: now,
            wrapped_key: wrappedKey,
            signature
        });
    }

    const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: userId,
            last_sync_at: 0,
            local_manifest: [],
            uploads
        })
    });

    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
}

export async function pullCharts() {
    if (!isInitialized()) throw new Error('Sync not initialized - call initSync first');

    const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: userId,
            last_sync_at: lastSyncAt,
            local_manifest: [],
            uploads: []
        })
    });

    if (!response.ok) throw new Error(`Pull failed: ${response.status}`);

    const result = await response.json();
    lastSyncAt = Math.floor(Date.now() / 1000);

    const downloads = await processDownloads(result.downloads);
    return { downloads, serverManifest: result.server_manifest, tombstones: result.tombstones };
}

export async function checkForUpdates(localManifest) {
    if (!isInitialized()) throw new Error('Sync not initialized - call initSync first');

    const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: userId,
            local_manifest: localManifest,
            uploads: []
        })
    });

    if (!response.ok) throw new Error(`Sync check failed: ${response.status}`);

    const result = await response.json();

    const downloads = await processDownloads(result.downloads);
    return { downloads };
}

// NOTE: Full sync not currently in use - charts uploaded individually via share link creation
export async function sync(localCharts) {
    if (!isInitialized()) throw new Error('Sync not initialized - call initSync first');

    const uploads = [];
    for (const chart of localCharts) {
        let chartKey;
        if (chart.chartKeyHex) {
            const keyBytes = new Uint8Array(chart.chartKeyHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
            chartKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        } else {
            chartKey = await generateChartKey();
        }
        stampOwnerFields(chart.data);
        const encryptedData = await encrypt(chartKey, chart.data);
        const signature = await signPayload(encryptedData);
        const wrappedKey = await wrapKey(chartKey, userKey);

        uploads.push({
            chart_uuid: chart.id,
            data: encryptedData,
            updated_at: chart.updatedAt,
            wrapped_key: wrappedKey,
            signature
        });
    }

    const localManifest = localCharts.map(c => ({ chart_uuid: c.id, updated_at: c.updatedAt }));

    const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: userId,
            last_sync_at: lastSyncAt,
            local_manifest: localManifest,
            uploads
        })
    });

    if (!response.ok) throw new Error(`Sync failed: ${response.status}`);

    const result = await response.json();
    lastSyncAt = Math.floor(Date.now() / 1000);

    const downloads = await processDownloads(result.downloads);
    return { serverManifest: result.server_manifest, downloads, tombstones: result.tombstones };
}

export async function pushChart(chartUuid) {
    const chart = await getChartFromIndexedDB(chartUuid);
    if (!chart) throw new Error('Chart not found in local storage');
    if (!chart.chartKey) throw new Error('Chart has no encryption key');

    if (chart.publicKey && chart.publicKey !== signingPublicKeyB64 && !chart.acceptingEdits) return;

    const chartKeyBytes = new Uint8Array(chart.chartKey.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const chartKey = await crypto.subtle.importKey('raw', chartKeyBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

    // Stamp identity for signature verification
    stampOwnerFields(chart);

    const encryptedData = await encrypt(chartKey, chart);
    const signature = await signPayload(encryptedData);
    const wrappedKey = await wrapKey(chartKey, userKey);

    const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: userId,
            local_manifest: [],
            uploads: [{
                chart_uuid: chartUuid,
                data: encryptedData,
                updated_at: chart.lastModified || Math.floor(Date.now() / 1000),
                wrapped_key: wrappedKey,
                signature
            }]
        })
    });
}

// ============================================================================
// Share Link Creation
// ============================================================================

export async function createViewLink(chartUuid) {
    return _createShareLink(chartUuid, false);
}

export async function createEditLink(chartUuid) {
    return _createShareLink(chartUuid, true);
}

async function _createShareLink(chartUuid, acceptingEdits) {
    const chart = await getChartFromIndexedDB(chartUuid);
    if (!chart) throw new Error('Chart not found in local storage');
    if (!chart.chartKey) throw new Error('Chart has no encryption key - reload the chart first');

    const chartKeyBytes = new Uint8Array(chart.chartKey.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const chartKey = await crypto.subtle.importKey('raw', chartKeyBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

    // Set sharing policy in chart data (inside encrypted blob)
    chart.acceptingEdits = acceptingEdits;
    stampOwnerFields(chart);

    const shareSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    const shareKey = await deriveKey(shareSecret, chartUuid);

    // Encrypt chart and wrap key for both user and share recipient
    const encryptedData = await encrypt(chartKey, chart);
    const signature = await signPayload(encryptedData);
    const wrappedKeyForUser = await wrapKey(chartKey, userKey);
    const wrappedKeyForShare = await wrapKey(chartKey, shareKey);

    const response = await fetch('/api/share/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chart_uuid: chartUuid,
            user_id: userId,
            data: encryptedData,
            wrapped_key: wrappedKeyForUser,
            wrapped_key_for_share: wrappedKeyForShare,
            last_modified: chart.lastModified || Math.floor(Date.now() / 1000),
            signature
        })
    });
    if (!response.ok) throw new Error(`Failed to create share link: ${response.status}`);

    chart.shared = true;
    const db = await openDB('SCC_Charts', 1);
    await db.put('charts', chart);

    return { url: `${window.location.origin}/chart/${chartUuid}/${shareSecret}`, chartKey: chart.chartKey };
}

// ============================================================================
// Chart Management
// ============================================================================

export async function deleteChart(chartUuid) {
    const response = await fetch('/api/chart', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart_uuid: chartUuid, user_id: userId })
    });
    return response.ok;
}

export async function leaveChart(chartUuid) {
    const response = await fetch('/api/chart/leave', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart_uuid: chartUuid, user_id: userId })
    });
    return response.ok;
}

// ============================================================================
// Shared Chart Access & Sync
// ============================================================================

export async function joinSharedChart(chartUuid, shareSecret) {
    const response = await fetch(`/api/chart/${chartUuid}/shared`);
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch shared chart: ${response.status}`);
    }
    const { data, wrapped_key, updated_at, signature: signatureHex } = await response.json();

    const shareKey = await deriveKey(shareSecret, chartUuid);
    const chartKey = await unwrapKey(wrapped_key, shareKey);
    const chartKeyHex = Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', chartKey)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

    const chartData = await decrypt(chartKey, data);

    // First join — no local chart for timestamp check
    const verification = await verifyPull(data, signatureHex, chartData, null);
    if (!verification.accepted) {
        throw new Error(`Join rejected: ${verification.reason}`);
    }

    chartData.id = chartUuid;
    chartData.chartKey = chartKeyHex;
    chartData.shared = true;
    chartData.lastModified = updated_at;

    const db = await openDB('SCC_Charts', 1);
    await db.put('charts', chartData);

    return chartData;
}

export async function syncChart(chartId, updatedAt = null) {
    if (!isInitialized()) return false;

    const db = await openDB('SCC_Charts', 1);
    const chart = await db.get('charts', chartId);
    if (!chart || !chart.shared || !chart.chartKey) return false;

    try {
        if (updatedAt !== null && updatedAt <= (chart.lastModified || 0)) {
            return false;
        }

        // If updatedAt is null (reconnect or initial), use poll endpoint to check
        if (updatedAt === null) {
            const pollResponse = await fetch(`/api/chart/${chartId}/poll?t=${chart.lastModified || 0}`);
            if (!pollResponse.ok) return false;
            const pollData = await pollResponse.json();
            if (!pollData.changed) return false;
            updatedAt = pollData.updated_at;
        }

        const response = await fetch(`/api/chart/${chartId}/shared`);
        if (!response.ok) return false;
        const { data, signature: signatureHex } = await response.json();

        const chartKeyBytes = new Uint8Array(chart.chartKey.match(/.{1,2}/g).map(b => parseInt(b, 16)));
        const chartKey = await crypto.subtle.importKey('raw', chartKeyBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const chartData = await decrypt(chartKey, data);

        const verification = await verifyPull(data, signatureHex, chartData, chart);
        if (!verification.accepted) {
            console.warn(`[Sync] Rejected sync for ${chartId}: ${verification.reason}`);
            writeBack(chartId);
            return false;
        }

        chartData.id = chartId;
        chartData.chartKey = chart.chartKey;
        chartData.shared = true;
        chartData.lastModified = updatedAt;

        await db.put('charts', chartData);
        eventBus.emit(EVENTS.SYNC_CHART_UPDATED, { chartId, chartData });
        return true;
    } catch (err) {
        console.warn(`[Sync] Failed:`, err);
        return false;
    }
}

export async function startSyncWatch(chartId) {
    stopSyncWatch();

    // Initial sync check
    syncChart(chartId);

    // Only open WebSocket for shared charts
    const db = await openDB('SCC_Charts', 1);
    const chart = await db.get('charts', chartId);
    if (chart && chart.shared && chart.chartKey) {
        connectToChart(chartId, ({ chartUuid, updatedAt }) => {
            syncChart(chartUuid, updatedAt);
        });
    }
}

export function stopSyncWatch() {
    disconnectFromChart();
}

export function isChartOwner(chart) {
    return !chart.publicKey || chart.publicKey === signingPublicKeyB64;
}

export { userId, userKey };
