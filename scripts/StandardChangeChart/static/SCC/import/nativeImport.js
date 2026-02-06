/**
 * Native Import Module
 *
 * Detection for TC2 native JSON exports.
 * Native exports are already complete chart objects — no conversion needed,
 * just save directly via importChart() in chartStorage.
 */

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
