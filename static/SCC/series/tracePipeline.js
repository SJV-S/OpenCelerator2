/**
 * Trace Pipeline - Complete aggregation pipeline and trace creation
 *
 * This module handles:
 * - Trace template functions for all series types
 * - Aggregation logic (median, mean, min, max, first, last, sum, raw)
 * - Frequency calculations and floor thresholding
 * - Trace creation with segmentation and aggregation
 *
 * Note: 'sum' aggregation only works for non-minute charts (where frequency = raw count)
 */

import { chartState } from '../chartState.js';
import { CORRECTS, ERRORS, LIMITS, CHART_MATH, MISSING } from '../config.js';
import { isMissing } from '../util/format.js';
import { median, mean, min, max, first, last, sum, aggregateByX, rollingWindow } from '../util/agg.js';

const AUTO_AGG_THRESHOLD = LIMITS.AUTO_AGG_THRESHOLD;

// ============================================================================
// TRACE CREATION FUNCTIONS
// ============================================================================

function correctsTrace(xValues, yValues, config) {
    const hasLine = config.showLine;
    const hasMarkers = config.markerSymbol !== 'none';
    const mode = hasLine && hasMarkers ? 'lines+markers'
        : hasLine ? 'lines'
        : 'markers';
    return {
        x: xValues,
        y: yValues,
        mode,
        line: {
            color: config.lineColor,
            width: config.lineWidth,
            dash: config.lineDash || 'solid'
        },
        marker: {
            symbol: hasMarkers ? config.markerSymbol : 'circle',
            size: hasMarkers ? config.markerSize : 0,
            color: config.markerColor,
            line: {
                color: config.markerEdgeColor,
                width: hasMarkers ? 1 : 0
            }
        },
        name: config.seriesName,
        connectgaps: true,
        hoverinfo: 'none'
    };
}

function errorTrace(xValues, yValues, config) {
    return {
        x: xValues,
        y: yValues,
        mode: config.showLine ? 'lines+text' : 'text',
        line: {
            color: config.lineColor,
            width: config.lineWidth,
            dash: config.lineDash || 'solid'
        },
        text: Array(xValues.length).fill('x'),
        textposition: 'middle center',
        textfont: {
            size: config.markerSize,
            color: config.markerColor
        },
        name: config.seriesName,
        connectgaps: true,
        hoverinfo: 'none'
    };
}

function timingFloorTrace(xValues, yValues, config) {
    return {
        x: xValues,
        y: yValues,
        mode: config.showLine ? 'lines+text' : 'text',
        line: {
            color: config.lineColor,
            width: config.lineWidth,
            dash: config.lineDash || 'solid'
        },
        text: Array(xValues.length).fill('-'),
        textposition: 'middle center',
        textfont: {
            size: config.markerSize,
            color: config.markerColor
        },
        name: config.seriesName,
        connectgaps: true,
        hoverinfo: 'none'
    };
}

function miscTrace(xValues, yValues, config) {
    const hasLine = config.showLine;
    const hasMarkers = config.markerSymbol !== 'none';
    const mode = hasLine && hasMarkers ? 'lines+markers'
        : hasLine ? 'lines'
        : 'markers';
    return {
        x: xValues,
        y: yValues,
        mode,
        line: {
            color: config.lineColor,
            width: config.lineWidth,
            dash: config.lineDash || 'solid'
        },
        marker: {
            symbol: hasMarkers ? config.markerSymbol : 'circle',
            size: hasMarkers ? config.markerSize : 0,
            color: config.markerColor,
            line: {
                color: config.markerEdgeColor,
                width: hasMarkers ? 1 : 0
            }
        },
        name: config.seriesName,
        connectgaps: false,
        hoverinfo: 'none'
    };
}

/**
 * Generic floor shadow trace - wraps any base trace function,
 * stripping lines and hiding from legend
 */
function createFloorShadowTrace(baseTraceFn, xValues, yValues, config) {
    const trace = baseTraceFn(xValues, yValues, config);
    trace.mode = trace.mode.replace('lines+', '').replace('+lines', '');
    trace.showlegend = false;
    return trace;
}

// ============================================================================
// FREQUENCY LOGIC
// ============================================================================

/**
 * Check if a frequency array has any valid (finite) data
 * @param {Array<number>} arr - Array of frequency values
 * @returns {boolean} True if at least one finite value exists
 */
function hasValidData(arr) {
    if (!arr || arr.length === 0) return false;
    return arr.some(v => Number.isFinite(v));
}

// Module-level map of aggregation name → function (shared by per-position and rolling window)
const AGG_FUNCTIONS = {
    median, mean, min, max, first, last, sum
};

/**
 * Apply per-position (onXAgg) aggregation to frequency data.
 * Groups data by X position and applies the aggregation to each group.
 *
 * @param {Array<number>} xPositions - X position array
 * @param {Array<number>} yData - Frequency data array (same length as xPositions)
 * @param {string} aggType - Aggregation type (e.g., 'raw', 'median', 'min', 'max', 'mean', 'first', 'last', 'sum')
 * @returns {{x: Array<number>, y: Array<number>, autoAggregated: boolean}} Aggregated x and y arrays
 */
function applyAggregation(xPositions, yData, aggType) {
    // If "raw", check if we need to auto-aggregate
    if (aggType === 'raw') {
        const xCounts = new Map();
        xPositions.forEach(x => xCounts.set(x, (xCounts.get(x) || 0) + 1));
        const maxPerX = xCounts.size > 0 ? Math.max(...xCounts.values()) : 0;

        if (maxPerX > AUTO_AGG_THRESHOLD) {
            return { ...aggregateByX(xPositions, yData, median), autoAggregated: true };
        }
        return { x: xPositions, y: yData, autoAggregated: false };
    }

    // Sum is only meaningful for non-minute charts
    if (aggType === 'sum' && chartState.minuteChart) {
        return { x: xPositions, y: yData, autoAggregated: false };
    }

    const aggFn = AGG_FUNCTIONS[aggType];
    if (!aggFn) {
        return { x: xPositions, y: yData, autoAggregated: false };
    }

    return { ...aggregateByX(xPositions, yData, aggFn), autoAggregated: false };
}

/**
 * Apply rolling (across-X) window aggregation.
 * Skips if acrossXAgg is null/undefined or has an invalid fn.
 * Also skips "sum" on minute charts for consistency with onXAgg guard.
 *
 * After rolling, filters out null y-values (and corresponding x) so Plotly
 * doesn't try to connect through gaps.
 *
 * @param {Array<number>} xArr - X positions
 * @param {Array<number>} yArr - Y values
 * @param {Object|null} acrossXAgg - { fn: string, window: number } or null
 * @returns {{x: Array<number>, y: Array<number>}}
 */
function applyRollingWindow(xArr, yArr, acrossXAgg) {
    if (!acrossXAgg?.fn) return { x: xArr, y: yArr };

    // Sum rolling on minute charts: skip (same guard as onXAgg)
    if (acrossXAgg.fn === 'sum' && chartState.minuteChart) return { x: xArr, y: yArr };

    const aggFn = AGG_FUNCTIONS[acrossXAgg.fn];
    if (!aggFn) return { x: xArr, y: yArr };

    const rolled = rollingWindow(xArr, yArr, aggFn, acrossXAgg.window);

    // Filter out null y-values so Plotly doesn't draw connecting lines through gaps
    const filteredX = [];
    const filteredY = [];
    for (let i = 0; i < rolled.y.length; i++) {
        if (rolled.y[i] !== null && rolled.y[i] !== undefined && !isNaN(rolled.y[i])) {
            filteredX.push(rolled.x[i]);
            filteredY.push(rolled.y[i]);
        }
    }

    return { x: filteredX, y: filteredY };
}

/**
 * Convert timing values to frequency values (inverse)
 */
function timingToFrequency(timingArray) {
    return timingArray.map(t => isMissing(t) ? MISSING : 1 / t);
}

/**
 * Apply floor threshold to a frequency value
 */
function placeBelowFloor(freq, timing) {
    if (isMissing(freq) || isMissing(timing) || timing <= 0) {
        return freq;
    }
    const floorTiming = Math.floor(timing);
    if (floorTiming === 0) {
        return freq;
    }
    const threshold = 1 / floorTiming;
    if (freq === 0 || freq < threshold) {
        return threshold * CHART_MATH.FLOOR_MULTIPLIER;
    }
    return freq;
}

/**
 * Check if a frequency value is below the floor threshold
 */
function isBelowFloor(freq, timing) {
    if (isMissing(freq) || isMissing(timing) || timing <= 0) return false;
    const floorTiming = Math.floor(timing);
    if (floorTiming === 0) return false;
    const threshold = 1 / floorTiming;
    return freq === 0 || freq < threshold;
}

/**
 * Calculate frequencies for all data types from raw counts and timing
 *
 * For minute charts: frequency = count / timing
 * For non-minute charts: uses timing of 1 (frequency = count), but floor logic
 * still applies to handle zero counts (placed at 0.75 below floor of 1)
 *
 * @param {Function} [sort] - Optional sort function to apply chronological ordering
 */
function calculateFrequencies(sort = (arr) => arr) {
    // Non-minute charts use timing of 1 for all points (raw counts, but floor still works for zeros)
    const timingMinutes = chartState.minuteChart
        ? sort(chartState.series.timing)
        : sort(chartState.series.timing).map(() => 1);

    // Helper: convert zeros to MISSING when placeZerosBelowFloor is false
    const handleZero = (freq) => {
        if (freq === 0 && !chartState.placeZerosBelowFloor) return MISSING;
        return freq;
    };

    // Calculate raw frequencies for fixed series (convert zeros to MISSING if setting is off)
    const freq = (count, i) => isMissing(count) || isMissing(timingMinutes[i]) ? MISSING : handleZero(count / timingMinutes[i]);
    const correctsFreqRaw = sort(chartState.series.corrects).map(freq);
    const errorsFreqRaw = sort(chartState.series.errors).map(freq);

    // Create original frequency arrays (below-floor values set to MISSING)
    const correctsFreq = correctsFreqRaw.map((freq, i) =>
        isBelowFloor(freq, timingMinutes[i]) ? MISSING : freq
    );
    const errorsFreq = errorsFreqRaw.map((freq, i) =>
        isBelowFloor(freq, timingMinutes[i]) ? MISSING : freq
    );

    // Create floor-adjusted shadow arrays (only show floor-adjusted values, above-floor as MISSING)
    const correctsFloor = correctsFreqRaw.map((freq, i) =>
        isBelowFloor(freq, timingMinutes[i]) ? placeBelowFloor(freq, timingMinutes[i]) : MISSING
    );
    const errorsFloor = errorsFreqRaw.map((freq, i) =>
        isBelowFloor(freq, timingMinutes[i]) ? placeBelowFloor(freq, timingMinutes[i]) : MISSING
    );

    const result = {
        corrects: correctsFreq,
        errors: errorsFreq,
        correctsFloor: correctsFloor,
        errorsFloor: errorsFloor,
        misc: {},
        miscFloor: {}
    };

    // Calculate frequencies for dynamic misc series (convert zeros to MISSING if setting is off)
    Object.entries(chartState.series.misc).forEach(([miscId, data]) => {
        const miscFreqRaw = sort(data).map(freq);

        result.misc[miscId] = miscFreqRaw.map((freq, i) =>
            isBelowFloor(freq, timingMinutes[i]) ? MISSING : freq
        );

        result.miscFloor[miscId] = miscFreqRaw.map((freq, i) =>
            isBelowFloor(freq, timingMinutes[i]) ? placeBelowFloor(freq, timingMinutes[i]) : MISSING
        );
    });

    return result;
}

/**
 * Split data into segments based on line cuts
 */
function createSegments(xArray, yArray, cutXPositions, seriesName) {
    if (cutXPositions.length === 0) {
        return [{x: xArray, y: yArray, seriesName: seriesName}];
    }

    const segments = [];
    let segmentX = [];
    let segmentY = [];

    for (let i = 0; i < xArray.length; i++) {
        let crossed = false;
        if (i > 0) {
            for (const cutX of cutXPositions) {
                if (xArray[i-1] < cutX && xArray[i] > cutX) {
                    crossed = true;
                    break;
                }
            }
        }

        if (crossed && segmentX.length > 0) {
            segments.push({
                x: segmentX,
                y: segmentY,
                seriesName: seriesName
            });
            segmentX = [];
            segmentY = [];
        }

        segmentX.push(xArray[i]);
        segmentY.push(yArray[i]);
    }

    if (segmentX.length > 0) {
        segments.push({
            x: segmentX,
            y: segmentY,
            seriesName: seriesName
        });
    }

    return segments;
}

/**
 * Create timing traces (no segmenting, no floor shadows)
 * Loops through all aggregation keys for timing series
 * Returns array of timing traces
 *
 * Note: Returns empty array for non-minute charts (timing floor not displayed)
 */
function createTimingTraces(xPositions) {
    // Non-minute charts don't display timing floor
    if (!chartState.minuteChart) {
        return [];
    }

    const timingTraces = [];
    const timingFrequencies = timingToFrequency(chartState.series.timing);

    // Loop through all aggregation keys for timing
    Object.entries(chartState.traceStyles.timing).forEach(([aggId, config]) => {
        const onXAgg = config.onXAgg || 'raw';
        const { x, y } = applyAggregation(xPositions, timingFrequencies, onXAgg);
        // Rolling window applied to timing too
        const rolled = applyRollingWindow(x, y, config.acrossXAgg);
        const trace = timingFloorTrace(rolled.x, rolled.y, config);
        trace.meta = { seriesName: 'timing', aggId, onXAgg, acrossXAgg: config.acrossXAgg || null };
        timingTraces.push(trace);
    });

    return timingTraces;
}

/**
 * Create floor shadow traces for all frequency series
 * Loops through all aggregation keys for each series type
 */
function createFloorShadowTraces(xPositions, frequencies) {
    const floorShadowTraces = [];

    // CORRECTS FLOOR SHADOW - loop through all agg keys (skip if no valid data)
    // Floor shadows do NOT apply rolling window — they show per-position floor markers only
    if (hasValidData(frequencies.correctsFloor)) {
        Object.entries(chartState.traceStyles[CORRECTS]).forEach(([aggId, config]) => {
            const onXAgg = config.onXAgg || 'raw';
            const { x, y } = applyAggregation(xPositions, frequencies.correctsFloor, onXAgg);
            const trace = createFloorShadowTrace(correctsTrace, x, y, config);
            trace.meta = { seriesName: 'correctsFloorShadow', aggId, onXAgg, acrossXAgg: config.acrossXAgg || null };
            floorShadowTraces.push(trace);
        });
    }

    // ERRORS FLOOR SHADOW (skip if no valid data)
    if (hasValidData(frequencies.errorsFloor)) {
        Object.entries(chartState.traceStyles[ERRORS]).forEach(([aggId, config]) => {
            const onXAgg = config.onXAgg || 'raw';
            const { x, y } = applyAggregation(xPositions, frequencies.errorsFloor, onXAgg);
            const trace = createFloorShadowTrace(errorTrace, x, y, config);
            trace.meta = { seriesName: 'errorsFloorShadow', aggId, onXAgg, acrossXAgg: config.acrossXAgg || null };
            floorShadowTraces.push(trace);
        });
    }

    // MISC FLOOR SHADOWS (dynamic)
    Object.entries(chartState.traceStyles.misc).forEach(([miscId, aggConfigs]) => {
        Object.entries(aggConfigs).forEach(([aggId, config]) => {
            const onXAgg = config.onXAgg || 'raw';
            const { x, y } = applyAggregation(xPositions, frequencies.miscFloor[miscId], onXAgg);
            const trace = createFloorShadowTrace(miscTrace, x, y, config);
            trace.meta = { seriesName: `${miscId}FloorShadow`, aggId, onXAgg, acrossXAgg: config.acrossXAgg || null };
            floorShadowTraces.push(trace);
        });
    });

    return floorShadowTraces;
}

/**
 * Create all frequency traces (segmented by line cuts)
 * Loops through all aggregation keys for each series type
 *
 * @param {Array<number>} xPositions - X-axis positions
 * @param {Object} frequencies - Frequency data for all series
 * @param {Function} timestampsToXPositions - Function to convert timestamps to x-positions
 * @returns {{traces: Array, autoAggregated: boolean}} Traces and auto-aggregation flag
 */
function createFrequencyTraces(xPositions, frequencies, timestampsToXPositions) {
    const dataTraces = [];
    const autoAggregatedSeries = new Set();

    // Get cut x-positions if any cuts exist
    let cutXPositions = [];
    if (chartState.LineCuts && Object.keys(chartState.LineCuts).length > 0) {
        const cutTimestamps = Object.values(chartState.LineCuts).map(cut => Math.floor(cut.date.getTime() / 1000));
        cutXPositions = timestampsToXPositions(cutTimestamps).map(x => x - 0.5);
        cutXPositions.sort((a, b) => a - b);
    }

    // For each series type, loop through all aggregation keys
    // CORRECTS (skip if no valid data)
    if (hasValidData(frequencies.corrects)) {
        Object.entries(chartState.traceStyles[CORRECTS]).forEach(([aggId, config]) => {
            const onXAgg = config.onXAgg || 'raw';
            const { x, y, autoAggregated: aa } = applyAggregation(xPositions, frequencies.corrects, onXAgg);
            if (aa) autoAggregatedSeries.add(CORRECTS);
            const rolled = applyRollingWindow(x, y, config.acrossXAgg);
            const segments = createSegments(rolled.x, rolled.y, cutXPositions, 'corrects');

            segments.forEach(seg => {
                const trace = correctsTrace(seg.x, seg.y, config);
                trace.meta = { seriesName: seg.seriesName, aggId, onXAgg, acrossXAgg: config.acrossXAgg || null };
                dataTraces.push(trace);
            });
        });
    }

    // ERRORS/INCORRECTS (skip if no valid data)
    if (hasValidData(frequencies.errors)) {
        Object.entries(chartState.traceStyles[ERRORS]).forEach(([aggId, config]) => {
            const onXAgg = config.onXAgg || 'raw';
            const { x, y, autoAggregated: aa } = applyAggregation(xPositions, frequencies.errors, onXAgg);
            if (aa) autoAggregatedSeries.add(ERRORS);
            const rolled = applyRollingWindow(x, y, config.acrossXAgg);
            const segments = createSegments(rolled.x, rolled.y, cutXPositions, 'errors');

            segments.forEach(seg => {
                const trace = errorTrace(seg.x, seg.y, config);
                trace.meta = { seriesName: seg.seriesName, aggId, onXAgg, acrossXAgg: config.acrossXAgg || null };
                dataTraces.push(trace);
            });
        });
    }

    // MISC (dynamic)
    Object.entries(chartState.traceStyles.misc).forEach(([miscId, aggConfigs]) => {
        Object.entries(aggConfigs).forEach(([aggId, config]) => {
            const onXAgg = config.onXAgg || 'raw';
            const { x, y, autoAggregated: aa } = applyAggregation(xPositions, frequencies.misc[miscId], onXAgg);
            if (aa) autoAggregatedSeries.add(miscId);
            const rolled = applyRollingWindow(x, y, config.acrossXAgg);
            const segments = createSegments(rolled.x, rolled.y, cutXPositions, miscId);

            segments.forEach(seg => {
                const trace = miscTrace(seg.x, seg.y, config);
                trace.meta = { seriesName: seg.seriesName, aggId, onXAgg, acrossXAgg: config.acrossXAgg || null };
                dataTraces.push(trace);
            });
        });
    });

    return { traces: dataTraces, autoAggregatedSeries };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    // Trace creation functions
    correctsTrace,
    errorTrace,
    timingFloorTrace,
    miscTrace,
    createFloorShadowTrace,
    // Aggregation and frequency logic
    applyAggregation,
    timingToFrequency,
    placeBelowFloor,
    isBelowFloor,
    calculateFrequencies,
    createSegments,
    // Pipeline functions
    createTimingTraces,
    createFloorShadowTraces,
    createFrequencyTraces
};