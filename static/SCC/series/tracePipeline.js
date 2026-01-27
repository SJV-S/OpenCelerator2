/**
 * Trace Pipeline - Complete aggregation pipeline and trace creation
 *
 * This module handles:
 * - Trace template functions for all series types
 * - Aggregation logic (median, mean, min, max, first, last, raw)
 * - Frequency calculations and floor thresholding
 * - Trace creation with segmentation and aggregation
 */

import { chartState } from '../chartState.js';
import { median, mean, min, max, first, last } from '../util/agg.js';

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
            color: config.markerFaceColor,
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
            size: config.textSize,
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
            color: config.markerFaceColor,
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
 * Floor shadow trace functions - inherit all styling from original traces
 * but force lines off (markers/text only)
 */
function correctsFloorTrace(xValues, yValues, config) {
    const trace = correctsTrace(xValues, yValues, config);
    trace.mode = trace.mode.replace('lines+', '').replace('+lines', '');
    trace.showlegend = false;
    return trace;
}

function errorsFloorTrace(xValues, yValues, config) {
    const trace = errorTrace(xValues, yValues, config);
    trace.mode = trace.mode.replace('lines+', '').replace('+lines', '');
    trace.showlegend = false;
    return trace;
}

function miscFloorTrace(xValues, yValues, config) {
    const trace = miscTrace(xValues, yValues, config);
    trace.mode = trace.mode.replace('lines+', '').replace('+lines', '');
    trace.showlegend = false;
    return trace;
}

// ============================================================================
// FREQUENCY LOGIC
// ============================================================================

/**
 * Apply aggregation to frequency data based on aggregation type.
 *
 * @param {Array<number>} data - Frequency data array
 * @param {string} aggType - Aggregation type (e.g., 'raw', 'median', 'min', 'max', 'mean', 'first', 'last')
 * @returns {Array<number>} Aggregated data
 */
function applyAggregation(data, aggType) {
    // If "raw", return data unchanged
    if (aggType === 'raw') {
        return data;
    }

    // For other aggregation types, apply the aggregation function
    // to get a single value, then create an array filled with that value
    let aggregatedValue;

    switch (aggType) {
        case 'median':
            aggregatedValue = median(data);
            break;
        case 'mean':
            aggregatedValue = mean(data);
            break;
        case 'min':
            aggregatedValue = min(data);
            break;
        case 'max':
            aggregatedValue = max(data);
            break;
        case 'first':
            aggregatedValue = first(data);
            break;
        case 'last':
            aggregatedValue = last(data);
            break;
        default:
            // Unknown aggregation type, return raw data
            return data;
    }

    // Return array filled with the aggregated value
    // This creates a horizontal line at the aggregated level
    return new Array(data.length).fill(aggregatedValue);
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
        return threshold * 0.75;
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

    // Calculate raw frequencies for fixed series
    const correctsFreqRaw = chartState.series.corrects.map((count, i) => count / timingMinutes[i]);
    const errorsFreqRaw = chartState.series.errors.map((count, i) => count / timingMinutes[i]);

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

    // Calculate frequencies for dynamic misc series
    Object.entries(chartState.series.misc).forEach(([miscId, data]) => {
        const miscFreqRaw = data.map((count, i) => count / timingMinutes[i]);
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
        // Apply aggregation to timing frequency data
        const aggregatedFreq = applyAggregation(timingFrequencies, aggType);

        // Deduplicate: keep only one entry when both x and y values are the same
        const seen = new Map();
        const deduplicatedX = [];
        const deduplicatedY = [];

        for (let i = 0; i < xPositions.length; i++) {
            const x = xPositions[i];
            const y = aggregatedFreq[i];
            const key = `${x}_${y}`;

            if (!seen.has(key)) {
                seen.set(key, true);
                deduplicatedX.push(x);
                deduplicatedY.push(y);
            }
        }

        const trace = timingFloorTrace(deduplicatedX, deduplicatedY, config);
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

    // CORRECTS FLOOR SHADOW - loop through all agg keys
    Object.entries(chartState.traceStyles.correct).forEach(([aggType, config]) => {
        // Apply aggregation to floor shadow data
        const aggregatedFloor = applyAggregation(frequencies.correctsFloor, aggType);

        const trace = correctsFloorTrace(xPositions, aggregatedFloor, config);
        trace.meta = {seriesName: 'correctsFloorShadow', aggType: aggType};
        floorShadowTraces.push(trace);
    });

    // ERRORS FLOOR SHADOW
    Object.entries(chartState.traceStyles.incorrect).forEach(([aggType, config]) => {
        const aggregatedFloor = applyAggregation(frequencies.errorsFloor, aggType);

        const trace = errorsFloorTrace(xPositions, aggregatedFloor, config);
        trace.meta = {seriesName: 'errorsFloorShadow', aggType: aggType};
        floorShadowTraces.push(trace);
    });

    // MISC FLOOR SHADOWS (dynamic)
    Object.entries(chartState.traceStyles.misc).forEach(([miscId, aggConfigs]) => {
        Object.entries(aggConfigs).forEach(([aggType, config]) => {
            const aggregatedFloor = applyAggregation(frequencies.miscFloor[miscId], aggType);

            const trace = miscFloorTrace(xPositions, aggregatedFloor, config);
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
 * @returns {Array} Array of all frequency traces
 */
function createFrequencyTraces(xPositions, frequencies, timestampsToXPositions) {
    const dataTraces = [];

    // Get cut x-positions if any cuts exist
    let cutXPositions = [];
    if (chartState.LineCuts && Object.keys(chartState.LineCuts).length > 0) {
        const cutTimestamps = Object.values(chartState.LineCuts).map(cut => Math.floor(cut.date.getTime() / 1000));
        cutXPositions = timestampsToXPositions(cutTimestamps).map(x => x - 0.5);
        cutXPositions.sort((a, b) => a - b);
    }

    // For each series type, loop through all aggregation keys
    // CORRECTS
    Object.entries(chartState.traceStyles.correct).forEach(([aggType, config]) => {
        // Apply aggregation to frequency data (placeholder for now)
        const aggregatedFreq = applyAggregation(frequencies.corrects, aggType);

        // Create segments from aggregated data
        const segments = createSegments(xPositions, aggregatedFreq, cutXPositions, 'corrects');

        // Create trace for each segment with this agg config
        segments.forEach(seg => {
            const trace = correctsTrace(seg.x, seg.y, config);
            trace.meta = {seriesName: seg.seriesName, aggType: aggType};
            dataTraces.push(trace);
        });
    });

    // ERRORS/INCORRECTS
    Object.entries(chartState.traceStyles.incorrect).forEach(([aggType, config]) => {
        const aggregatedFreq = applyAggregation(frequencies.errors, aggType);
        const segments = createSegments(xPositions, aggregatedFreq, cutXPositions, 'errors');

        segments.forEach(seg => {
            const trace = errorTrace(seg.x, seg.y, config);
            trace.meta = {seriesName: seg.seriesName, aggType: aggType};
            dataTraces.push(trace);
        });
    });

    // MISC (dynamic)
    Object.entries(chartState.traceStyles.misc).forEach(([miscId, aggConfigs]) => {
        Object.entries(aggConfigs).forEach(([aggType, config]) => {
            const aggregatedFreq = applyAggregation(frequencies.misc[miscId], aggType);
            const segments = createSegments(xPositions, aggregatedFreq, cutXPositions, miscId);

            segments.forEach(seg => {
                const trace = miscTrace(seg.x, seg.y, config);
                trace.meta = {seriesName: seg.seriesName, aggType: aggType};
                dataTraces.push(trace);
            });
        });
    });

    return dataTraces;
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
    correctsFloorTrace,
    errorsFloorTrace,
    miscFloorTrace,
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