/**
 * Shared DOM utilities.
 */

/**
 * Get the Plotly chart div element.
 * @returns {HTMLElement|null}
 */
export function getChartDiv() {
    return document.getElementById('chart');
}

/**
 * Escape a string for safe insertion into HTML (both text content and attributes).
 * @param {*} str
 * @returns {string}
 */
export function escapeHtml(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
