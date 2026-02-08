import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';

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
    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartDiv.data) {
        console.log('Chart not found');
        return;
    }

    const gridIndices = getGridTraceIndices(chartDiv);

    if (gridIndices.length === 0) {
        console.log('No grid traces found');
        return;
    }

    Plotly.restyle(chartDiv, { visible: show }, gridIndices);
    gridVisible = show;
    console.log(show ? 'Grid shown' : 'Grid hidden');
}

/**
 * Toggle thick vertical lines (date lines)
 */
export function toggleDateLines(show) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartDiv.data) return;

    const indices = getTraceIndicesByNames(chartDiv, ['grid-major-vertical']);
    if (indices.length === 0) return;

    Plotly.restyle(chartDiv, { visible: show }, indices);
    dateLinesVisible = show;
}

/**
 * Toggle thick horizontal lines (count lines)
 */
export function toggleCountLines(show) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartDiv.data) return;

    const indices = getTraceIndicesByNames(chartDiv, ['grid-major-horizontal', 'grid-sub-horizontal']);
    if (indices.length === 0) return;

    Plotly.restyle(chartDiv, { visible: show }, indices);
    countLinesVisible = show;
}

/**
 * Toggle thin lines (minor grid)
 */
export function toggleMinorGrid(show) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartDiv.data) return;

    const indices = getTraceIndicesByNames(chartDiv, ['grid-minor-vertical', 'grid-minor-horizontal']);
    if (indices.length === 0) return;

    Plotly.restyle(chartDiv, { visible: show }, indices);
    minorGridVisible = show;
}

/**
 * Initialize the grid toggle
 */
export function initGridToggle() {
    const chartDiv = document.getElementById('chart');
    if (chartDiv && chartDiv.data) {
        const gridIndices = getGridTraceIndices(chartDiv);
        const g = chartState.lineVisibility.grid;
        gridVisible = g.dateLines || g.countLines || g.minorGrid;
        console.log(`Grid toggle initialized (${gridIndices.length} grid traces, visible: ${gridVisible})`);
    }

    // Re-apply per-component grid visibility after each replot (replot recreates grid traces as visible)
    eventBus.subscribe(EVENTS.DATA_CHART_REPLOT_COMPLETE, () => {
        const g = chartState.lineVisibility.grid;
        if (!g.dateLines) toggleDateLines(false);
        if (!g.countLines) toggleCountLines(false);
        if (!g.minorGrid) toggleMinorGrid(false);
        // Notify panning_controls so it can manage dynamic spines
        eventBus.emit(EVENTS.CHART_GRID_VISIBILITY_CHANGED, { save: false });
    });
}
