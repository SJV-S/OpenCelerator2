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

const DB_NAME = 'SCC_Charts';
const DB_VERSION = 1;
const STORE_NAME = 'charts';

let db = null;
let saveTimeout = null;
const SAVE_DEBOUNCE_MS = 1000;

// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * Convert chartState to a serializable object
 * Handles Date objects and NaN values
 */
function serializeChart(id, state) {
    const now = Date.now();

    return {
        id,
        metadata: {
            chartType: state.chartType,
            minuteChart: state.minuteChart,
            chartName: state.chartName,
            hasTimestamps: state.hasTimestamps,
            startDate: state.startDate instanceof Date
                ? state.startDate.toISOString()
                : state.startDate,
            chartCapacity: state.chartCapacity,
            chartWindow: state.chartWindow,
            createdAt: state._createdAt || now,
            updatedAt: now
        },
        series: serializeSeries(state.series),
        lines: {
            phaseLines: serializeLines(state.PhaseLines),
            aimLines: serializeLines(state.AimLines),
            celLines: serializeLines(state.CelLines),
            lineCuts: state.LineCuts
        },
        config: {
            lineVisibility: { ...state.lineVisibility },
            fanVisible: state.fanVisible,
            lineStyles: JSON.parse(JSON.stringify(state.lineStyles)),
            traceStyles: JSON.parse(JSON.stringify(state.traceStyles)),
            legend: JSON.parse(JSON.stringify(state.legend)),
            credits: { ...state.credits }
        }
    };
}

/**
 * Serialize series data, converting NaN to null marker
 */
function serializeSeries(series) {
    const replaceNaN = (arr) => arr.map(v => Number.isNaN(v) ? '__NaN__' : v);

    const result = {
        xValues: [...series.xValues],
        corrects: [...series.corrects],
        errors: [...series.errors],
        timing: [...series.timing],
        misc: {}
    };

    for (const [key, values] of Object.entries(series.misc)) {
        result.misc[key] = replaceNaN(values);
    }

    return result;
}

/**
 * Serialize line objects, converting Date properties to ISO strings
 */
function serializeLines(lines) {
    const result = {};

    for (const [id, line] of Object.entries(lines)) {
        result[id] = {};
        for (const [key, value] of Object.entries(line)) {
            if (value instanceof Date) {
                result[id][key] = { __date__: value.toISOString() };
            } else {
                result[id][key] = value;
            }
        }
    }

    return result;
}

/**
 * Restore chartState from a serialized object
 */
function deserializeChart(data) {
    // Metadata
    chartState.chartType = data.metadata.chartType;
    chartState.minuteChart = data.metadata.minuteChart;
    chartState.chartName = data.metadata.chartName;
    chartState.hasTimestamps = data.metadata.hasTimestamps;
    chartState.startDate = new Date(data.metadata.startDate);
    chartState.chartCapacity = data.metadata.chartCapacity;
    chartState.chartWindow = data.metadata.chartWindow;
    chartState._createdAt = data.metadata.createdAt;

    // Series
    deserializeSeries(data.series);

    // Lines
    chartState.PhaseLines = deserializeLines(data.lines.phaseLines);
    chartState.AimLines = deserializeLines(data.lines.aimLines);
    chartState.CelLines = deserializeLines(data.lines.celLines);
    chartState.LineCuts = data.lines.lineCuts || {};

    // Config
    chartState.lineVisibility = { ...data.config.lineVisibility };
    chartState.fanVisible = data.config.fanVisible;
    chartState.lineStyles = JSON.parse(JSON.stringify(data.config.lineStyles));
    chartState.traceStyles = JSON.parse(JSON.stringify(data.config.traceStyles));
    chartState.legend = JSON.parse(JSON.stringify(data.config.legend));
    chartState.credits = { ...data.config.credits };
}

/**
 * Deserialize series data, converting NaN markers back
 */
function deserializeSeries(series) {
    const restoreNaN = (arr) => arr.map(v => v === '__NaN__' ? NaN : v);

    chartState.series.xValues = [...series.xValues];
    chartState.series.corrects = [...series.corrects];
    chartState.series.errors = [...series.errors];
    chartState.series.timing = [...series.timing];
    chartState.series.misc = {};

    for (const [key, values] of Object.entries(series.misc)) {
        chartState.series.misc[key] = restoreNaN(values);
    }
}

/**
 * Deserialize line objects, converting ISO strings back to Dates
 */
function deserializeLines(lines) {
    const result = {};

    for (const [id, line] of Object.entries(lines)) {
        result[id] = {};
        for (const [key, value] of Object.entries(line)) {
            if (value && typeof value === 'object' && value.__date__) {
                result[id][key] = new Date(value.__date__);
            } else {
                result[id][key] = value;
            }
        }
    }

    return result;
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
        const chartId = id || chartState.id || crypto.randomUUID();
        chartState.id = chartId;
        const data = serializeChart(chartId, chartState);

        await db.put(STORE_NAME, data);

        console.log(`[Storage] Saved chart: ${chartId}`);
        eventBus.emit(EVENTS.STORAGE_CHART_SAVED, { id: chartId, name: data.metadata.chartName });
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

        deserializeChart(data);
        chartState.id = id;

        console.log(`[Storage] Loaded chart: ${id}`);
        eventBus.emit(EVENTS.STORAGE_CHART_LOADED, { id, name: data.metadata.chartName });
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
            chartName: chart.metadata.chartName,
            chartType: chart.metadata.chartType,
            minuteChart: chart.metadata.minuteChart,
            updatedAt: chart.metadata.updatedAt,
            createdAt: chart.metadata.createdAt
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
    const now = Date.now();

    const data = {
        id: chartId,
        metadata: {
            chartType,
            minuteChart,
            chartName: name.trim(),
            hasTimestamps: false,
            startDate: null,
            chartCapacity: 140,
            chartWindow: 140,
            createdAt: now,
            updatedAt: now
        },
        series: {
            xValues: [],
            corrects: [],
            errors: [],
            timing: [],
            misc: {}
        },
        lines: {
            phaseLines: {},
            aimLines: {},
            celLines: {},
            lineCuts: {}
        },
        config: {
            lineVisibility: { phaseLines: true, aimLines: true, cutLines: true, celLines: true },
            fanVisible: true,
            lineStyles: {},
            traceStyles: {},
            legend: { show: false, position: 'top-right' },
            credits: {}
        }
    };

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