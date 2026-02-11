/**
 * Chart Storage - IndexedDB persistence for chart data
 *
 * Architecture:
 *   - All chart data in IndexedDB
 *   - No unsaved charts - user must name chart before seeing it
 *   - Auto-save on every STATE_MUTATING event
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
import { isSyncEnabled, getPublicKeyB64 } from '../../Server/init.js';
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
const SAVE_DEBOUNCE_MS = 1000;
const PUSH_QUEUE_KEY = 'syncPushQueue';

function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

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
        console.log('[Storage] Initialized');
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
        const chartId = id || chartState.id || uuid();
        chartState.id = chartId;
        console.log('[Storage] saveChart - chartState.chartKey:', chartState.chartKey?.slice(0, 16) + '...');
        const data = serializeChart(chartId, chartState);
        console.log('[Storage] saveChart - serialized chartKey:', data.chartKey?.slice(0, 16) + '...');

        const saveSize = JSON.stringify(data).length;
        console.log(`[IMPORT DEBUG] saveChart — size: ${saveSize} chars (${(saveSize / 1024).toFixed(1)} KB)`);

        await db.put(STORE_NAME, data);

        console.log(`[Storage] Saved chart: ${chartId}`);
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
    console.log('[LINE SAVE] LOAD 1. loadChart called:', id);
    if (!db) {
        console.warn('[Storage] Database not initialized');
        return false;
    }

    try {
        const data = await db.get(STORE_NAME, id);
        console.log('[LINE SAVE] LOAD 2. IndexedDB PhaseLines count:', Object.keys(data?.PhaseLines || {}).length);
        console.log('[LINE SAVE] LOAD 2b. PhaseLines keys:', Object.keys(data?.PhaseLines || {}));

        if (!data) {
            console.warn(`[Storage] Chart not found: ${id}`);
            return false;
        }

        const idbSize = JSON.stringify(data).length;
        console.log('[IMPORT DEBUG] loadChart — IDB record size:', idbSize, 'chars (' + (idbSize / 1024).toFixed(1) + ' KB)');
        // Flag large keys in loaded data
        for (const [key, val] of Object.entries(data)) {
            try {
                const keySize = JSON.stringify(val).length;
                if (keySize > 1000) {
                    console.log(`[IMPORT DEBUG]   loaded.${key}: ${keySize} chars (${(keySize / 1024).toFixed(1)} KB)`);
                }
            } catch { /* skip */ }
        }

        expandChart(data);
        const wasModified = await migrateChart(data);
        deserializeChart(data);
        chartState.id = id;
        console.log('[LINE SAVE] LOAD 3. After deserialize, chartState.PhaseLines count:', Object.keys(chartState.PhaseLines).length);

        // Save if backwards compat made any migrations
        if (wasModified) {
            await db.put(STORE_NAME, data);
            console.log(`[Storage] Migrated chart: ${id}`);
        }

        console.log(`[Storage] Loaded chart: ${id}`);
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

        return all.map(chart => ({
            id: chart.id,
            chartName: chart.chartName,
            chartType: chart.chartType,
            minuteChart: chart.minuteChart,
            updatedAt: chart.lastModified,
            createdAt: chart._createdAt,
            credits: chart.credits || {},
            tags: chart.tags || [],
            shared: chart.shared || false
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

        console.log(`[Storage] Deleted chart: ${id}`);
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
        console.log(`[Storage] Updated tags for chart: ${id}`);
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

    const chartId = uuid();
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
        console.log(`[Storage] Created chart: ${chartId} (${name})`);
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
        const chartId = uuid();

        // Generate a fresh encryption key for the imported chart
        const cryptoKey = await generateChartKey();
        const chartKey = await exportKeyToHex(cryptoKey);

        console.log('[IMPORT DEBUG] === importChart (chartStorage) START ===');
        console.log('[IMPORT DEBUG] chartData top-level keys:', Object.keys(chartData));
        const inputSize = JSON.stringify(chartData).length;
        console.log('[IMPORT DEBUG] chartData input size:', inputSize, 'chars (' + (inputSize / 1024).toFixed(1) + ' KB)');

        const data = {
            ...chartData,
            startDate: serializeDate(chartData.startDate),
            id: chartId,
            chartKey,
            shared: false,
            lastModified: Math.floor(Date.now() / 1000),
            _createdAt: chartData._createdAt || Math.floor(Date.now() / 1000)
        };

        await migrateChart(data);

        const storedSize = JSON.stringify(data).length;
        console.log('[IMPORT DEBUG] Final IDB data size:', storedSize, 'chars (' + (storedSize / 1024).toFixed(1) + ' KB)');
        // Flag any large keys
        for (const [key, val] of Object.entries(data)) {
            try {
                const keySize = JSON.stringify(val).length;
                if (keySize > 1000) {
                    console.log(`[IMPORT DEBUG]   data.${key}: ${keySize} chars (${(keySize / 1024).toFixed(1)} KB) *** LARGE ***`);
                }
            } catch { /* skip */ }
        }
        console.log('[IMPORT DEBUG] === importChart (chartStorage) END ===');

        await db.put(STORE_NAME, data);
        console.log(`[STORAGE] Imported chart: ${chartId} (${data.chartName || 'Unnamed'})`);
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
 */
function debouncedSaveToIndexedDB() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
        console.log('[LINE SAVE] 4. Debounce fired, PhaseLines count:', Object.keys(chartState.PhaseLines).length);
        if (chartState.id) {
            await saveChart(chartState.id);
            console.log('[LINE SAVE] 5. saveChart completed for id:', chartState.id);
            if ((chartState.shared || isSyncEnabled()) && isInitialized()) {
                // Reconnect WebSocket if it dropped (e.g. after sleep/tab freeze)
                if (chartState.shared && !hasSocket()) {
                    startSyncWatch(chartState.id);
                }
                pushChart(chartState.id)
                    .then(() => drainPushQueue())
                    .catch(err => {
                        console.warn('[Storage] Push failed:', err);
                        queuePush(chartState.id);
                    });
            }
        }
    }, SAVE_DEBOUNCE_MS);
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
    console.log('[LINE SAVE] 3. onStateMutation triggered, PhaseLines count:', Object.keys(chartState.PhaseLines).length);
    if (!chartState.id) {
        console.warn('[Storage] No chart ID - chart should be created before mutations');
        return;
    }
    debouncedSaveToIndexedDB();
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

export async function drainPushQueue() {
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
 * Subscribe to STATE_MUTATING category for auto-save
 */
function subscribeToEvents() {
    // data?.save comes from the emit payload — emitters pass { save: false } to suppress persistence
    eventBus.subscribeToCategory(EVENT_CATEGORIES.STATE_MUTATING, ({ data }) => {
        onStateMutation(data?.save);
    }, true);
    console.log('[Storage] Subscribed to STATE_MUTATING category');
}