/**
 * Native Import Module
 *
 * Imports TC2 native JSON exports (from "Export file" feature).
 * These files are direct serializations of chartState, so import is straightforward.
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';

/**
 * Check if a parsed JSON object is a native TC2 export
 * Detection: presence of id, chartKey, and shared keys
 * @param {object} json - Parsed JSON object
 * @returns {boolean}
 */
export function isNativeFormat(json) {
    if (!json || typeof json !== 'object') {
        return false;
    }

    return 'id' in json && 'chartKey' in json && 'shared' in json;
}

/**
 * Import a native TC2 JSON file
 * @param {File} file - The JSON file to import
 * @returns {Promise<{success: boolean, count: number, message: string}>}
 */
export async function importNativeFile(file) {
    try {
        const text = await file.text();

        let json;
        try {
            json = JSON.parse(text);
        } catch (parseErr) {
            return {
                success: false,
                count: 0,
                message: `Invalid JSON: ${parseErr.message}`
            };
        }

        if (!isNativeFormat(json)) {
            return {
                success: false,
                count: 0,
                message: 'Not a valid TC2 native export file'
            };
        }

        return applyNativeToChartState(json);

    } catch (err) {
        return {
            success: false,
            count: 0,
            message: `Import error: ${err.message}`
        };
    }
}

/**
 * Apply native JSON data to chartState
 * @param {object} json - Parsed native JSON
 * @returns {{success: boolean, count: number, message: string}}
 */
function applyNativeToChartState(json) {
    try {
        // Remove existing misc series UI first
        const existingMiscIds = Object.keys(chartState.series.misc || {});
        for (const id of existingMiscIds) {
            eventBus.emit(EVENTS.MISC_SERIES_REMOVED, { id });
        }

        // Copy all properties from imported JSON to chartState
        // We do this property by property to ensure we don't break the reference
        const keysToImport = [
            'id', 'chartKey', 'shared', 'lastModified',
            'series', 'chartType', 'minuteChart', 'chartName', 'tags',
            'hasTimestamps', 'startDate', 'chartCapacity', 'chartWindow',
            'legend', 'LineCuts', 'PhaseLines', 'AimLines', 'CelLines',
            'lineVisibility', 'fanVisible', 'placeZerosBelowFloor',
            'lineStyles', 'traceStyles', 'credits'
        ];

        for (const key of keysToImport) {
            if (key in json) {
                chartState[key] = json[key];
            }
        }

        // Count data points
        const count = chartState.series.xValues?.length || 0;

        // Update UI toggle for placeZerosBelowFloor if it exists
        const toggle = document.getElementById('place-zeros-below-floor-toggle');
        if (toggle) toggle.checked = chartState.placeZerosBelowFloor;

        // Emit events to sync UI
        eventBus.emit(EVENTS.CREDITS_UPDATED);
        eventBus.emit(EVENTS.DATA_IMPORT_COMPLETED, {
            count,
            replaced: true,
            source: 'Native'
        });

        // Trigger chart refresh
        eventBus.emit(EVENTS.DATA_CHART_REFRESH);

        return {
            success: true,
            count,
            message: `Imported chart "${chartState.chartName}" with ${count} data points`
        };

    } catch (err) {
        eventBus.emit(EVENTS.DATA_IMPORT_FAILED, {
            error: err.message,
            stage: 'import'
        });
        return {
            success: false,
            count: 0,
            message: err.message
        };
    }
}
