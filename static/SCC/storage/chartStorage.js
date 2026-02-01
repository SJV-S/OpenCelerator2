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

import { openDB } from '../lib/idb.js';
import { eventBus, EVENTS, EVENT_CATEGORIES } from '../eventBus.js';
import { chartState } from '../chartState.js';
import { findNearestMonday } from '../util/dates.js';
import { jsonBackwardsCompatibilityCheck } from '../import/jsonBackwardsCompatibility.js';

const DB_NAME = 'SCC_Charts';
const DB_VERSION = 1;
const STORE_NAME = 'charts';

let db = null;
let saveTimeout = null;
const SAVE_DEBOUNCE_MS = 1000;

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
 * Recursively serialize a value, handling Date and NaN
 */
function serializeValue(value) {
    if (value instanceof Date) {
        return { __date__: value.toISOString() };
    }
    if (typeof value === 'number' && Number.isNaN(value)) {
        return '__NaN__';
    }
    if (Array.isArray(value)) {
        return value.map(serializeValue);
    }
    if (typeof value === 'object' && value !== null) {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = serializeValue(v);
        }
        return result;
    }
    return value;
}

/**
 * Convert chartState to a serializable object
 */
function serializeChart(id, state) {
    const serialized = serializeValue(state);
    serialized.id = id;
    serialized._updatedAt = Date.now();
    serialized._createdAt = state._createdAt || serialized._updatedAt;
    return serialized;
}

/**
 * Recursively deserialize a value, restoring Date and NaN
 */
function deserializeValue(value) {
    if (value === '__NaN__') {
        return NaN;
    }
    if (typeof value === 'object' && value !== null && value.__date__) {
        return new Date(value.__date__);
    }
    if (Array.isArray(value)) {
        return value.map(deserializeValue);
    }
    if (typeof value === 'object' && value !== null) {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = deserializeValue(v);
        }
        return result;
    }
    return value;
}

/**
 * Restore chartState from a serialized object
 */
function deserializeChart(data) {
    const deserialized = deserializeValue(data);
    for (const key in deserialized) {
        if (key !== 'id' && key !== '_updatedAt' && key !== '_createdAt') {
            chartState[key] = deserialized[key];
        }
    }
    chartState._createdAt = data._createdAt;
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Initialize the IndexedDB database
 * Call this once at app startup
 */
export async function initStorage() {
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
        const data = serializeChart(chartId, chartState);

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

        jsonBackwardsCompatibilityCheck(data);
        deserializeChart(data);
        chartState.id = id;

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
            updatedAt: chart._updatedAt,
            createdAt: chart._createdAt,
            credits: chart.credits || {},
            tags: chart.tags || []
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
        await db.delete(STORE_NAME, id);

        if (chartState.id === id) {
            chartState.id = null;
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
    const now = Date.now();

    // TODO: Remove test data - to disable hardcoded test data in chartState.js:
    // 1. Uncomment `hasTimestamps: false` below
    // 2. Uncomment the `series: {...}` block below to reset series to empty arrays
    // 3. Uncomment `startDate` below
    // 4. Delete TEST_DATA and its usage in chartState.js
    const data = serializeChart(chartId, {
        ...chartState,
        chartType,
        minuteChart,
        chartName: name.trim(),
        // hasTimestamps: false,  // Commented out for test data - uncomment to disable
        // series: { xValues: [], corrects: [], errors: [], timing: [], misc: {} },
        // startDate,  // Commented out for test data - uncomment to disable
        chartCapacity: 140,
        chartWindow: 140,
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

    saveTimeout = setTimeout(() => {
        if (chartState.id) {
            saveChart(chartState.id);
        }
    }, SAVE_DEBOUNCE_MS);
}

/**
 * Handle state mutation - auto-save to IndexedDB
 * Chart always has an ID (created before user sees it)
 */
function onStateMutation() {
    if (!chartState.id) {
        console.warn('[Storage] No chart ID - chart should be created before mutations');
        return;
    }
    debouncedSaveToIndexedDB();
}

/**
 * Subscribe to STATE_MUTATING category for auto-save
 */
function subscribeToEvents() {
    eventBus.subscribeToCategory(EVENT_CATEGORIES.STATE_MUTATING, onStateMutation);
    console.log('[Storage] Subscribed to STATE_MUTATING category');
}