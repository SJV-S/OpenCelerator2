/**
 * Crosshair Mode - Shows crosshair lines and data info panel on Shift+hover
 *
 * When Shift is held and mouse moves over chart:
 * - Gray dashed crosshair lines track cursor position
 * - Sidebar shows data values at current x-position
 * - Each trace displays: series name, value, aggregation type
 *
 * Releasing Shift restores the normal sidebar tabs.
 */

import { chartState } from '../chartState.js';
import { CORRECTS, ERRORS } from '../config.js';
import { xPositionToDate } from './dates.js';
import { formatValue } from './format.js';

// Crosshair state
const crosshairState = {
    active: false,
    shiftHeld: false,
    previousActiveTab: null,
    mouseMoveHandler: null,
    lastUpdateTime: 0,
    throttleDelay: 33  // ~30fps
};

/**
 * Marker style configuration by series type.
 * toPixels: multiply by chartState value to get rendered pixel size
 */
const MARKER_STYLES = {
    corrects: { color: '#22c55e', shape: 'circle', toPixels: 1.0 },
    errors: { color: '#ef4444', shape: 'circle', toPixels: 0.54 },
    timing: { color: '#a855f7', shape: 'triangle', toPixels: 0.30 },
    misc: { color: '#f97316', shape: 'square', toPixels: 1.3 }
};

/**
 * Pixels added to visual size to get overlay size.
 */
const OVERLAY_PADDING = 8;

/**
 * Activate crosshair mode - called when Shift is pressed
 */
function activateCrosshair() {
    if (crosshairState.active) return;

    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    crosshairState.active = true;

    // Store the currently active tab
    const activeTab = document.querySelector('.chart-menu-tab-pane.active');
    if (activeTab) {
        crosshairState.previousActiveTab = activeTab.id;
    }

    // Hide tabs and all tab panes
    const tabs = document.querySelector('.chart-menu-tabs');
    if (tabs) tabs.style.display = 'none';

    document.querySelectorAll('.chart-menu-tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });

    // Show crosshair content
    const crosshairContent = document.getElementById('crosshair-content');
    if (crosshairContent) {
        crosshairContent.classList.add('active');
    }

    // Show the overlay on mobile if hidden
    const overlay = document.getElementById('counter-overlay');
    if (overlay && overlay.style.display === 'none') {
        overlay.style.display = 'flex';
    }

    // Set up mousemove handler
    crosshairState.mouseMoveHandler = (event) => handleMouseMove(event, chartDiv);
    chartDiv.addEventListener('mousemove', crosshairState.mouseMoveHandler);
}

/**
 * Deactivate crosshair mode - called when Shift is released
 */
function deactivateCrosshair() {
    if (!crosshairState.active) return;

    const chartDiv = document.getElementById('chart');
    crosshairState.active = false;

    // Remove mousemove handler
    if (chartDiv && crosshairState.mouseMoveHandler) {
        chartDiv.removeEventListener('mousemove', crosshairState.mouseMoveHandler);
        crosshairState.mouseMoveHandler = null;
    }

    // Remove crosshair lines
    removeCrosshairLines();

    // Hide crosshair content
    const crosshairContent = document.getElementById('crosshair-content');
    if (crosshairContent) {
        crosshairContent.classList.remove('active');
    }

    // Restore tabs
    const tabs = document.querySelector('.chart-menu-tabs');
    if (tabs) tabs.style.display = '';

    // Restore previous active tab
    if (crosshairState.previousActiveTab) {
        const previousPane = document.getElementById(crosshairState.previousActiveTab);
        if (previousPane) {
            previousPane.classList.add('active');
        }

        // Also restore the tab button active state
        const tabName = crosshairState.previousActiveTab.replace('-content', '');
        const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
        if (tabButton) {
            tabButton.classList.add('active');
        }
    }

    // On mobile, hide overlay if it was hidden before
    // (For simplicity, we leave it visible - user can dismiss with swipe/space)
}

/**
 * Handle mouse movement - update crosshair and info panel
 */
function handleMouseMove(event, chartDiv) {
    // Throttle updates
    const now = Date.now();
    if (now - crosshairState.lastUpdateTime < crosshairState.throttleDelay) {
        return;
    }
    crosshairState.lastUpdateTime = now;

    const coords = getPlotCoordinates(event, chartDiv);
    if (!coords) {
        removeCrosshairLines();
        return;
    }

    // Update crosshair lines
    updateCrosshairLines(coords.x, coords.y);

    // Update data point markers
    const xRounded = Math.round(coords.x);
    updateDataMarkers(xRounded, chartDiv);

    // Update info panel
    updateInfoPanel(coords.x, coords.y, chartDiv);
}

/**
 * Get plot coordinates from mouse event
 */
function getPlotCoordinates(event, chartDiv) {
    const rect = chartDiv.getBoundingClientRect();
    const xPixel = event.clientX - rect.left;
    const yPixel = event.clientY - rect.top;
    const layout = chartDiv.layout;

    if (!layout || !layout.xaxis || !layout.yaxis) {
        return null;
    }

    const plotLeft = layout.margin.l;
    const plotRight = rect.width - layout.margin.r;
    const plotTop = layout.margin.t;
    const plotBottom = rect.height - layout.margin.b;

    // Check if cursor is within plot area
    if (xPixel < plotLeft || xPixel > plotRight || yPixel < plotTop || yPixel > plotBottom) {
        return null;
    }

    // Calculate x value (linear scale)
    const xFraction = (xPixel - plotLeft) / (plotRight - plotLeft);
    const xRange = layout.xaxis.range;
    const xValue = xRange[0] + xFraction * (xRange[1] - xRange[0]);

    // Calculate y value (log scale)
    const yFraction = 1 - (yPixel - plotTop) / (plotBottom - plotTop);
    const yRange = layout.yaxis.range;
    const yLogValue = yRange[0] + yFraction * (yRange[1] - yRange[0]);
    const yValue = Math.pow(10, yLogValue);

    return { x: xValue, y: yValue };
}

/**
 * Get or create DOM crosshair line elements
 */
function getOrCreateCrosshairLines() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return null;

    let container = document.getElementById('crosshair-lines');
    if (!container) {
        container = document.createElement('div');
        container.id = 'crosshair-lines';
        container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 50;
        `;

        const vLine = document.createElement('div');
        vLine.id = 'crosshair-v';
        vLine.style.cssText = `
            position: absolute;
            width: 1px;
            background: repeating-linear-gradient(
                to bottom,
                gray 0px, gray 4px,
                transparent 4px, transparent 8px
            );
            display: none;
        `;

        const hLine = document.createElement('div');
        hLine.id = 'crosshair-h';
        hLine.style.cssText = `
            position: absolute;
            height: 1px;
            background: repeating-linear-gradient(
                to right,
                gray 0px, gray 4px,
                transparent 4px, transparent 8px
            );
            display: none;
        `;

        container.appendChild(vLine);
        container.appendChild(hLine);
        chartDiv.appendChild(container);
    }

    return {
        vLine: document.getElementById('crosshair-v'),
        hLine: document.getElementById('crosshair-h')
    };
}

/**
 * Update crosshair lines on chart using DOM elements
 */
function updateCrosshairLines(xValue, yValue) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartDiv.layout) return;

    const lines = getOrCreateCrosshairLines();
    if (!lines) return;

    const layout = chartDiv.layout;
    const rect = chartDiv.getBoundingClientRect();

    // Get plot area bounds
    const plotLeft = layout.margin.l;
    const plotRight = rect.width - layout.margin.r;
    const plotTop = layout.margin.t;
    const plotBottom = rect.height - layout.margin.b;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;

    // Calculate x pixel position
    const xRange = layout.xaxis.range;
    const xFraction = (xValue - xRange[0]) / (xRange[1] - xRange[0]);
    const xPixel = plotLeft + xFraction * plotWidth;

    // Calculate y pixel position (log scale)
    const yRange = layout.yaxis.range;
    const yLog = Math.log10(yValue);
    const yFraction = (yLog - yRange[0]) / (yRange[1] - yRange[0]);
    const yPixel = plotBottom - yFraction * plotHeight;

    // Update vertical line
    lines.vLine.style.left = `${xPixel}px`;
    lines.vLine.style.top = `${plotTop}px`;
    lines.vLine.style.height = `${plotHeight}px`;
    lines.vLine.style.display = 'block';

    // Update horizontal line
    lines.hLine.style.left = `${plotLeft}px`;
    lines.hLine.style.top = `${yPixel}px`;
    lines.hLine.style.width = `${plotWidth}px`;
    lines.hLine.style.display = 'block';
}

/**
 * Remove crosshair lines from chart
 */
function removeCrosshairLines() {
    const vLine = document.getElementById('crosshair-v');
    const hLine = document.getElementById('crosshair-h');

    if (vLine) vLine.style.display = 'none';
    if (hLine) hLine.style.display = 'none';

    // Also clear markers
    clearDataMarkers();
}

/**
 * Get overlay marker size for a given series
 * @param {string} seriesType - 'corrects', 'errors', 'timing', or misc ID
 * @returns {number} The overlay size in pixels
 */
function getMarkerSize(seriesType) {
    let chartSize, style;

    if (seriesType === 'corrects') {
        chartSize = chartState.traceStyles[CORRECTS]?.raw?.markerSize ?? 8;
        style = MARKER_STYLES.corrects;
    } else if (seriesType === 'errors') {
        chartSize = chartState.traceStyles[ERRORS]?.raw?.textSize ?? 20;
        style = MARKER_STYLES.errors;
    } else if (seriesType === 'timing') {
        chartSize = chartState.traceStyles.timing?.raw?.markerSize ?? 30;
        style = MARKER_STYLES.timing;
    } else if (seriesType.startsWith('misc')) {
        chartSize = chartState.traceStyles.misc[seriesType]?.raw?.markerSize ?? 8;
        style = MARKER_STYLES.misc;
    } else {
        chartSize = 8;
        style = MARKER_STYLES.misc;
    }

    // Convert to visual pixels, then apply overlay multiplier
    const visualPixels = chartSize * style.toPixels;
    return visualPixels + OVERLAY_PADDING;
}

/**
 * Get or create marker container
 */
function getOrCreateMarkerContainer() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return null;

    let container = document.getElementById('crosshair-markers');
    if (!container) {
        container = document.createElement('div');
        container.id = 'crosshair-markers';
        container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 51;
        `;
        chartDiv.appendChild(container);
    }
    return container;
}

/**
 * Create a marker element with appropriate shape and color
 * @param {string} seriesType - 'corrects', 'errors', 'timing', or misc ID (e.g., 'misc1')
 */
function createMarker(seriesType) {
    // For misc series, use misc style but get size from the specific misc ID
    const styleKey = seriesType.startsWith('misc') ? 'misc' : seriesType;
    const style = MARKER_STYLES[styleKey] || MARKER_STYLES.misc;
    const marker = document.createElement('div');
    const size = getMarkerSize(seriesType);
    const halfSize = size / 2;

    marker.style.position = 'absolute';
    marker.style.opacity = '0.4';
    marker.style.transform = 'translate(-50%, -50%)';

    if (style.shape === 'circle') {
        marker.style.width = `${size}px`;
        marker.style.height = `${size}px`;
        marker.style.borderRadius = '50%';
        marker.style.backgroundColor = style.color;
    } else if (style.shape === 'square') {
        marker.style.width = `${size}px`;
        marker.style.height = `${size}px`;
        marker.style.backgroundColor = style.color;
    } else if (style.shape === 'triangle') {
        // Triangle pointing down using CSS borders
        marker.style.width = '0';
        marker.style.height = '0';
        marker.style.borderLeft = `${halfSize}px solid transparent`;
        marker.style.borderRight = `${halfSize}px solid transparent`;
        marker.style.borderTop = `${size}px solid ${style.color}`;
    }

    return marker;
}

/**
 * Clear all data markers
 */
function clearDataMarkers() {
    const container = document.getElementById('crosshair-markers');
    if (container) {
        container.innerHTML = '';
    }
}

/**
 * Update data point markers at the current x position
 */
function updateDataMarkers(xRounded, chartDiv) {
    const container = getOrCreateMarkerContainer();
    if (!container) return;

    // Clear existing markers
    container.innerHTML = '';

    const layout = chartDiv.layout;
    const rect = chartDiv.getBoundingClientRect();

    // Get plot area bounds
    const plotLeft = layout.margin.l;
    const plotRight = rect.width - layout.margin.r;
    const plotTop = layout.margin.t;
    const plotBottom = rect.height - layout.margin.b;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;

    const xRange = layout.xaxis.range;
    const yRange = layout.yaxis.range;

    // Calculate x pixel position for the rounded x value
    const xFraction = (xRounded - xRange[0]) / (xRange[1] - xRange[0]);
    const xPixel = plotLeft + xFraction * plotWidth;

    const traces = chartDiv.data || [];

    traces.forEach(trace => {
        if (!trace.meta) return;

        const { seriesName, aggType } = trace.meta;
        if (!seriesName || seriesName.includes('FloorShadow')) return;

        // Find value at this x position
        const xArray = trace.x || [];
        const yArray = trace.y || [];

        // Find closest x index
        let closestIdx = -1;
        let closestDist = Infinity;

        for (let i = 0; i < xArray.length; i++) {
            const dist = Math.abs(xArray[i] - xRounded);
            if (dist < closestDist) {
                closestDist = dist;
                closestIdx = i;
            }
        }

        // Only show marker if within 0.5 of an x position
        if (closestIdx >= 0 && closestDist <= 0.5) {
            const value = yArray[closestIdx];
            if (value !== null && !isNaN(value) && value > 0) {
                // Determine series type for marker style
                // Use actual series name for misc series to get correct size from chartState
                let seriesType;
                if (seriesName === 'corrects') {
                    seriesType = 'corrects';
                } else if (seriesName === 'errors') {
                    seriesType = 'errors';
                } else if (seriesName === 'timing') {
                    seriesType = 'timing';
                } else {
                    // Keep the actual misc ID (e.g., 'misc1') for size lookup
                    seriesType = seriesName;
                }

                // Calculate y pixel position (log scale)
                const yLog = Math.log10(value);
                const yFraction = (yLog - yRange[0]) / (yRange[1] - yRange[0]);
                const yPixel = plotBottom - yFraction * plotHeight;

                // Create and position marker
                const marker = createMarker(seriesType);
                marker.style.left = `${xPixel}px`;
                marker.style.top = `${yPixel}px`;
                container.appendChild(marker);
            }
        }
    });
}

/**
 * Update the info panel with data at current position
 */
function updateInfoPanel(xValue, yValue, chartDiv) {
    const infoContent = document.getElementById('crosshair-info');
    if (!infoContent) return;

    // Get date from x position
    const xRounded = Math.round(xValue);
    const date = xPositionToDate(xRounded);

    // Build info HTML
    let html = '';

    // Date section - format per report: "Mon | 15", "Jan | 01", "2024"
    if (date) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        html += `<div class="crosshair-section">`;
        html += `<div class="crosshair-heading">Date</div>`;
        html += `<div class="crosshair-row"><span class="crosshair-label">Day:</span><span class="crosshair-value">${dayNames[date.getDay()]} | ${date.getDate()}</span></div>`;
        html += `<div class="crosshair-row"><span class="crosshair-label">Month:</span><span class="crosshair-value">${monthNames[date.getMonth()]} | ${String(date.getMonth() + 1).padStart(2, '0')}</span></div>`;
        html += `<div class="crosshair-row"><span class="crosshair-label">Year:</span><span class="crosshair-value">${date.getFullYear()}</span></div>`;
        html += `</div>`;
    }

    // Coordinates section
    html += `<div class="crosshair-section">`;
    html += `<div class="crosshair-heading">Cursor</div>`;
    html += `<div class="crosshair-row"><span class="crosshair-label">x:</span><span class="crosshair-value">${xRounded}</span></div>`;
    html += `<div class="crosshair-row"><span class="crosshair-label">y:</span><span class="crosshair-value">${formatValue(yValue)}</span></div>`;
    html += `</div>`;

    // Data values section - query each trace
    const traces = chartDiv.data || [];
    const dataBySeriesAgg = {};

    traces.forEach(trace => {
        if (!trace.meta) return;

        const { seriesName, aggType } = trace.meta;
        if (!seriesName || seriesName.includes('FloorShadow')) return;

        // Find value at this x position
        const xArray = trace.x || [];
        const yArray = trace.y || [];

        // Find closest x index
        let closestIdx = -1;
        let closestDist = Infinity;

        for (let i = 0; i < xArray.length; i++) {
            const dist = Math.abs(xArray[i] - xRounded);
            if (dist < closestDist) {
                closestDist = dist;
                closestIdx = i;
            }
        }

        // Only use if within 0.5 of an x position
        if (closestIdx >= 0 && closestDist <= 0.5) {
            const value = yArray[closestIdx];
            if (value !== null && !isNaN(value)) {
                const key = `${seriesName}-${aggType}`;
                if (!dataBySeriesAgg[key]) {
                    dataBySeriesAgg[key] = {
                        seriesName,
                        aggType,
                        value
                    };
                }
            }
        }
    });

    // Render data values
    if (Object.keys(dataBySeriesAgg).length > 0) {
        html += `<div class="crosshair-section">`;
        html += `<div class="crosshair-heading">Series</div>`;

        for (const key in dataBySeriesAgg) {
            const { seriesName, aggType, value } = dataBySeriesAgg[key];
            const displayName = formatSeriesName(seriesName);

            // For timing, show reciprocal (timing floor value)
            let displayValue;
            if (seriesName === 'timing') {
                displayValue = formatValue(1 / value);
            } else {
                displayValue = formatValue(value);
            }

            const aggLabel = aggType !== 'raw' ? ` (${aggType})` : '';
            html += `<div class="crosshair-row"><span class="crosshair-label">${displayName}:</span><span class="crosshair-value">${displayValue}${aggLabel}</span></div>`;
        }

        html += `</div>`;
    }

    infoContent.innerHTML = html;
}

/**
 * Format series name for display
 */
function formatSeriesName(name) {
    const nameMap = {
        'corrects': 'Correct',
        'errors': 'Incorrect',
        'timing': 'Timing'
    };
    return nameMap[name] || name;
}


/**
 * Initialize crosshair module - set up keyboard listeners
 */
function init() {
    // Keydown - activate on Shift
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Shift' && !crosshairState.shiftHeld) {
            crosshairState.shiftHeld = true;
            activateCrosshair();
        }
    });

    // Keyup - deactivate on Shift release
    document.addEventListener('keyup', (event) => {
        if (event.key === 'Shift') {
            crosshairState.shiftHeld = false;
            deactivateCrosshair();
        }
    });

    // Also deactivate if window loses focus
    window.addEventListener('blur', () => {
        if (crosshairState.shiftHeld) {
            crosshairState.shiftHeld = false;
            deactivateCrosshair();
        }
    });
}

export { init, activateCrosshair, deactivateCrosshair };