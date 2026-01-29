// ============================================================================
// AGGREGATION UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate the median of an array
 * @param {Array<number>} arr - Array of numbers
 * @returns {number} The median value
 */
export function median(arr) {
    if (!arr || arr.length === 0) return NaN;

    // Filter out NaN and null values
    const validValues = arr.filter(val => val !== null && !isNaN(val));

    if (validValues.length === 0) return NaN;

    // Sort the array
    const sorted = [...validValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    // If odd length, return middle element
    // If even length, return average of two middle elements
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
        return sorted[mid];
    }
}

/**
 * Calculate the mean (average) of an array
 * @param {Array<number>} arr - Array of numbers
 * @returns {number} The mean value
 */
export function mean(arr) {
    if (!arr || arr.length === 0) return NaN;

    // Filter out NaN and null values
    const validValues = arr.filter(val => val !== null && !isNaN(val));

    if (validValues.length === 0) return NaN;

    const sum = validValues.reduce((acc, val) => acc + val, 0);
    return sum / validValues.length;
}

/**
 * Get the minimum value from an array
 * @param {Array<number>} arr - Array of numbers
 * @returns {number} The minimum value
 */
export function min(arr) {
    if (!arr || arr.length === 0) return NaN;

    // Filter out NaN and null values
    const validValues = arr.filter(val => val !== null && !isNaN(val));

    if (validValues.length === 0) return NaN;

    return Math.min(...validValues);
}

/**
 * Get the maximum value from an array
 * @param {Array<number>} arr - Array of numbers
 * @returns {number} The maximum value
 */
export function max(arr) {
    if (!arr || arr.length === 0) return NaN;

    // Filter out NaN and null values
    const validValues = arr.filter(val => val !== null && !isNaN(val));

    if (validValues.length === 0) return NaN;

    return Math.max(...validValues);
}

/**
 * Get the first value from an array
 * @param {Array<number>} arr - Array of numbers
 * @returns {number} The first value (NaN if only one value exists)
 */
export function first(arr) {
    if (!arr || arr.length === 0) return NaN;

    // Filter out NaN and null values
    const validValues = arr.filter(val => val !== null && !isNaN(val));

    // If only one valid value, return NaN
    if (validValues.length <= 1) return NaN;

    // Return the first valid value
    return validValues[0];
}

/**
 * Get the last value from an array
 * @param {Array<number>} arr - Array of numbers
 * @returns {number} The last value (NaN if only one value exists)
 */
export function last(arr) {
    if (!arr || arr.length === 0) return NaN;

    // Filter out NaN and null values
    const validValues = arr.filter(val => val !== null && !isNaN(val));

    // If only one valid value, return NaN
    if (validValues.length <= 1) return NaN;

    // Return the last valid value
    return validValues[validValues.length - 1];
}

/**
 * Calculate the sum of an array
 * Note: Only meaningful for non-minute charts where frequency = raw count
 * @param {Array<number>} arr - Array of numbers
 * @returns {number} The sum of all values
 */
export function sum(arr) {
    if (!arr || arr.length === 0) return NaN;

    // Filter out NaN and null values
    const validValues = arr.filter(val => val !== null && !isNaN(val));

    if (validValues.length === 0) return NaN;

    return validValues.reduce((acc, val) => acc + val, 0);
}

/**
 * Aggregate data by X position using a specified aggregation function.
 * Groups Y values by their corresponding X position and applies the aggregation.
 *
 * @param {Array<number>} xArr - X position array
 * @param {Array<number>} yArr - Y data array (same length as xArr)
 * @param {function} aggFn - Aggregation function (e.g., mean, median, sum)
 * @returns {{x: Array<number>, y: Array<number>}} Aggregated x and y arrays
 */
export function aggregateByX(xArr, yArr, aggFn) {
    if (!xArr || !yArr || xArr.length === 0) {
        return { x: [], y: [] };
    }

    // Group y values by x position
    const groups = new Map();
    for (let i = 0; i < xArr.length; i++) {
        const x = xArr[i];
        const y = yArr[i];
        if (!groups.has(x)) {
            groups.set(x, []);
        }
        groups.get(x).push(y);
    }

    // Apply aggregation function to each group
    const aggX = [];
    const aggY = [];

    // Sort by x position to maintain order
    const sortedX = Array.from(groups.keys()).sort((a, b) => a - b);

    for (const x of sortedX) {
        const values = groups.get(x);
        // For single values, use the value directly (avoids NaN from first/last)
        const aggregatedValue = values.length === 1 ? values[0] : aggFn(values);
        aggX.push(x);
        aggY.push(aggregatedValue);
    }

    return { x: aggX, y: aggY };
}
