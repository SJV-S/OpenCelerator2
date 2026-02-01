/**
 * Replot - Handles all Plotly rendering operations
 *
 * This module is responsible for:
 * - Orchestrating the complete chart refresh pipeline
 * - Calling tracePipeline.js to get traces
 * - Executing Plotly.react() and Plotly.addTraces()
 * - Managing chart state during replotting
 */

import { chartState } from '../chartState.js';
import { removeAllToasts, createToast } from '../util/toaster.js';
import {
    calculateFrequencies,
    createFrequencyTraces,
    createTimingTraces,
    createFloorShadowTraces
} from './tracePipeline.js';
import { initializeAllSeriesInputs } from './traceStyles.js';
import { AUTO_AGG_THRESHOLD } from '../config.js';
import { timestampsToXPositions, updateChartDateLabels } from '../util/dates.js';
import { eventBus, EVENTS } from '../eventBus.js';

/**
 * Complete chart refresh - from raw data to rendered Plotly chart
 * This is the main entry point for replotting the chart
 */
function refreshChart() {
    const chartDiv = document.getElementById('chart');

    // Remove all clickable objects before replotting
    eventBus.emit(EVENTS.NAV_LINE_CLICKABILITY_TOGGLE, { enabled: false });

    // Remove any toast notifications before replotting
    removeAllToasts();

    // Convert timestamps to x-positions
    const allX = timestampsToXPositions(chartState.series.xValues);
    const allFreq = calculateFrequencies();

    // Filter out points exceeding chart capacity
    const valid = allX.map(x => x <= chartState.chartCapacity);
    const m = (arr) => arr.filter((_, i) => valid[i]);
    const xPositions = m(allX);
    const frequencies = {
        corrects: m(allFreq.corrects),
        errors: m(allFreq.errors),
        correctsFloor: m(allFreq.correctsFloor),
        errorsFloor: m(allFreq.errorsFloor),
        misc: Object.fromEntries(Object.entries(allFreq.misc).map(([k, v]) => [k, m(v)])),
        miscFloor: Object.fromEntries(Object.entries(allFreq.miscFloor).map(([k, v]) => [k, m(v)]))
    };

    // Create all frequency traces (segmented by line cuts)
    const { traces: dataTraces, autoAggregatedSeries } = createFrequencyTraces(xPositions, frequencies, timestampsToXPositions);

    // Update chartState.traceStyles only for series that were auto-aggregated
    if (autoAggregatedSeries.size > 0) {
        if (!chartState._autoAggNotified) chartState._autoAggNotified = new Set();

        const displayNames = [];
        autoAggregatedSeries.forEach(seriesName => {
            if (chartState._autoAggNotified.has(seriesName)) return;

            const isMisc = seriesName.startsWith('misc');
            const styles = isMisc
                ? chartState.traceStyles.misc[seriesName]
                : chartState.traceStyles[seriesName];
            if (styles?.raw) {
                displayNames.push(styles.raw.seriesName);
                styles.median = styles.raw;
                delete styles.raw;
                chartState._autoAggNotified.add(seriesName);
            }
        });

        if (displayNames.length > 0) {
            initializeAllSeriesInputs();
            createToast({
                message: `Auto-aggregated to median: ${displayNames.join(', ')} (>${AUTO_AGG_THRESHOLD} points/position)`,
                duration: 4000
            });
        }
    }

    // Add timing traces (no segmenting) - returns array now
    const timingTraces = createTimingTraces(xPositions);
    dataTraces.push(...timingTraces);

    // Add floor shadow traces (no segmenting)
    const floorShadowTraces = createFloorShadowTraces(xPositions, frequencies);
    dataTraces.push(...floorShadowTraces);

    // IMPORTANT! Keep permanent traces: grid (0-4) + placeholder (5-6)
    // If you add/remove base traces in the Python chart classes, update this number!
    const updatedData = [
        ...chartDiv.data.slice(0, 7),
        ...dataTraces
    ];

    // Check if data traces already exist
    const dataTracesExist = chartDiv.data.length > 2;
    if (dataTracesExist) {
        // Update existing traces with new data using Plotly.react()
        // Disable Plotly's legend - we use custom legend instead
        const layout = {
            ...chartDiv.layout,
            showlegend: false
        };
        Plotly.react(chartDiv, updatedData, layout);
    } else {
        // First time adding data - add new traces to the existing chart
        Plotly.addTraces(chartDiv, dataTraces);
        // Disable Plotly's legend
        Plotly.relayout(chartDiv, {
            showlegend: false
        });
    }

    // Update date labels in chart annotations
    if (chartState.startDate) {
        updateChartDateLabels(chartDiv, chartState.startDate);
    }

    // Emit event to render custom legend
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);

    // Notify that chart replot is complete (cel lines subscribe to this)
    eventBus.emit(EVENTS.DATA_CHART_REPLOT_COMPLETE);
}

/**
 * Initialize subscriptions for this module
 * Called by main.js coordinator
 */
function init() {
    // Subscribe to chart refresh events from various sources
    eventBus.subscribe(EVENTS.DATA_CHART_REFRESH, () => {
        refreshChart();
    });
}

export { refreshChart, init };