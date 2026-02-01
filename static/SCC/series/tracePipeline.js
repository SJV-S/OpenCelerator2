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
import { CORRECTS, ERRORS, LIMITS, CHART_MATH } from '../config.js';
import { median, mean, min, max, first, last, sum, aggregateByX } from '../util/agg.js';

const AUTO_AGG_THRESHOLD = LIMITS.AUTO_AGG_THRESHOLD;

// ============================================================================
// TRACE CREATION FUNCTIONS
// ============================================================================

function correctsTrace(xValues, yValues, config) {
    return {
        x: xValues,
        y: yValues,
        mode: config.showLine ? 'lines+markers' : 'markers',
        line: {
            color: config.lineColor,
            width: config.lineWidth
        },
        marker: {
            symbol: config.markerSymbol,
            size: config.markerSize,
            color: config.markerColor,
            line: {
                color: config.markerEdgeColor,
                width: 1
            }
        },
        name: config.seriesName,
        connectgaps: true,
        hoverinfo: 'none',
        hovertemplate: '%{y}'
    };
}

function errorTrace(xValues, yValues, config) {
    return {
        x: xValues,
        y: yValues,
        mode: config.showLine ? 'lines+text' : 'text',
        line: {
            color: config.lineColor,
            width: config.lineWidth
        },
        text: Array(xValues.length).fill('x'),
        textposition: 'middle center',
        textfont: {
            size: config.markerSize,
            color: config.markerColor
        },
        name: config.seriesName,
        connectgaps: true,
        hoverinfo: 'none',
        hovertemplate: '%{y}'
    };
}

function timingFloorTrace(xValues, yValues, config) {
    return {
        x: xValues,
        y: yValues,
        mode: config.showLine ? 'lines+text' : 'text',
        line: {
            color: config.lineColor,
            width: config.lineWidth
        },
        text: Array(xValues.length).fill('-'),
        textposition: 'middle center',
        textfont: {
            size: config.markerSize,
            color: config.markerColor
        },
        name: config.seriesName,
        connectgaps: true,
        hoverinfo: 'none',
        hovertemplate: '%{y}'
    };
}

function miscTrace(xValues, yValues, config) {
    return {
        x: xValues,
        y: yValues,
        mode: config.showLine ? 'lines+markers' : 'markers',
        line: {
            color: config.lineColor,
            width: config.lineWidth
        },
        marker: {
            symbol: config.markerSymbol,
            size: config.markerSize,
            color: config.markerColor,
            line: {
                color: config.markerEdgeColor,
                width: 1
            }
        },
        name: config.seriesName,
        connectgaps: false,
        hoverinfo: 'none',
        hovertemplate: '%{y}'
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

/**
 * Apply aggregation to frequency data based on aggregation type.
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

    // Map aggType to aggregation function
    const aggFunctions = {
        median: median,
        mean: mean,
        min: min,
        max: max,
        first: first,
        last: last,
        sum: sum
    };

    const aggFn = aggFunctions[aggType];
    if (!aggFn) {
        return { x: xPositions, y: yData, autoAggregated: false };
    }

    return { ...aggregateByX(xPositions, yData, aggFn), autoAggregated: false };
}

/**
 * Convert timing values to frequency values (inverse)
 */
function timingToFrequency(timingArray) {
    return timingArray.map(t => 1 / t);
}

/**
 * Apply floor threshold to a frequency value
 */
function placeBelowFloor(freq, timing) {
    if (isNaN(freq) || isNaN(timing) || timing <= 0) {
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
    if (isNaN(freq) || isNaN(timing) || timing <= 0) return false;
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
 */
function calculateFrequencies() {
    // Non-minute charts use timing of 1 for all points (raw counts, but floor still works for zeros)
    const timingMinutes = chartState.minuteChart
        ? chartState.series.timing
        : chartState.series.timing.map(() => 1);

    // Helper: convert zeros to NaN when placeZerosBelowFloor is false
    const handleZero = (freq) => {
        if (freq === 0 && !chartState.placeZerosBelowFloor) return NaN;
        return freq;
    };

    // Calculate raw frequencies for fixed series (convert zeros to NaN if setting is off)
    const correctsFreqRaw = chartState.series.corrects.map((count, i) => handleZero(count / timingMinutes[i]));
    const errorsFreqRaw = chartState.series.errors.map((count, i) => handleZero(count / timingMinutes[i]));

    // Create original frequency arrays (below-floor values set to NaN)
    const correctsFreq = correctsFreqRaw.map((freq, i) =>
        isBelowFloor(freq, timingMinutes[i]) ? NaN : freq
    );
    const errorsFreq = errorsFreqRaw.map((freq, i) =>
        isBelowFloor(freq, timingMinutes[i]) ? NaN : freq
    );

    // Create floor-adjusted shadow arrays (only show floor-adjusted values, above-floor as NaN)
    const correctsFloor = correctsFreqRaw.map((freq, i) =>
        isBelowFloor(freq, timingMinutes[i]) ? placeBelowFloor(freq, timingMinutes[i]) : NaN
    );
    const errorsFloor = errorsFreqRaw.map((freq, i) =>
        isBelowFloor(freq, timingMinutes[i]) ? placeBelowFloor(freq, timingMinutes[i]) : NaN
    );

    const result = {
        corrects: correctsFreq,
        errors: errorsFreq,
        correctsFloor: correctsFloor,
        errorsFloor: errorsFloor,
        misc: {},
        miscFloor: {}
    };

    // Calculate frequencies for dynamic misc series (convert zeros to NaN if setting is off)
    Object.entries(chartState.series.misc).forEach(([miscId, data]) => {
        const miscFreqRaw = data.map((count, i) => handleZero(count / timingMinutes[i]));

        result.misc[miscId] = miscFreqRaw.map((freq, i) =>
            isBelowFloor(freq, timingMinutes[i]) ? NaN : freq
        );

        result.miscFloor[miscId] = miscFreqRaw.map((freq, i) =>
            isBelowFloor(freq, timingMinutes[i]) ? placeBelowFloor(freq, timingMinutes[i]) : NaN
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
    Object.entries(chartState.traceStyles.timing).forEach(([aggType, config]) => {
        const { x, y } = applyAggregation(xPositions, timingFrequencies, aggType);
        const trace = timingFloorTrace(x, y, config);
        trace.meta = {seriesName: 'timing', aggType: aggType};
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
    if (hasValidData(frequencies.correctsFloor)) {
        Object.entries(chartState.traceStyles[CORRECTS]).forEach(([aggType, config]) => {
            const { x, y } = applyAggregation(xPositions, frequencies.correctsFloor, aggType);
            const trace = createFloorShadowTrace(correctsTrace, x, y, config);
            trace.meta = {seriesName: 'correctsFloorShadow', aggType: aggType};
            floorShadowTraces.push(trace);
        });
    }

    // ERRORS FLOOR SHADOW (skip if no valid data)
    if (hasValidData(frequencies.errorsFloor)) {
        Object.entries(chartState.traceStyles[ERRORS]).forEach(([aggType, config]) => {
            const { x, y } = applyAggregation(xPositions, frequencies.errorsFloor, aggType);
            const trace = createFloorShadowTrace(errorTrace, x, y, config);
            trace.meta = {seriesName: 'errorsFloorShadow', aggType: aggType};
            floorShadowTraces.push(trace);
        });
    }

    // MISC FLOOR SHADOWS (dynamic)
    Object.entries(chartState.traceStyles.misc).forEach(([miscId, aggConfigs]) => {
        Object.entries(aggConfigs).forEach(([aggType, config]) => {
            const { x, y } = applyAggregation(xPositions, frequencies.miscFloor[miscId], aggType);
            const trace = createFloorShadowTrace(miscTrace, x, y, config);
            trace.meta = {seriesName: `${miscId}FloorShadow`, aggType: aggType};
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
        Object.entries(chartState.traceStyles[CORRECTS]).forEach(([aggType, config]) => {
            const { x, y, autoAggregated: aa } = applyAggregation(xPositions, frequencies.corrects, aggType);
            if (aa) autoAggregatedSeries.add(CORRECTS);
            const segments = createSegments(x, y, cutXPositions, 'corrects');

            segments.forEach(seg => {
                const trace = correctsTrace(seg.x, seg.y, config);
                trace.meta = {seriesName: seg.seriesName, aggType: aggType};
                dataTraces.push(trace);
            });
        });
    }

    // ERRORS/INCORRECTS (skip if no valid data)
    if (hasValidData(frequencies.errors)) {
        Object.entries(chartState.traceStyles[ERRORS]).forEach(([aggType, config]) => {
            const { x, y, autoAggregated: aa } = applyAggregation(xPositions, frequencies.errors, aggType);
            if (aa) autoAggregatedSeries.add(ERRORS);
            const segments = createSegments(x, y, cutXPositions, 'errors');

            segments.forEach(seg => {
                const trace = errorTrace(seg.x, seg.y, config);
                trace.meta = {seriesName: seg.seriesName, aggType: aggType};
                dataTraces.push(trace);
            });
        });
    }

    // MISC (dynamic)
    Object.entries(chartState.traceStyles.misc).forEach(([miscId, aggConfigs]) => {
        Object.entries(aggConfigs).forEach(([aggType, config]) => {
            const { x, y, autoAggregated: aa } = applyAggregation(xPositions, frequencies.misc[miscId], aggType);

            if (aa) autoAggregatedSeries.add(miscId);
            const segments = createSegments(x, y, cutXPositions, miscId);

            segments.forEach(seg => {
                const trace = miscTrace(seg.x, seg.y, config);
                trace.meta = {seriesName: seg.seriesName, aggType: aggType};
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