/**
 * Formatting utilities
 */

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
        return value.toFixed(0);
    }
    if (value >= 100) {
        return value.toFixed(1);
    }
    if (value >= 1) {
        return value.toFixed(2);
    }
    return value.toFixed(3);
}
