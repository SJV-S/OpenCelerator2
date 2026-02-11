/**
 * Replot - Handles all Plotly rendering operations
 *
 * This module is responsible for:
 * - Orchestrating the complete chart refresh pipeline
 * - Calling tracePipeline.js to get traces
 * - Executing react() and addTraces()
 * - Managing chart state during replotting
 */

import { chartState } from '../chartState.js';
import { removeAllToasts, createToast } from '../ui/toaster.js';
import { react, addTraces, relayout } from '../util/plotlyWrapper.js';
import { getChartDiv } from '../util/dom.js';
import {
    calculateFrequencies,
    createFrequencyTraces,
    createTimingTraces,
    createFloorShadowTraces
} from './tracePipeline.js';
import { initializeAllSeriesInputs } from './traceStyles.js';
import { LIMITS } from '../config.js';
import { timestampsToXPositions, updateChartDateLabels } from '../util/dates.js';
import { eventBus, EVENTS } from '../eventBus.js';

/**
 * Complete chart refresh - from raw data to rendered Plotly chart
 * This is the main entry point for replotting the chart
 */
function refreshChart() {
    const chartDiv = getChartDiv();

    // Remove all clickable objects before replotting
    eventBus.emit(EVENTS.NAV_LINE_CLICKABILITY_TOGGLE, { enabled: false });

    // Remove any toast notifications before replotting
    removeAllToasts();

    // Sort data chronologically (prevents zigzag lines when data entered out of order)
    const order = chartState.series.xValues.map((_, i) => i).sort((a, b) =>
        chartState.series.xValues[a] - chartState.series.xValues[b]
    );
    const sort = (arr) => order.map(i => arr[i]);

    // Convert timestamps to x-positions
    const allX = timestampsToXPositions(sort(chartState.series.xValues));
    const allFreq = calculateFrequencies(sort);

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
        const displayNames = [];
        autoAggregatedSeries.forEach(seriesName => {
            const isMisc = seriesName.startsWith('misc');
            const styles = isMisc
                ? chartState.traceStyles.misc[seriesName]
                : chartState.traceStyles[seriesName];
            if (!styles) return;
            // Mutate onXAgg on configs that are still "raw" (counter key stays the same)
            Object.values(styles).forEach(config => {
                if (config.onXAgg === 'raw') {
                    displayNames.push(config.seriesName);
                    config.onXAgg = 'median';
                }
            });
        });

        if (displayNames.length > 0) {
            initializeAllSeriesInputs();
            eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);
            createToast({
                message: `Auto-aggregated to median: ${displayNames.join(', ')} (>${LIMITS.AUTO_AGG_THRESHOLD} points/position)`,
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
        // Update existing traces with new data using react()
        // Disable Plotly's legend - we use custom legend instead
        const layout = {
            ...chartDiv.layout,
            showlegend: false
        };
        react(chartDiv, updatedData, layout);
    } else {
        // First time adding data - add new traces to the existing chart
        addTraces(chartDiv, dataTraces);
        // Disable Plotly's legend
        relayout(chartDiv, {
            showlegend: false
        });
    }

    // Update date labels in chart annotations
    if (chartState.startDate) {
        updateChartDateLabels(chartDiv, chartState.startDate);
    }

    // Render legend without triggering auto-save (this fires on every chart open/refresh)
    eventBus.emit(EVENTS.UI_LEGEND_RENDER, { save: false });

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