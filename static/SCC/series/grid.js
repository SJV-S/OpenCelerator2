import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { restyle } from '../util/plotlyWrapper.js';
import { getChartDiv } from '../util/dom.js';

// Track grid visibility state
let gridVisible = true;
let dateLinesVisible = true;
let countLinesVisible = true;
let minorGridVisible = true;

/**
 * Get indices of grid traces (traces with names starting with 'grid-')
 */
function getGridTraceIndices(chartDiv) {
    const indices = [];
    if (chartDiv.data) {
        chartDiv.data.forEach((trace, i) => {
            if (trace.name && trace.name.startsWith('grid-')) {
                indices.push(i);
            }
        });
    }
    return indices;
}

/**
 * Get indices of traces matching specific names
 */
function getTraceIndicesByNames(chartDiv, names) {
    const indices = [];
    if (chartDiv.data) {
        chartDiv.data.forEach((trace, i) => {
            if (trace.name && names.includes(trace.name)) {
                indices.push(i);
            }
        });
    }
    return indices;
}

/**
 * Toggle grid visibility on/off
 * @param {boolean} show - If true, show grid; if false, hide grid
 */
export function toggleGrid(show) {
    const chartDiv = getChartDiv();
    if (!chartDiv || !chartDiv.data) {
        return;
    }

    const gridIndices = getGridTraceIndices(chartDiv);

    if (gridIndices.length === 0) {
        return;
    }

    restyle(chartDiv, { visible: show }, gridIndices);
    gridVisible = show;
}

/**
 * Toggle thick vertical lines (date lines)
 */
export function toggleDateLines(show) {
    const chartDiv = getChartDiv();
    if (!chartDiv || !chartDiv.data) return;

    const indices = getTraceIndicesByNames(chartDiv, ['grid-major-vertical']);
    if (indices.length === 0) return;

    restyle(chartDiv, { visible: show }, indices);
    dateLinesVisible = show;
}

/**
 * Toggle thick horizontal lines (count lines)
 */
export function toggleCountLines(show) {
    const chartDiv = getChartDiv();
    if (!chartDiv || !chartDiv.data) return;

    const indices = getTraceIndicesByNames(chartDiv, ['grid-major-horizontal', 'grid-sub-horizontal']);
    if (indices.length === 0) return;

    restyle(chartDiv, { visible: show }, indices);
    countLinesVisible = show;
}

/**
 * Toggle thin lines (minor grid)
 */
export function toggleMinorGrid(show) {
    const chartDiv = getChartDiv();
    if (!chartDiv || !chartDiv.data) return;

    const indices = getTraceIndicesByNames(chartDiv, ['grid-minor-vertical', 'grid-minor-horizontal']);
    if (indices.length === 0) return;

    restyle(chartDiv, { visible: show }, indices);
    minorGridVisible = show;
}

/**
 * Apply per-component grid visibility from chartState
 */
function applyGridVisibility() {
    const g = chartState.lineVisibility.grid;
    toggleDateLines(g.dateLines);
    toggleCountLines(g.countLines);
    toggleMinorGrid(g.minorGrid);
    gridVisible = g.dateLines || g.countLines || g.minorGrid;
}

/**
 * Initialize the grid toggle
 */
export function initGridToggle() {
    const chartDiv = getChartDiv();
    if (chartDiv && chartDiv.data) {
        const g = chartState.lineVisibility.grid;
        gridVisible = g.dateLines || g.countLines || g.minorGrid;
    }

    // Re-apply per-component grid visibility after each replot (replot recreates grid traces as visible)
    eventBus.subscribe(EVENTS.DATA_CHART_REPLOT_COMPLETE, () => {
        applyGridVisibility();
        // Notify panning_controls so it can manage dynamic spines
        eventBus.emit(EVENTS.CHART_GRID_VISIBILITY_CHANGED, { save: false });
    });

    // Handle user-initiated grid toggles from main.js and customLegend.js
    eventBus.subscribe(EVENTS.CHART_GRID_VISIBILITY_CHANGED, (data) => {
        // Skip render-only emits from the replot subscriber above (already applied)
        if (data?.save === false) return;
        applyGridVisibility();
    }, true);
}
