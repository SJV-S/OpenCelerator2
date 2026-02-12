/**
 * Fit Lines - Trend Fitting Algorithms and Bounce Line Calculations
 *
 * Provides 6 fitting methods for celeration lines on semi-log charts:
 * - Theil-Sen (robust, default)
 * - Least-squares (standard linear regression)
 * - Quarter-intersect (classic Precision Teaching method)
 * - Split-middle-line (MAD-optimized quarter-intersect)
 * - Mean (horizontal line at mean)
 * - Median (horizontal line at median)
 *
 * And 5 bounce envelope types for showing data variability:
 * - None (no bounce lines)
 * - 5-95 percentile
 * - Interquartile range
 * - Standard deviation
 * - 90% confidence interval
 *
 * All fitting is performed in LOG-SPACE on y-values.
 * Input y-values should already be transformed: yLog = Math.log10(y)
 */

// ============================================================================
// Fit Method Constants
// ============================================================================

export const FIT_METHODS = Object.freeze({
    THEIL_SEN: 'Theil-Sen',
    LEAST_SQUARES: 'Least-squares',
    QUARTER_INTERSECT: 'Quarter-intersect',
    SPLIT_MIDDLE_LINE: 'Split-middle-line',
    MEAN: 'Mean',
    MEDIAN: 'Median'
});

export const BOUNCE_ENVELOPES = Object.freeze({
    NONE: 'None',
    PERCENTILE_5_95: '5-95 percentile',
    INTERQUARTILE: 'Interquartile range',
    STD_DEV: 'Standard deviation',
    CONFIDENCE_90: '90% confidence interval'
});

export const DEFAULT_FIT_METHOD = FIT_METHODS.THEIL_SEN;
export const DEFAULT_BOUNCE_ENVELOPE = BOUNCE_ENVELOPES.NONE;

// Minimum data points required for fitting
const MIN_POINTS = 5;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate median of an array
 * @param {number[]} values - Array of numeric values
 * @returns {number|null} Median value or null if array is empty
 */
export function median(values) {
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}

/**
 * Calculate percentile of an array using linear interpolation
 * @param {number[]} arr - Array of numeric values
 * @param {number} p - Percentile (0-100)
 * @returns {number|null} Percentile value or null if array is empty
 */
export function percentile(arr, p) {
    if (!arr || arr.length === 0) return null;

    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
        return sorted[lower];
    }

    // Linear interpolation
    const fraction = index - lower;
    return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

/**
 * Calculate standard deviation of an array (population)
 * @param {number[]} arr - Array of numeric values
 * @returns {number} Standard deviation
 */
export function standardDeviation(arr) {
    if (!arr || arr.length === 0) return 0;

    const n = arr.length;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const squaredDiffs = arr.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(avgSquaredDiff);
}

/**
 * Calculate mean of an array
 * @param {number[]} arr - Array of numeric values
 * @returns {number|null} Mean value or null if array is empty
 */
export function mean(arr) {
    if (!arr || arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ============================================================================
// Fit Methods (all expect y in log-space)
// ============================================================================

/**
 * Theil-Sen estimator for robust linear regression
 * Calculates the median of all pairwise slopes, then the median intercept
 * Highly robust against outliers (up to 29.3% of data can be outliers)
 *
 * @param {number[]} x - Array of x coordinates
 * @param {number[]} y - Array of y coordinates (in log-space)
 * @returns {{slope: number, intercept: number}|null} Fit parameters or null
 */
export function theilSenFit(x, y) {
    if (x.length !== y.length) {
        console.error('x and y arrays must have same length');
        return null;
    }

    const n = x.length;
    if (n < MIN_POINTS) {
        return null;
    }

    // Calculate all pairwise slopes
    const slopes = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const dx = x[j] - x[i];
            if (dx !== 0) {
                const dy = y[j] - y[i];
                slopes.push(dy / dx);
            }
        }
    }

    if (slopes.length === 0) {
        console.error('All x values are identical');
        return null;
    }

    // Median slope
    const slope = median(slopes);

    // Calculate intercepts for each point, take median
    const intercepts = x.map((xi, i) => y[i] - slope * xi);
    const intercept = median(intercepts);

    return { slope, intercept };
}

/**
 * Least-squares linear regression
 * Minimizes sum of squared residuals. Fast but sensitive to outliers.
 *
 * @param {number[]} x - Array of x coordinates
 * @param {number[]} y - Array of y coordinates (in log-space)
 * @returns {{slope: number, intercept: number}|null} Fit parameters or null
 */
export function leastSquaresFit(x, y) {
    if (x.length !== y.length) {
        console.error('x and y arrays must have same length');
        return null;
    }

    const n = x.length;
    if (n < MIN_POINTS) {
        return null;
    }

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
        console.error('Cannot compute least-squares: denominator is zero');
        return null;
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
}

/**
 * Quarter-intersect method (classic Precision Teaching celeration method)
 * Divides data into halves, finds median x and y for each half,
 * draws line through those two points.
 *
 * @param {number[]} x - Array of x coordinates
 * @param {number[]} y - Array of y coordinates (in log-space)
 * @returns {{slope: number, intercept: number}|null} Fit parameters or null
 */
export function quarterIntersectFit(x, y) {
    if (x.length !== y.length) {
        console.error('x and y arrays must have same length');
        return null;
    }

    const n = x.length;
    if (n < MIN_POINTS) {
        return null;
    }

    // Find the midpoint of x values
    const midX = median(x);

    // Split data into first and second halves
    const firstHalf = { x: [], y: [] };
    const secondHalf = { x: [], y: [] };

    for (let i = 0; i < n; i++) {
        if (x[i] < midX) {
            firstHalf.x.push(x[i]);
            firstHalf.y.push(y[i]);
        } else if (x[i] > midX) {
            secondHalf.x.push(x[i]);
            secondHalf.y.push(y[i]);
        }
        // Points exactly at midX are excluded
    }

    // Need at least one point in each half
    if (firstHalf.x.length === 0 || secondHalf.x.length === 0) {
        console.error('Cannot split data into two halves');
        return null;
    }

    // Find median of each quarter
    const x1 = median(firstHalf.x);
    const y1 = median(firstHalf.y);
    const x2 = median(secondHalf.x);
    const y2 = median(secondHalf.y);

    // Calculate slope and intercept
    const dx = x2 - x1;
    if (dx === 0) {
        console.error('Quarter medians have same x value');
        return null;
    }

    const slope = (y2 - y1) / dx;
    const intercept = y1 - slope * x1;

    return { slope, intercept };
}

/**
 * Split-middle-line method (MAD-optimized quarter-intersect)
 * Starts with quarter-intersect, then adjusts the intercept so equal
 * numbers of points fall above and below the line.
 *
 * @param {number[]} x - Array of x coordinates
 * @param {number[]} y - Array of y coordinates (in log-space)
 * @returns {{slope: number, intercept: number}|null} Fit parameters or null
 */
export function splitMiddleLineFit(x, y) {
    // Start with quarter-intersect
    const qi = quarterIntersectFit(x, y);
    if (!qi) return null;

    // Calculate the trend line at each x
    const trend = x.map(xi => qi.slope * xi + qi.intercept);

    // Calculate residuals (differences from trend)
    const differences = y.map((yi, i) => yi - trend[i]);

    // Find median difference - this ensures half above, half below
    const medianDiff = median(differences);

    // Adjust intercept by median difference
    return { slope: qi.slope, intercept: qi.intercept + medianDiff };
}

/**
 * Mean fit - horizontal line at the mean of all y values
 * No slope (celeration = x1.0)
 *
 * @param {number[]} x - Array of x coordinates (unused, for interface consistency)
 * @param {number[]} y - Array of y coordinates (in log-space)
 * @returns {{slope: number, intercept: number}|null} Fit parameters or null
 */
export function meanFit(x, y) {
    if (!y || y.length < MIN_POINTS) {
        return null;
    }

    const meanY = mean(y);
    return { slope: 0, intercept: meanY };
}

/**
 * Median fit - horizontal line at the median of all y values
 * More robust than mean. No slope (celeration = x1.0)
 *
 * @param {number[]} x - Array of x coordinates (unused, for interface consistency)
 * @param {number[]} y - Array of y coordinates (in log-space)
 * @returns {{slope: number, intercept: number}|null} Fit parameters or null
 */
export function medianFit(x, y) {
    if (!y || y.length < MIN_POINTS) {
        return null;
    }

    const medianY = median(y);
    return { slope: 0, intercept: medianY };
}

// ============================================================================
// Main Fit Dispatcher
// ============================================================================

/**
 * Fit a trend line using the specified method
 *
 * @param {number[]} x - Array of x coordinates
 * @param {number[]} y - Array of y coordinates (in log-space)
 * @param {string} method - Fit method name (from FIT_METHODS)
 * @returns {{slope: number, intercept: number}|null} Fit parameters or null
 */
export function fit(x, y, method = DEFAULT_FIT_METHOD) {
    switch (method) {
        case FIT_METHODS.THEIL_SEN:
            return theilSenFit(x, y);
        case FIT_METHODS.LEAST_SQUARES:
            return leastSquaresFit(x, y);
        case FIT_METHODS.QUARTER_INTERSECT:
            return quarterIntersectFit(x, y);
        case FIT_METHODS.SPLIT_MIDDLE_LINE:
            return splitMiddleLineFit(x, y);
        case FIT_METHODS.MEAN:
            return meanFit(x, y);
        case FIT_METHODS.MEDIAN:
            return medianFit(x, y);
        default:
            console.warn(`Unknown fit method: ${method}, using ${DEFAULT_FIT_METHOD}`);
            return theilSenFit(x, y);
    }
}

// ============================================================================
// Bounce Line Calculations
// ============================================================================

/**
 * Calculate bounce line bounds based on residuals from the trend
 *
 * @param {number[]} yLog - Original y values in log-space
 * @param {number[]} x - X coordinates corresponding to yLog
 * @param {number} slope - Trend line slope (from fit)
 * @param {number} intercept - Trend line intercept (from fit)
 * @param {string} envelope - Bounce envelope type (from BOUNCE_ENVELOPES)
 * @returns {{upper: number, lower: number}|null} Bounds in log-space or null if no envelope
 */
export function calculateBounceBounds(yLog, x, slope, intercept, envelope = DEFAULT_BOUNCE_ENVELOPE) {
    if (envelope === BOUNCE_ENVELOPES.NONE) {
        return null;
    }

    if (!yLog || yLog.length === 0) {
        return null;
    }

    // Calculate fitted trend for original data points
    const trendAtData = x.map(xi => slope * xi + intercept);

    // Calculate residuals in log-space
    const residuals = yLog.map((yi, i) => yi - trendAtData[i]);

    let bounds;

    switch (envelope) {
        case BOUNCE_ENVELOPES.PERCENTILE_5_95:
            bounds = {
                upper: percentile(residuals, 95),
                lower: percentile(residuals, 5)
            };
            break;

        case BOUNCE_ENVELOPES.INTERQUARTILE:
            const q75 = percentile(residuals, 75);
            const q25 = percentile(residuals, 25);
            const iqr = q75 - q25;
            bounds = {
                upper: q75,
                lower: q25 - iqr  // Extends below Q1 by one IQR
            };
            break;

        case BOUNCE_ENVELOPES.STD_DEV:
            const meanResidual = mean(residuals);
            const std = standardDeviation(residuals);
            bounds = {
                upper: meanResidual + std,
                lower: meanResidual - std
            };
            break;

        case BOUNCE_ENVELOPES.CONFIDENCE_90:
            const meanCI = mean(residuals);
            const stdError = standardDeviation(residuals) / Math.sqrt(residuals.length);
            const margin = 1.645 * stdError;  // 90% CI z-score
            bounds = {
                upper: meanCI + margin,
                lower: meanCI - margin
            };
            break;

        default:
            return null;
    }

    return bounds;
}

/**
 * Calculate bounce line y-values for given x positions
 *
 * @param {number[]} xPositions - X positions to calculate bounce lines at
 * @param {number} slope - Trend line slope
 * @param {number} intercept - Trend line intercept
 * @param {{upper: number, lower: number}} bounds - Bounce bounds from calculateBounceBounds
 * @returns {{upperY: number[], lowerY: number[]}} Y values in LINEAR scale for Plotly
 */
export function calculateBounceLines(xPositions, slope, intercept, bounds) {
    if (!bounds) {
        return null;
    }

    // Calculate bounce lines in log-space
    const logUpper = xPositions.map(xi => slope * xi + intercept + bounds.upper);
    const logLower = xPositions.map(xi => slope * xi + intercept + bounds.lower);

    // Convert back to linear scale for Plotly
    const upperY = logUpper.map(v => Math.pow(10, v));
    const lowerY = logLower.map(v => Math.pow(10, v));

    return { upperY, lowerY };
}

// ============================================================================
// Celeration Label Formatting
// ============================================================================

/**
 * Format celeration value as a display label
 * Converts log-space slope to multiplication/division factor per standard period
 *
 * @param {number} slope - Slope in log-space per x-unit (chart-native unit)
 * @param {number} unit - Number of x-units per standard period (from CHART_TYPE_CONFIG)
 * @returns {string} Formatted label like "x2.50" or "÷1.25"
 */
export function formatCelerationLabel(slope, unit) {
    let cel = Math.pow(10, slope * unit);

    let symbol = '\u00d7';
    if (cel < 1) {
        symbol = '\u00f7';
        cel = 1 / cel;
    }

    return `${symbol}${cel.toFixed(2)}`;
}
