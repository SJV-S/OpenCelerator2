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
    beforeHoverHandler: null,
    rafPending: null,  // For requestAnimationFrame throttling
    lastXRounded: null  // Track previous x to skip redundant data lookups
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

    // Block Plotly's internal hover computation entirely
    crosshairState.beforeHoverHandler = () => false;
    chartDiv.on('plotly_beforehover', crosshairState.beforeHoverHandler);

    // Also disable hovermode and dragmode
    crosshairState.previousHovermode = chartDiv.layout?.hovermode;
    crosshairState.previousDragmode = chartDiv.layout?.dragmode;
    Plotly.relayout(chartDiv, { hovermode: false, dragmode: false });

    // Store the currently active tab
    const activeTab = document.querySelector('.chart-menu-tab-pane.active');
    if (activeTab) {
        crosshairState.previousActiveTab = activeTab.id;
    }

    // TEMP DISABLED: testing if panel causes CPU issue
    // Hide tabs and all tab panes
    // const tabs = document.querySelector('.chart-menu-tabs');
    // if (tabs) tabs.style.display = 'none';

    // document.querySelectorAll('.chart-menu-tab-pane').forEach(pane => {
    //     pane.classList.remove('active');
    // });

    // TEMP DISABLED: testing if panel causes CPU issue
    // Show crosshair content
    // const crosshairContent = document.getElementById('crosshair-content');
    // if (crosshairContent) {
    //     crosshairContent.classList.add('active');
    // }

    // Show the counter overlay on mobile if hidden
    const counterOverlay = document.getElementById('counter-overlay');
    if (counterOverlay && counterOverlay.style.display === 'none') {
        counterOverlay.style.display = 'flex';
    }

    // Create event-capturing overlay so Plotly never receives mouse events
    const eventOverlay = getOrCreateEventOverlay(chartDiv);
    eventOverlay.style.pointerEvents = 'auto';  // Capture events

    // Set up mousemove handler on the overlay, not the chart
    crosshairState.mouseMoveHandler = (event) => handleMouseMove(event, chartDiv);
    eventOverlay.addEventListener('mousemove', crosshairState.mouseMoveHandler);
}

/**
 * Get or create transparent overlay that captures mouse events
 * When active, this prevents Plotly from receiving any mouse events
 */
function getOrCreateEventOverlay(chartDiv) {
    let overlay = document.getElementById('crosshair-event-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'crosshair-event-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 100;
        `;
        chartDiv.appendChild(overlay);
    }
    return overlay;
}

/**
 * Deactivate crosshair mode - called when Shift is released
 */
function deactivateCrosshair() {
    if (!crosshairState.active) return;

    const chartDiv = document.getElementById('chart');
    crosshairState.active = false;
    crosshairState.lastXRounded = null;  // Reset for next activation

    // Cancel any pending animation frame
    if (crosshairState.rafPending) {
        cancelAnimationFrame(crosshairState.rafPending);
        crosshairState.rafPending = null;
    }
    crosshairState.lastEvent = null;

    // Remove the beforehover blocker
    if (chartDiv && crosshairState.beforeHoverHandler) {
        chartDiv.removeListener('plotly_beforehover', crosshairState.beforeHoverHandler);
        crosshairState.beforeHoverHandler = null;
    }

    // Restore Plotly's hover and drag modes
    if (crosshairState.previousHovermode !== undefined || crosshairState.previousDragmode !== undefined) {
        Plotly.relayout(chartDiv, {
            hovermode: crosshairState.previousHovermode ?? 'closest',
            dragmode: crosshairState.previousDragmode ?? 'zoom'
        });
        crosshairState.previousHovermode = undefined;
        crosshairState.previousDragmode = undefined;
    }

    // Remove mousemove handler and disable event capture on overlay
    const overlay = document.getElementById('crosshair-event-overlay');
    if (overlay) {
        if (crosshairState.mouseMoveHandler) {
            overlay.removeEventListener('mousemove', crosshairState.mouseMoveHandler);
        }
        overlay.style.pointerEvents = 'none';  // Let events through to Plotly again
    }
    crosshairState.mouseMoveHandler = null;

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
 * Uses requestAnimationFrame for smooth updates aligned with display refresh
 */
function handleMouseMove(event, chartDiv) {
    if (!crosshairState.rafPending) {
        crosshairState.rafPending = requestAnimationFrame(() => {
            crosshairState.rafPending = null;
            processMouseMove(crosshairState.lastEvent, chartDiv);
        });
    }
    crosshairState.lastEvent = event;
}

/**
 * Process mouse move - called once per animation frame
 */
function processMouseMove(event, chartDiv) {
    if (!event) return;

    const coords = getPlotCoordinates(event, chartDiv);
    if (!coords) {
        removeCrosshairLines();
        return;
    }

    updateCrosshairLines(coords.x, coords.y);
    return;  // Stop here for now

    // TEMP DISABLED: testing if crosshair lines cause CPU issue
    // updateCrosshairLines(coords.x, coords.y);

    const xRounded = Math.round(coords.x);

    // TEMP DISABLED: testing CPU issue - only crosshair lines active
    // if (xRounded !== crosshairState.lastXRounded) {
    //     crosshairState.lastXRounded = xRounded;
    //
    //     const traceData = findTraceDataAtX(xRounded, chartDiv);
    //     updateDataMarkers(xRounded, chartDiv, traceData);
    //     updateInfoPanel(xRounded, coords.y, chartDiv, traceData);
    // }
}

/**
 * Find data values for all traces at a given x position
 * @returns {Map} Map of seriesName-aggType -> {seriesName, aggType, value}
 */
function findTraceDataAtX(xRounded, chartDiv) {
    const traces = chartDiv.data || [];
    const result = new Map();

    for (const trace of traces) {
        if (!trace.meta) continue;

        const { seriesName, aggType } = trace.meta;
        if (!seriesName || seriesName.includes('FloorShadow')) continue;

        const xArray = trace.x || [];
        const yArray = trace.y || [];

        // Direct lookup - find exact x match
        const idx = xArray.indexOf(xRounded);
        if (idx !== -1) {
            const value = yArray[idx];
            if (value !== null && !isNaN(value)) {
                const key = `${seriesName}-${aggType}`;
                if (!result.has(key)) {
                    result.set(key, { seriesName, aggType, value });
                }
            }
        }
    }

    return result;
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
 * Uses GPU-accelerated positioning via transforms
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
            contain: strict;
        `;

        const vLine = document.createElement('div');
        vLine.id = 'crosshair-v';
        vLine.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 1px;
            background: repeating-linear-gradient(
                to bottom,
                gray 0px, gray 4px,
                transparent 4px, transparent 8px
            );
            will-change: transform;
            contain: layout paint;
            display: none;
        `;

        const hLine = document.createElement('div');
        hLine.id = 'crosshair-h';
        hLine.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            height: 1px;
            background: repeating-linear-gradient(
                to right,
                gray 0px, gray 4px,
                transparent 4px, transparent 8px
            );
            will-change: transform;
            contain: layout paint;
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
 * Uses CSS transforms for GPU-accelerated positioning
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

    // Update vertical line using transform (GPU-accelerated)
    lines.vLine.style.height = `${plotHeight}px`;
    lines.vLine.style.transform = `translate(${xPixel}px, ${plotTop}px)`;
    lines.vLine.style.display = 'block';

    // Update horizontal line using transform (GPU-accelerated)
    lines.hLine.style.width = `${plotWidth}px`;
    lines.hLine.style.transform = `translate(${plotLeft}px, ${yPixel}px)`;
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
 * @param {number} xRounded - Rounded x position
 * @param {HTMLElement} chartDiv - Chart element
 * @param {Map} traceData - Pre-computed data from findTraceDataAtX
 */
function updateDataMarkers(xRounded, chartDiv, traceData) {
    const container = getOrCreateMarkerContainer();
    if (!container) return;

    // Clear existing markers
    container.innerHTML = '';

    if (!traceData || traceData.size === 0) return;

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

    // Use pre-computed trace data
    for (const [key, data] of traceData) {
        const { seriesName, value } = data;

        if (value <= 0) continue;

        // Determine series type for marker style
        let seriesType;
        if (seriesName === 'corrects') {
            seriesType = 'corrects';
        } else if (seriesName === 'errors') {
            seriesType = 'errors';
        } else if (seriesName === 'timing') {
            seriesType = 'timing';
        } else {
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

/**
 * Update the info panel with data at current position
 */
function updateInfoPanel(xRounded, yValue, chartDiv, traceData) {
    const infoContent = document.getElementById('crosshair-info');
    if (!infoContent) return;

    // Get date from x position
    const date = xPositionToDate(xRounded);

    // Build info HTML
    let html = '';

    // Date section
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

    // Render data values from pre-computed traceData
    if (traceData && traceData.size > 0) {
        html += `<div class="crosshair-section">`;
        html += `<div class="crosshair-heading">Series</div>`;

        for (const [key, data] of traceData) {
            const { seriesName, aggType, value } = data;
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
 * Format series name for display - looks up custom name from chartState
 */
function formatSeriesName(seriesId) {
    // Look up the actual display name from trace styles
    let config;

    if (seriesId && seriesId.startsWith('misc')) {
        config = chartState.traceStyles.misc[seriesId];
    } else if (seriesId) {
        config = chartState.traceStyles[seriesId];
    }

    if (config && config.raw && config.raw.seriesName) {
        return config.raw.seriesName;
    }

    // Fallback to defaults if no custom name found
    const fallbackMap = {
        'corrects': 'Correct',
        'errors': 'Incorrect',
        'timing': 'Timing'
    };
    return fallbackMap[seriesId] || seriesId;
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