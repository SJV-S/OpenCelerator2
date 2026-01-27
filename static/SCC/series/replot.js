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
import { removeAllToasts } from '../util/toaster.js';
import {
    calculateFrequencies,
    createFrequencyTraces,
    createTimingTraces,
    createFloorShadowTraces
} from './tracePipeline.js';
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
    const xPositions = timestampsToXPositions(chartState.series.xValues);

    // Calculate frequencies from raw data
    const frequencies = calculateFrequencies();

    // Create all frequency traces (segmented by line cuts)
    const dataTraces = createFrequencyTraces(xPositions, frequencies, timestampsToXPositions);

    // Add timing traces (no segmenting) - returns array now
    const timingTraces = createTimingTraces(xPositions);
    dataTraces.push(...timingTraces);

    // Add floor shadow traces (no segmenting)
    const floorShadowTraces = createFloorShadowTraces(xPositions, frequencies);
    dataTraces.push(...floorShadowTraces);

    // Combine placeholder traces with data traces
    const updatedData = [
        ...chartDiv.data.slice(0, 2), // Keep placeholder traces
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