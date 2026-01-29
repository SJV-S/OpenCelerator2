// Track grid visibility state
let gridVisible = true;

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
 * Remove grid (hide grid traces)
 */
export function rmGrid() {
    toggleGrid(false);
}

/**
 * Initialize the grid toggle
 */
export function initGridToggle() {
    const chartDiv = document.getElementById('chart');
    if (chartDiv && chartDiv.data) {
        const gridIndices = getGridTraceIndices(chartDiv);
        gridVisible = true;
        console.log(`Grid toggle initialized (${gridIndices.length} grid traces)`);
    }
}
