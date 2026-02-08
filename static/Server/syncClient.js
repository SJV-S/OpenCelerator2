/**
 * Sync client - communicates with /api/sync endpoint
 */

import { encrypt, decrypt, generateChartKey, wrapKey, unwrapKey, deriveKey } from './crypto.js';
import { getUserId, getUserKey } from './passphrase.js';
import { openDB } from '../SCC/lib/idb.js';
import { eventBus, EVENTS } from '../SCC/eventBus.js';
import { connectToChart, disconnectFromChart } from './wsClient.js';

async function getChartFromIndexedDB(chartId) {
    const db = await openDB('SCC_Charts', 1);
    return db.get('charts', chartId);
}

let userKey = null;
let userId = null;
let lastSyncAt = 0;

export async function initSync(passphrase) {
    userId = await getUserId(passphrase);
    userKey = await getUserKey(passphrase);
}

export function isInitialized() {
    return userKey !== null && userId !== null;
}

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
        const encryptedData = await encrypt(chartKey, chart.data);
        const wrappedKey = await wrapKey(chartKey, userKey);

        uploads.push({
            chart_uuid: chart.id,
            data: encryptedData,
            updated_at: now,
            wrapped_key: wrappedKey
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

    const downloads = [];
    for (const item of result.downloads) {
        const chartKey = await unwrapKey(item.wrapped_key, userKey);
        const data = await decrypt(chartKey, item.data);
        downloads.push({
            id: item.chart_uuid,
            data,
            updatedAt: item.updated_at
        });
    }

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

    const downloads = [];
    for (const item of result.downloads) {
        const chartKey = await unwrapKey(item.wrapped_key, userKey);
        const data = await decrypt(chartKey, item.data);
        downloads.push({
            id: item.chart_uuid,
            data,
            updatedAt: item.updated_at
        });
    }

    return { downloads };
}

// NOTE: Full sync not currently in use - charts uploaded individually via share link creation
export async function sync(localCharts) {
    if (!isInitialized()) throw new Error('Sync not initialized - call initSync first');

    // Build upload list with encrypted data
    const uploads = [];
    for (const chart of localCharts) {
        let chartKey;
        if (chart.chartKeyHex) {
            const keyBytes = new Uint8Array(chart.chartKeyHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
            chartKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        } else {
            chartKey = await generateChartKey();
        }
        const encryptedData = await encrypt(chartKey, chart.data);
        const wrappedKey = await wrapKey(chartKey, userKey);

        uploads.push({
            chart_uuid: chart.id,
            data: encryptedData,
            updated_at: chart.updatedAt,
            wrapped_key: wrappedKey
        });
    }

    // Build local manifest
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

    // Decrypt downloads
    const downloads = [];
    for (const item of result.downloads) {
        const chartKey = await unwrapKey(item.wrapped_key, userKey);
        const data = await decrypt(chartKey, item.data);
        downloads.push({
            id: item.chart_uuid,
            data,
            updatedAt: item.updated_at
        });
    }

    return {
        serverManifest: result.server_manifest,
        downloads,
        tombstones: result.tombstones
    };
}

export async function pushChart(chartUuid) {
    const chart = await getChartFromIndexedDB(chartUuid);
    if (!chart) throw new Error('Chart not found in local storage');
    if (!chart.chartKey) throw new Error('Chart has no encryption key');

    const chartKeyBytes = new Uint8Array(chart.chartKey.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const chartKey = await crypto.subtle.importKey('raw', chartKeyBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

    const encryptedData = await encrypt(chartKey, chart);
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
                wrapped_key: wrappedKey
            }]
        })
    });
}

export async function createViewLink(chartUuid) {
    // For now, view links are same as edit links (both editable)
    return createEditLink(chartUuid);
}

export async function createEditLink(chartUuid) {
    const chart = await getChartFromIndexedDB(chartUuid);
    if (!chart) throw new Error('Chart not found in local storage');
    if (!chart.chartKey) throw new Error('Chart has no encryption key - reload the chart first');

    const chartKeyBytes = new Uint8Array(chart.chartKey.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const chartKey = await crypto.subtle.importKey('raw', chartKeyBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

    // Generate share secret and derive key from it
    const shareSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    const shareKey = await deriveKey(shareSecret, chartUuid);

    // Encrypt chart and wrap key for both user and share recipient
    const encryptedData = await encrypt(chartKey, chart);
    const wrappedKeyForUser = await wrapKey(chartKey, userKey);
    const wrappedKeyForShare = await wrapKey(chartKey, shareKey);

    // Upload chart with both wrapped keys
    const response = await fetch('/api/share/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chart_uuid: chartUuid,
            user_id: userId,
            data: encryptedData,
            wrapped_key: wrappedKeyForUser,
            wrapped_key_for_share: wrappedKeyForShare,
            last_modified: chart.lastModified || Math.floor(Date.now() / 1000)
        })
    });
    if (!response.ok) throw new Error(`Failed to create edit link: ${response.status}`);

    // Mark chart as shared locally
    chart.shared = true;
    const db = await openDB('SCC_Charts', 1);
    await db.put('charts', chart);

    return { url: `${window.location.origin}/chart/${chartUuid}/${shareSecret}`, chartKey: chart.chartKey };
}

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

export async function joinSharedChart(chartUuid, shareSecret) {
    // Fetch chart data and wrapped key from server
    const response = await fetch(`/api/chart/${chartUuid}/shared`);
    if (!response.ok) throw new Error(`Failed to fetch shared chart: ${response.status}`);
    const { data, wrapped_key, updated_at } = await response.json();

    // Derive key from share secret
    const shareKey = await deriveKey(shareSecret, chartUuid);

    // Unwrap chart key using share-derived key
    const chartKey = await unwrapKey(wrapped_key, shareKey);

    // Export chart key to hex for storage
    const chartKeyHex = Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', chartKey)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

    // Decrypt chart data
    const chartData = await decrypt(chartKey, data);

    // Mark as shared and store the key
    chartData.id = chartUuid;
    chartData.chartKey = chartKeyHex;
    chartData.shared = true;
    chartData.lastModified = updated_at;

    // Save to local IndexedDB
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
        // If updatedAt provided and not newer than local, skip
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

        // Fetch full data
        const response = await fetch(`/api/chart/${chartId}/shared`);
        if (!response.ok) return false;
        const { data } = await response.json();

        const chartKeyBytes = new Uint8Array(chart.chartKey.match(/.{1,2}/g).map(b => parseInt(b, 16)));
        const chartKey = await crypto.subtle.importKey('raw', chartKeyBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const chartData = await decrypt(chartKey, data);

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

export async function startSyncPolling(chartId) {
    stopSyncPolling();

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

export function stopSyncPolling() {
    disconnectFromChart();
}

export { userId, userKey };