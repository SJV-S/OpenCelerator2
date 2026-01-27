/**
 * Misc Series Management
 *
 * Functions for dynamically creating, removing, and managing misc data series.
 * Uses event bus to notify other modules of changes.
 *
 * Defined in: static/SCC/series/miscSeries.js
 */

import { eventBus, EVENTS } from '../eventBus.js';
import {
    chartState,
    createMiscTraceConfig,
    MISC_COLORS,
    MAX_MISC_SERIES
} from '../chartState.js';

/**
 * Get the next available misc series ID (fills gaps)
 * @returns {string|null} Next available ID like "misc1", "misc2", etc., or null if at max
 */
export function getNextMiscId() {
    const existingCount = Object.keys(chartState.series.misc).length;
    if (existingCount >= MAX_MISC_SERIES) {
        return null;
    }

    let i = 1;
    while (chartState.series.misc[`misc${i}`]) {
        i++;
    }
    return `misc${i}`;
}

/**
 * Add a new misc series with default configuration
 * Emits MISC_SERIES_ADDED event with the new series ID
 * @returns {string|null} The ID of the created series, or null if at max capacity
 */
export function addMiscSeries() {
    const id = getNextMiscId();
    if (!id) {
        return null;
    }

    const num = parseInt(id.slice(4));
    const index = num - 1;

    // Initialize empty data array (same length as other series, filled with NaN)
    const dataLength = chartState.series.timestamps.length;
    chartState.series.misc[id] = new Array(dataLength).fill(NaN);

    // Initialize trace styles
    chartState.traceStyles.misc[id] = {
        raw: createMiscTraceConfig(index)
    };

    // Initialize trend line styles
    chartState.lineStyles.trend.misc[id] = {
        color: MISC_COLORS[index % MISC_COLORS.length],
        width: 2
    };

    eventBus.emit(EVENTS.MISC_SERIES_ADDED, { id, index });

    return id;
}

/**
 * Remove a misc series and all its associated configuration
 * Emits MISC_SERIES_REMOVED event with the removed series ID
 * @param {string} id - The misc series ID to remove (e.g., "misc1")
 * @returns {boolean} True if removed, false if ID didn't exist
 */
export function removeMiscSeries(id) {
    if (!chartState.series.misc[id]) {
        return false;
    }

    delete chartState.series.misc[id];
    delete chartState.traceStyles.misc[id];
    delete chartState.lineStyles.trend.misc[id];

    eventBus.emit(EVENTS.MISC_SERIES_REMOVED, { id });

    return true;
}

/**
 * Get all misc series IDs currently in use, sorted numerically
 * @returns {string[]} Array of misc series IDs
 */
export function getMiscSeriesIds() {
    return Object.keys(chartState.series.misc).sort((a, b) => {
        return parseInt(a.slice(4)) - parseInt(b.slice(4));
    });
}

/**
 * Check if we can add more misc series
 * @returns {boolean} True if under the limit
 */
export function canAddMiscSeries() {
    return Object.keys(chartState.series.misc).length < MAX_MISC_SERIES;
}