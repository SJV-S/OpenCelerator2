/**
 * Chart Storage - IndexedDB persistence for chart data
 *
 * Architecture:
 *   - All chart data in IndexedDB
 *   - No unsaved charts - user must name chart before seeing it
 *   - Auto-save on every STATE_MUTATING and PRESENTATION event
 *   - PRESENTATION events (visibility toggles) only sync to server for shared charts
 *
 * Flow:
 *   1. Menu page: "New Chart" → prompt name → createChart() → navigate to chart
 *   2. Chart page: loadChart(id) → auto-saves on mutations
 *   3. Menu page: "Load Chart" → navigate with ?load=id
 *
 * Usage:
 *   import { initStorage, createChart, loadChart, listCharts, deleteChart } from './storage/chartStorage.js';
 *
 *   await initStorage();
 *   const id = await createChart('My Chart', 'Daily', true);  // Create new chart
 *   await loadChart('chart-id');                               // Load existing chart
 *   const charts = await listCharts();                         // Get all saved charts
 *   await deleteChart('chart-id');                             // Delete a chart
 */

import { openDB } from '../../lib/idb.js';
import { eventBus, EVENTS, EVENT_CATEGORIES } from '../eventBus.js';
import { chartState } from '../chartState.js';
import { CHART_TYPE_CONFIG } from '../config.js';
import { findNearestMonday, serializeDate, deserializeDate } from '../util/dates.js';
import { migrateChart } from '../import/jsonBackwardsCompatibility.js';
import { compactChart, expandChart } from './compactJson.js';
import { generateChartKey } from '../../Server/crypto.js';
import { pushChart, isInitialized, isChartOwner, startSyncWatch, leaveChart as syncLeaveChart, deleteChart as syncDeleteChart } from '../../Server/syncClient.js';
import { isSyncEnabled, getPublicKeyB64, getDisplayName } from '../../Server/init.js';
import { hasSocket } from '../../Server/wsClient.js';

// Convert CryptoKey to hex string for storage
async function exportKeyToHex(key) {
    const raw = await crypto.subtle.exportKey('raw', key);
    return Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const DB_NAME = 'SCC_Charts';
const DB_VERSION = 1;
const STORE_NAME = 'charts';

let db = null;
let saveTimeout = null;
let syncPushTimeout = null;
const SAVE_DEBOUNCE_MS = 1000;
const SYNC_PUSH_DEBOUNCE_MS = 30000;
const PUSH_QUEUE_KEY = 'syncPushQueue';
// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * Convert chartState to a serializable object for IndexedDB.
 * startDate is the only value needing explicit conversion (Date → ISO string).
 * Series arrays use null for missing data, which IDB handles natively.
 */
function serializeChart(id, state) {
    const serialized = { ...state };
    serialized.id = id;
    serialized.startDate = serializeDate(state.startDate);
    serialized.lastModified = Math.floor(Date.now() / 1000);
    serialized._createdAt = state._createdAt || serialized.lastModified;
    compactChart(serialized);
    return serialized;
}

/**
 * Restore chartState from a serialized object.
 * startDate is the only value needing explicit restoration (ISO string → Date).
 */
function deserializeChart(data) {
    for (const key in data) {
        if (key !== 'id' && key !== '_createdAt') {
            chartState[key] = data[key];
        }
    }
    chartState._createdAt = data._createdAt;
    chartState.startDate = deserializeDate(chartState.startDate);
    if (chartState.LineCuts) {
        for (const cut of Object.values(chartState.LineCuts)) {
            if (cut.date && !(cut.date instanceof Date)) {
                cut.date = new Date(cut.date);
            }
        }
    }
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Initialize the IndexedDB database
 * Call this once at app startup
 */
export async function initStorage() {
    if (db) return true;

    try {
        db = await openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('updatedAt', 'metadata.updatedAt');
                    store.createIndex('chartName', 'metadata.chartName');
                }
            }
        });

        subscribeToEvents();
        return true;
    } catch (error) {
        console.error('[Storage] Init failed:', error);
        eventBus.emit(EVENTS.STORAGE_ERROR, { operation: 'init', error });
        return false;
    }
}

/**
 * Save current chartState to IndexedDB
 * @param {string} [id] - Chart ID (generates new if not provided)
 * @returns {Promise<string>} The chart ID
 */
export async function saveChart(id = null) {
    if (!db) {
        console.warn('[Storage] Database not initialized');
        return null;
    }

    try {
        const chartId = id || chartState.id || crypto.randomUUID();
        chartState.id = chartId;
        const data = serializeChart(chartId, chartState);

        await db.put(STORE_NAME, data);

        eventBus.emit(EVENTS.STORAGE_CHART_SAVED, { id: chartId, name: data.chartName });
        return chartId;
    } catch (error) {
        console.error('[Storage] Save failed:', error);
        eventBus.emit(EVENTS.STORAGE_ERROR, { operation: 'save', error });
        return null;
    }
}

/**
 * Load a chart from IndexedDB into chartState
 * @param {string} id - Chart ID to load
 * @returns {Promise<boolean>} Success status
 */
export async function loadChart(id) {
    if (!db) {
        console.warn('[Storage] Database not initialized');
        return false;
    }

    try {
        const data = await db.get(STORE_NAME, id);

        if (!data) {
            console.warn(`[Storage] Chart not found: ${id}`);
            return false;
        }

        expandChart(data);
        const wasModified = await migrateChart(data);
        deserializeChart(data);
        chartState.id = id;

        // Save if backwards compat made any migrations
        if (wasModified) {
            await db.put(STORE_NAME, data);
        }

        eventBus.emit(EVENTS.STORAGE_CHART_LOADED, { id, name: data.chartName });
        return true;
    } catch (error) {
        console.error('[Storage] Load failed:', error);
        eventBus.emit(EVENTS.STORAGE_ERROR, { operation: 'load', error });
        return false;
    }
}

/**
 * List all saved charts
 * @returns {Promise<Array>} Array of { id, chartName, chartType, updatedAt }
 */
export async function listCharts() {
    if (!db) {
        console.warn('[Storage] Database not initialized');
        return [];
    }

    try {
        const all = await db.getAll(STORE_NAME);

        // Get user's public key for ownership detection (cache → IndexedDB fallback)
        let myKey = getPublicKeyB64();
        if (!myKey) {
            const identityDb = await openDB('SCC_Identity', 1);
            myKey = await identityDb.get('credentials', 'publicKey');
            identityDb.close();
        }

        return all.map(chart => ({
            id: chart.id,
            chartName: chart.chartName,
            chartType: chart.chartType,
            minuteChart: chart.minuteChart,
            updatedAt: chart.lastModified,
            createdAt: chart._createdAt,
            credits: chart.credits || {},
            tags: chart.tags || [],
            shared: chart.shared || false,
            acceptingEdits: chart.acceptingEdits || false,
            isOwner: !!(chart.shared && myKey && chart.publicKey === myKey),
            collaborators: chart.collaborators || [],
            ownerName: chart.ownerName || ''
        })).sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
        console.error('[Storage] List failed:', error);
        eventBus.emit(EVENTS.STORAGE_ERROR, { operation: 'list', error });
        return [];
    }
}

/**
 * Delete a chart from IndexedDB
 * @param {string} id - Chart ID to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteChart(id) {
    if (!db) {
        console.warn('[Storage] Database not initialized');
        return false;
    }

    try {
        // Check if chart is shared before deleting from IDB
        const chart = await db.get(STORE_NAME, id);
        const wasShared = chart?.shared;

        await db.delete(STORE_NAME, id);

        if (chartState.id === id) {
            chartState.id = null;
        }

        if (isInitialized()) {
            if (wasShared) {
                // Leave the shared chart on the server (fire-and-forget)
                syncLeaveChart(id).catch(err =>
                    console.warn('[Storage] leaveChart failed:', err)
                );
            } else if (isSyncEnabled()) {
                // Delete on server so other devices get the tombstone
                syncDeleteChart(id).catch(err =>
                    console.warn('[Storage] server deleteChart failed:', err)
                );
            }
        }

        eventBus.emit(EVENTS.STORAGE_CHART_DELETED, { id });
        return true;
    } catch (error) {
        console.error('[Storage] Delete failed:', error);
        eventBus.emit(EVENTS.STORAGE_ERROR, { operation: 'delete', error });
        return false;
    }
}

/**
 * Update tags for a chart (without loading it into chartState)
 * Tags are normalized to lowercase for case-insensitive matching
 * @param {string} id - Chart ID
 * @param {string[]} tags - Array of tags
 * @returns {Promise<boolean>} Success status
 */
export async function updateChartTags(id, tags) {
    if (!db) {
        console.warn('[Storage] Database not initialized');
        return false;
    }

    try {
        const data = await db.get(STORE_NAME, id);
        if (!data) {
            console.warn(`[Storage] Chart not found: ${id}`);
            return false;
        }

        // Normalize tags: lowercase, trim, remove duplicates and empties
        const normalizedTags = [...new Set(
            tags
                .map(t => t.toLowerCase().trim())
                .filter(t => t.length > 0)
        )];

        data.tags = normalizedTags;

        await db.put(STORE_NAME, data);
        return true;
    } catch (error) {
        console.error('[Storage] Update tags failed:', error);
        eventBus.emit(EVENTS.STORAGE_ERROR, { operation: 'updateTags', error });
        return false;
    }
}

/**
 * Create a new chart with a name and save to IndexedDB
 * @param {string} name - Chart name (required)
 * @param {string} chartType - Chart type (Daily, Weekly, etc.)
 * @param {boolean} minuteChart - Whether this is a minute chart
 * @returns {Promise<string|null>} The chart ID or null on failure
 */
export async function createChart(name, chartType, minuteChart) {
    if (!db) {
        console.warn('[Storage] Database not initialized');
        return null;
    }

    if (!name || !name.trim()) {
        console.warn('[Storage] Chart name required');
        return null;
    }

    const chartId = crypto.randomUUID();
    const startDate = findNearestMonday(new Date());
    startDate.setHours(0, 0, 0, 0);
    const now = Math.floor(Date.now() / 1000);

    // Generate encryption key for this chart
    const cryptoKey = await generateChartKey();
    const chartKey = await exportKeyToHex(cryptoKey);

    // In-memory cache first, fall back to IndexedDB (base.html persists it before modules run)
    let publicKey = getPublicKeyB64();
    if (!publicKey) {
        const identityDb = await openDB('SCC_Identity', 1);
        publicKey = await identityDb.get('credentials', 'publicKey');
        identityDb.close();
    }
    if (!publicKey) {
        console.error('[Storage] No public key available — cannot create chart');
        return null;
    }

    const data = serializeChart(chartId, {
        ...chartState,
        chartType,
        minuteChart,
        chartName: name.trim(),
        chartKey,
        publicKey,
        shared: false,
        hasTimestamps: false,
        series: { xValues: [], corrects: [], errors: [], timing: [], misc: {} },
        startDate,
        chartCapacity: CHART_TYPE_CONFIG[chartType]?.capacity || 280,
        chartWindow: (CHART_TYPE_CONFIG[chartType]?.capacity || 280) / 2,
        _createdAt: now
    });

    try {
        await db.put(STORE_NAME, data);
        eventBus.emit(EVENTS.STORAGE_CHART_SAVED, { id: chartId, name });
        return chartId;
    } catch (error) {
        console.error('[Storage] Create failed:', error);
        eventBus.emit(EVENTS.STORAGE_ERROR, { operation: 'create', error });
        return null;
    }
}

/**
 * Import a chart from a raw chart object (for JSON imports)
 * Assigns a new ID and saves directly to IndexedDB without affecting chartState
 * @param {object} chartData - Full chart data object
 * @returns {Promise<string|null>} The chart ID or null on failure
 */
export async function importChart(chartData) {
    if (!db) {
        console.warn('[Storage] Database not initialized');
        return null;
    }

    if (!chartData || typeof chartData !== 'object') {
        console.warn('[Storage] Invalid chart data');
        return null;
    }

    try {
        const chartId = crypto.randomUUID();

        // Generate a fresh encryption key for the imported chart
        const cryptoKey = await generateChartKey();
        const chartKey = await exportKeyToHex(cryptoKey);

        const data = {
            ...chartData,
            startDate: serializeDate(chartData.startDate),
            id: chartId,
            chartKey,
            shared: false,
            acceptingEdits: false,
            publicKey: getPublicKeyB64(),
            ownerName: await getDisplayName(),
            lastModified: Math.floor(Date.now() / 1000),
            _createdAt: chartData._createdAt || Math.floor(Date.now() / 1000)
        };

        await migrateChart(data);

        await db.put(STORE_NAME, data);
        eventBus.emit(EVENTS.STORAGE_CHART_SAVED, { id: chartId, name: data.chartName });
        return chartId;
    } catch (error) {
        console.error('[Storage] Import failed:', error);
        eventBus.emit(EVENTS.STORAGE_ERROR, { operation: 'import', error });
        return null;
    }
}

// ============================================================================
// Auto-save via Event Subscriptions
// ============================================================================

/**
 * Debounced IndexedDB save - waits for activity to settle
 * @param {boolean} [sync=true] - Whether to trigger server sync after save
 */
function debouncedSaveToIndexedDB(sync = true) {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
        if (chartState.id) {
            await saveChart(chartState.id);
            if (!sync) return;
            if (chartState.shared && isInitialized()) {
                // Reconnect WebSocket if it dropped (e.g. after sleep/tab freeze)
                if (!hasSocket()) {
                    startSyncWatch(chartState.id);
                }
                pushChart(chartState.id)
                    .then(() => drainPushQueue())
                    .catch(err => {
                        console.warn('[Storage] Push failed:', err);
                        queuePush(chartState.id);
                    });
            } else if (isSyncEnabled() && isInitialized()) {
                scheduleSyncPush(chartState.id);
            }
        }
    }, SAVE_DEBOUNCE_MS);
}

/**
 * Debounced server push for non-shared charts.
 * Resets on each call so the push only fires once editing settles for 30s.
 */
function scheduleSyncPush(chartId) {
    if (syncPushTimeout) {
        clearTimeout(syncPushTimeout);
    }
    syncPushTimeout = setTimeout(() => {
        syncPushTimeout = null;
        pushChart(chartId)
            .then(() => drainPushQueue())
            .catch(err => {
                console.warn('[Storage] Lazy push failed:', err);
                queuePush(chartId);
            });
    }, SYNC_PUSH_DEBOUNCE_MS);
}

/**
 * Handle state mutation - auto-save to IndexedDB
 * Chart always has an ID (created before user sees it)
 * @param {boolean} save - When false, skip persistence (e.g. render-only events during init)
 */
function onStateMutation(save = true) {
    if (!save) return;
    // Don't persist mutations on view-only charts we don't own
    if (!isChartOwner(chartState) && !chartState.acceptingEdits) return;
    if (!chartState.id) {
        console.warn('[Storage] No chart ID - chart should be created before mutations');
        return;
    }
    debouncedSaveToIndexedDB();
}

/**
 * Handle presentation mutation (visibility toggles) - save locally, only sync shared charts.
 * Non-shared charts skip server push since these are viewing preferences, not data changes.
 * @param {boolean} save - When false, skip persistence (e.g. render-only events during init)
 */
function onPresentationMutation(save = true) {
    if (!save) return;
    if (!isChartOwner(chartState) && !chartState.acceptingEdits) return;
    if (!chartState.id) {
        console.warn('[Storage] No chart ID - chart should be created before mutations');
        return;
    }
    debouncedSaveToIndexedDB(chartState.shared);
}

// ============================================================================
// Push Queue - persists failed pushes for retry when back online
// ============================================================================

function queuePush(chartId) {
    try {
        const queue = JSON.parse(localStorage.getItem(PUSH_QUEUE_KEY) || '[]');
        if (!queue.includes(chartId)) {
            queue.push(chartId);
            localStorage.setItem(PUSH_QUEUE_KEY, JSON.stringify(queue));
        }
    } catch (err) {
        console.warn('[Storage] Failed to queue push:', err);
    }
}

async function drainPushQueue() {
    if (!isSyncEnabled() || !isInitialized()) return;

    let queue;
    try {
        queue = JSON.parse(localStorage.getItem(PUSH_QUEUE_KEY) || '[]');
    } catch { return; }

    if (queue.length === 0) return;

    const failed = [];
    for (const chartId of queue) {
        try {
            await pushChart(chartId);
        } catch {
            failed.push(chartId);
        }
    }
    localStorage.setItem(PUSH_QUEUE_KEY, JSON.stringify(failed));
}

/**
 * Subscribe to event categories for auto-save
 */
function subscribeToEvents() {
    // data?.save comes from the emit payload — emitters pass { save: false } to suppress persistence
    eventBus.subscribeToCategory(EVENT_CATEGORIES.STATE_MUTATING, ({ data }) => {
        onStateMutation(data?.save);
    }, true);

    // PRESENTATION events (visibility toggles): always save locally, only sync for shared charts
    eventBus.subscribeToCategory(EVENT_CATEGORIES.PRESENTATION, ({ data }) => {
        onPresentationMutation(data?.save);
    }, true);

    // Drain push queue on sync initialization (every page load) and server reconnect
    eventBus.subscribe(EVENTS.SYNC_READY, () => drainPushQueue());
    eventBus.subscribe(EVENTS.SYNC_SERVER_RECONNECTED, () => drainPushQueue());

    // Queue any pending lazy sync push when page becomes hidden (tab switch, minimize, close)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && syncPushTimeout) {
            clearTimeout(syncPushTimeout);
            syncPushTimeout = null;
            queuePush(chartState.id);
        }
    });
}