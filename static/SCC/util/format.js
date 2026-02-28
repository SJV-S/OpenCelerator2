/**
 * Formatting utilities
 */

import { MISSING } from '../config.js';

/** Check if a value is the missing-data sentinel (null or undefined) */
export function isMissing(value) { return value == null; }

/**
 * Format numeric value for display with appropriate decimal places
 * @param {number} value - The value to format
 * @returns {string} Formatted value string
 */
export function formatValue(value) {
    if (value === null || value === undefined || isNaN(value)) {
        return '—';
    }
    if (value >= 1000) {
        return Math.round(value).toLocaleString();
    }
    if (value >= 100) {
        return value.toFixed(1);
    }
    if (value >= 1) {
        return value.toFixed(2);
    }
    return value.toFixed(3);
}
