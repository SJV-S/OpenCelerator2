/**
 * Theil-Sen Estimator for Robust Linear Regression
 *
 * Provides a simple JavaScript implementation of the Theil-Sen estimator,
 * which calculates the median slope from all pairwise slopes between points.
 * This is more robust to outliers than ordinary least squares regression.
 */

/**
 * Helper function to calculate median of an array
 * @param {number[]} values - Array of numeric values
 * @returns {number|null} Median value or null if array is empty
 */
function calculateMedian(values) {
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
        return sorted[mid];
    }
}

/**
 * Theil-Sen estimator for robust linear regression
 * Calculates the median of all pairwise slopes, then the median intercept
 *
 * @param {number[]} xValues - Array of x coordinates
 * @param {number[]} yValues - Array of y coordinates
 * @returns {{slope: number, intercept: number}|null} Linear fit parameters or null if insufficient data
 */
function theilSenFit(xValues, yValues) {
    if (xValues.length !== yValues.length) {
        console.error('x and y arrays must have same length');
        return null;
    }

    const n = xValues.length;

    if (n < 5) {
        console.log(`Insufficient data points: ${n} (need at least 5)`);
        return null;
    }

    // Calculate all pairwise slopes
    const slopes = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const dx = xValues[j] - xValues[i];
            const dy = yValues[j] - yValues[i];

            // Skip pairs with identical x values to avoid division by zero
            if (dx !== 0) {
                slopes.push(dy / dx);
            }
        }
    }

    if (slopes.length === 0) {
        console.error('All x values are identical');
        return null;
    }

    // Calculate median slope
    const slope = calculateMedian(slopes);

    // Calculate intercepts for each point using the median slope
    const intercepts = [];
    for (let i = 0; i < n; i++) {
        intercepts.push(yValues[i] - slope * xValues[i]);
    }

    // Calculate median intercept
    const intercept = calculateMedian(intercepts);

    return { slope, intercept };
}

// Export functions as ES modules
export { calculateMedian, theilSenFit };

console.log('theilSen.js loaded');
