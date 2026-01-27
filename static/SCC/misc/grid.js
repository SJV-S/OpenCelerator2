// Store grid shapes (the ones we hide) for restoration
let gridShapes = null;
let gridVisible = true;

/**
 * Check if a shape should be kept when hiding grid
 */
function isNonGridShape(shape) {
    // Keep if name contains 'spine' or 'tick'
    if (shape.name && (shape.name.indexOf('spine') !== -1 || shape.name.indexOf('tick') !== -1)) {
        return true;
    }

    // Keep bottom spine (no name, yref='paper', y < 0)
    if (!shape.name && shape.yref === 'paper' && shape.y0 < 0) {
        return true;
    }

    // Keep fan shapes and user-drawn lines
    if (shape.name && (
        shape.name.startsWith('fan-') ||
        shape.name.startsWith('phase-') ||
        shape.name.startsWith('aim-') ||
        shape.name.startsWith('cut-') ||
        shape.name.startsWith('cel-')
    )) {
        return true;
    }

    return false;
}

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

    const keepShapes = shapes.filter(isNonGridShape);

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
        // Restore grid - add back grid shapes to current shapes
        if (gridShapes !== null && gridShapes.length > 0) {
            // Get current non-grid shapes (fan, user lines, etc.)
            const currentNonGridShapes = shapes.filter(isNonGridShape);
            // Combine with stored grid shapes
            const restoredShapes = [...gridShapes, ...currentNonGridShapes];
            Plotly.relayout(chartDiv, {shapes: restoredShapes});
            console.log('Grid restored');
        }
        gridVisible = true;
    } else {
        // Hide grid - store grid shapes and keep only non-grid shapes
        // Grid shapes are anything that's NOT a non-grid shape
        gridShapes = shapes.filter(shape => !isNonGridShape(shape));
        const keepShapes = shapes.filter(isNonGridShape);

        Plotly.relayout(chartDiv, {shapes: keepShapes});
        console.log('Grid hidden');
        gridVisible = false;
    }
}

/**
 * Initialize the grid toggle - store grid shapes for potential restoration
 */
export function initGridToggle() {
    const chartDiv = document.getElementById('chart');
    if (chartDiv && chartDiv.layout && chartDiv.layout.shapes) {
        // Store only the grid shapes (not non-grid shapes like fan, user lines)
        gridShapes = chartDiv.layout.shapes.filter(shape => !isNonGridShape(shape));
        gridVisible = true;
        console.log('Grid toggle initialized');
    }
}