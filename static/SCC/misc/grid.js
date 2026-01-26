// Store original shapes for grid restoration
let originalShapes = null;
let gridVisible = true;

/**
 * Remove grid but keep spines
 */
export function rmGrid() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartDiv.layout) {
        console.log('Chart not found');
        return;
    }

    const shapes = chartDiv.layout.shapes || [];
    console.log(`Found ${shapes.length} shapes`);

    const keepShapes = shapes.filter(shape => {
        // Keep if name contains 'spine' or 'tick'
        if (shape.name && (shape.name.indexOf('spine') !== -1 || shape.name.indexOf('tick') !== -1)) {
            return true;
        }

        // Keep bottom spine (no name, yref='paper', y < 0)
        if (!shape.name && shape.yref === 'paper' && shape.y0 < 0) {
            return true;
        }

        return false;
    });

    Plotly.relayout(chartDiv, {shapes: keepShapes});
    console.log(`Kept ${keepShapes.length} shapes`);
}

/**
 * Toggle grid visibility on/off
 * @param {boolean} show - If true, show grid; if false, hide grid
 */
export function toggleGrid(show) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartDiv.layout) {
        console.log('Chart not found');
        return;
    }

    const shapes = chartDiv.layout.shapes || [];

    if (show) {
        // Restore grid - show all shapes
        if (originalShapes !== null) {
            Plotly.relayout(chartDiv, {shapes: originalShapes});
            console.log('Grid restored');
        }
        gridVisible = true;
    } else {
        // Hide grid - store original shapes and filter
        if (originalShapes === null) {
            originalShapes = [...shapes];
        }

        const keepShapes = shapes.filter(shape => {
            // Keep if name contains 'spine' or 'tick'
            if (shape.name && (shape.name.indexOf('spine') !== -1 || shape.name.indexOf('tick') !== -1)) {
                return true;
            }

            // Keep bottom spine (no name, yref='paper', y < 0)
            if (!shape.name && shape.yref === 'paper' && shape.y0 < 0) {
                return true;
            }

            return false;
        });

        Plotly.relayout(chartDiv, {shapes: keepShapes});
        console.log('Grid hidden');
        gridVisible = false;
    }
}

/**
 * Initialize the grid toggle - store original shapes
 */
export function initGridToggle() {
    const chartDiv = document.getElementById('chart');
    if (chartDiv && chartDiv.layout && chartDiv.layout.shapes) {
        originalShapes = [...chartDiv.layout.shapes];
        gridVisible = true;
        console.log('Grid toggle initialized');
    }
}