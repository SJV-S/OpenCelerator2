import { eventBus, EVENTS } from '../eventBus.js';

// Dynamic spine configuration
const LEFT_SPINE_NAME = 'dynamic-left-spine';
const RIGHT_SPINE_NAME = 'dynamic-right-spine';
import { COLORS } from '../config.js';
const SPINE_COLOR = COLORS.PRIMARY;
const SPINE_WIDTH = 2.5;
let gridVisible = true;

// Chart boundary configuration
const CHART_MARGIN = 0.2;
const CHART_X_MIN = -CHART_MARGIN;
const DEFAULT_MAX_WINDOW_WIDTH = 28.4;  // Default maximum allowed window width

// Chart-type specific configuration
const CHART_CONFIG = {
    Daily:    { xMax: 280, snapInterval: 7 },
    Weekly:   { xMax: 200, snapInterval: 4 },
    Monthly:  { xMax: 240, snapInterval: 6 },
    Yearly:   { xMax: 200, snapInterval: 5 },
    FrequencyCollections: { xMax: 280, snapInterval: 7 },
};

// Helper function to snap to nearest multiple of interval
function snapToNearest(value, interval) {
    return Math.round(value / interval) * interval;
}

// Constrain panning to x-axis range
function setupPanConstraints(plotDiv, maxWindowWidth, chartType) {
    // Use provided value or fall back to default
    const MAX_WINDOW_WIDTH = maxWindowWidth || DEFAULT_MAX_WINDOW_WIDTH;

    // Get chart-type specific config
    const config = CHART_CONFIG[chartType] || CHART_CONFIG.Daily;
    const CHART_X_MAX = config.xMax + CHART_MARGIN;
    const SNAP_INTERVAL = config.snapInterval;

    let isProgrammaticUpdate = false;
    let defaultWindowWidth = MAX_WINDOW_WIDTH;
    let isDragging = false;

    // Subscribe to panning enabled/disabled changes
    eventBus.subscribe(EVENTS.CHART_PANNING_ENABLED_CHANGED, (enabled) => {
        Plotly.relayout(plotDiv, { 'xaxis.fixedrange': !enabled });
    }, true);

    // Dynamic spines helper
    function updateDynamicSpines() {
        if (gridVisible) return;
        const shapes = plotDiv.layout.shapes || [];
        const xRange = plotDiv.layout.xaxis.range;
        const yRange = plotDiv.layout.yaxis.range;
        const yMin = Math.pow(10, yRange[0]);
        const yMax = Math.pow(10, yRange[1]);

        const otherShapes = shapes.filter(s => s.name !== LEFT_SPINE_NAME && s.name !== RIGHT_SPINE_NAME);
        const leftSpine = {
            type: 'line', x0: xRange[0] + 0.2, x1: xRange[0] + 0.2, y0: yMin, y1: yMax,
            yref: 'y', line: { color: SPINE_COLOR, width: SPINE_WIDTH },
            layer: 'below', name: LEFT_SPINE_NAME
        };
        const rightSpine = {
            type: 'line', x0: xRange[1] - 0.2, x1: xRange[1] - 0.2, y0: yMin, y1: yMax,
            yref: 'y', line: { color: SPINE_COLOR, width: SPINE_WIDTH },
            layer: 'below', name: RIGHT_SPINE_NAME
        };
        Plotly.relayout(plotDiv, { shapes: [...otherShapes, leftSpine, rightSpine] });
    }

    function removeDynamicSpines() {
        const shapes = plotDiv.layout.shapes || [];
        const filtered = shapes.filter(s => s.name !== LEFT_SPINE_NAME && s.name !== RIGHT_SPINE_NAME);
        if (filtered.length !== shapes.length) {
            Plotly.relayout(plotDiv, { shapes: filtered });
        }
    }

    // Subscribe to grid visibility changes
    eventBus.subscribe(EVENTS.CHART_GRID_VISIBILITY_CHANGED, ({ visible }) => {
        gridVisible = visible;
        visible ? removeDynamicSpines() : updateDynamicSpines();
    }, true);

    // Hide dynamic spines immediately when dragging starts
    plotDiv.on('plotly_relayouting', function() {
        if (!gridVisible && !isDragging) {
            isDragging = true;
            removeDynamicSpines();
        }
    });

    plotDiv.on('plotly_relayout', function(eventData) {
        // Ignore events triggered by our own updates
        if (isProgrammaticUpdate) {
            isProgrammaticUpdate = false;
            return;
        }

        // Handle autoscale button click
        if (eventData['xaxis.autorange'] === true) {
            isProgrammaticUpdate = true;
            Plotly.relayout(plotDiv, {
                'xaxis.autorange': false,
                'xaxis.range': [CHART_X_MIN, CHART_X_MIN + defaultWindowWidth]
            });
            return;
        }

        // Check if x-axis range changed (panning)
        if (eventData['xaxis.range[0]'] !== undefined && eventData['xaxis.range[1]'] !== undefined) {
            let xMin = eventData['xaxis.range[0]'];
            let xMax = eventData['xaxis.range[1]'];
            let rangeWidth = xMax - xMin;

            let needsUpdate = false;

            // Check if window width exceeds maximum - snap back to max width
            if (rangeWidth > MAX_WINDOW_WIDTH) {
                rangeWidth = MAX_WINDOW_WIDTH;
                needsUpdate = true;
            }

            // Snap to nearest interval and apply margin offset
            let snappedPos = snapToNearest(xMin, SNAP_INTERVAL);
            let newXMin = snappedPos - CHART_MARGIN;
            let newXMax = newXMin + rangeWidth;

            // Constrain left boundary
            if (newXMin < CHART_X_MIN) {
                newXMin = CHART_X_MIN;
                newXMax = CHART_X_MIN + rangeWidth;
                needsUpdate = true;
            }

            // Constrain right boundary
            if (newXMax > CHART_X_MAX) {
                newXMax = CHART_X_MAX;
                newXMin = CHART_X_MAX - rangeWidth;
                needsUpdate = true;
            }

            // Apply snapping and constraints
            if (newXMin !== xMin || newXMax !== xMax) {
                isProgrammaticUpdate = true;
                Plotly.relayout(plotDiv, {
                    'xaxis.range': [newXMin, newXMax]
                });
            }

            // Update dynamic spines position after panning
            isDragging = false;
            if (!gridVisible) {
                setTimeout(() => updateDynamicSpines(), 10);
            }
        }
    });
}

// Export as ES module
export { setupPanConstraints };
