/**
 * Crosshair Module - Cursor tracking and data display
 *
 * When user holds Shift and moves mouse over chart:
 * 1. Crosshair lines (gray dashed) track cursor position
 * 2. Data markers appear on data points at current x-position
 * 3. Info panel shows date, cursor coordinates, and series values
 *
 * Architecture:
 * - Canvas-based rendering for crosshair lines and data markers
 * - Tier 1 (per-frame): Crosshair line drawing
 * - Tier 2 (per-x-change): Data lookup, marker drawing, info panel updates
 *
 * Note: Large datasets (20k+ points) may cause performance issues due to
 * Plotly's internal O(n) operations, not this module. Aggregating data helps.
 */

import { chartState } from '../chartState.js';
import { CORRECTS, ERRORS } from '../config.js';
import { xPositionToDate } from './dates.js';
import { formatValue } from './format.js';

// =============================================================================
// State
// =============================================================================

const state = {
    active: false,
    shiftHeld: false,
    domReady: false,
    lastXRounded: null,
    rafPending: null,
    lastEvent: null,
    previousActiveTab: null,

    // Handler references for cleanup
    mouseMoveHandler: null,
    beforeHoverHandler: null,
    resizeHandler: null,
    relayoutHandler: null,

    // Cached geometry (rebuilt on activate/resize/relayout)
    cache: null,

    // DOM references (created once, reused)
    elements: null,

    // Trace data from last x-change lookup
    currentTraceData: null,

    // Current cursor position for redraw
    currentXPixel: null,
    currentYPixel: null,

    // Timestamp guard for cache rebuilds (prevents rapid-fire from relayout events)
    lastCacheRebuild: 0
};

// =============================================================================
// Marker style configuration
// =============================================================================

const MARKER_STYLES = {
    corrects: { color: '#22c55e', shape: 'circle', sizeMultiplier: 1.0 },
    errors: { color: '#ef4444', shape: 'circle', sizeMultiplier: 0.54 },
    timing: { color: '#a855f7', shape: 'triangle-down', sizeMultiplier: 0.30 },
    misc: { color: '#f97316', shape: 'square', sizeMultiplier: 1.3 }
};

const MARKER_PADDING = 8;
const MARKER_OPACITY = 0.4;

// Dashed line pattern
const DASH_PATTERN = [4, 4];
const LINE_COLOR = 'gray';

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Rebuild the geometry cache from current chart layout
 * Called on: activate, resize, relayout
 * @param {boolean} force - If true, bypass the timestamp guard (used for activation)
 */
function rebuildCache(force = false) {
    // Timestamp guard: prevent rapid-fire rebuilds from relayout events
    // (max once per 100ms unless forced)
    const now = performance.now();
    if (!force && now - state.lastCacheRebuild < 100) return;
    state.lastCacheRebuild = now;

    const chartDiv = state.elements?.chart;
    if (!chartDiv || !chartDiv.layout) return;

    const rect = chartDiv.getBoundingClientRect();
    const layout = chartDiv.layout;
    const margin = layout.margin || { l: 0, r: 0, t: 0, b: 0 };

    const plotWidth = rect.width - margin.l - margin.r;
    const plotHeight = rect.height - margin.t - margin.b;
    const xRange = layout.xaxis?.range || [0, 100];
    const yRange = layout.yaxis?.range || [0, 3];

    state.cache = {
        rect,
        plotLeft: margin.l,
        plotTop: margin.t,
        plotWidth,
        plotHeight,
        plotBottom: margin.t + plotHeight,
        plotRight: margin.l + plotWidth,
        xRange,
        yRange,
        xScale: plotWidth / (xRange[1] - xRange[0]),
        yScale: plotHeight / (yRange[1] - yRange[0])
    };

    // Resize canvas to match chart dimensions
    const canvas = state.elements?.canvas;
    if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        const ctx = state.elements.ctx;
        if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }
}

// =============================================================================
// DOM Element Creation (run once at first activation)
// =============================================================================

/**
 * Build all DOM elements needed by the module
 * Called lazily on first activation when chart div exists
 */
function buildDOMElements() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return false;

    state.elements = {
        chart: chartDiv,
        eventOverlay: null,
        canvas: null,
        ctx: null,
        infoPanel: null,
        infoPanelRefs: {},
        seriesConfigs: new Map()
    };

    // Event overlay - captures mouse events when active
    const eventOverlay = document.createElement('div');
    eventOverlay.id = 'crosshair-event-overlay';
    eventOverlay.style.cssText = `
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        z-index: 100;
    `;
    chartDiv.appendChild(eventOverlay);
    state.elements.eventOverlay = eventOverlay;

    // Canvas for crosshair lines and markers
    const canvas = document.createElement('canvas');
    canvas.id = 'crosshair-canvas';
    canvas.style.cssText = `
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        z-index: 50;
    `;
    chartDiv.appendChild(canvas);
    state.elements.canvas = canvas;
    state.elements.ctx = canvas.getContext('2d');

    // Build info panel structure
    buildInfoPanel();

    state.domReady = true;
    return true;
}

/**
 * Build the info panel DOM structure with pre-created text nodes
 */
function buildInfoPanel() {
    const infoContent = document.getElementById('crosshair-info');
    if (!infoContent) return;

    state.elements.infoPanel = infoContent;
    infoContent.innerHTML = '';

    const refs = state.elements.infoPanelRefs;

    // Date section
    const dateSection = createSection('Date');
    refs.dayLabel = createRow(dateSection, 'Day:');
    refs.monthLabel = createRow(dateSection, 'Month:');
    refs.yearLabel = createRow(dateSection, 'Year:');
    infoContent.appendChild(dateSection);

    // Cursor section
    const cursorSection = createSection('Cursor');
    refs.xLabel = createRow(cursorSection, 'x:');
    refs.yLabel = createRow(cursorSection, 'y:');
    infoContent.appendChild(cursorSection);

    // Series section
    const seriesSection = createSection('Series');
    seriesSection.id = 'crosshair-series-section';
    refs.seriesContainer = seriesSection;
    refs.seriesRows = new Map();
    infoContent.appendChild(seriesSection);
}

function createSection(heading) {
    const section = document.createElement('div');
    section.className = 'crosshair-section';

    const h = document.createElement('div');
    h.className = 'crosshair-heading';
    h.textContent = heading;
    section.appendChild(h);

    return section;
}

function createRow(parent, label) {
    const row = document.createElement('div');
    row.className = 'crosshair-row';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'crosshair-label';
    labelSpan.textContent = label;
    row.appendChild(labelSpan);

    const valueSpan = document.createElement('span');
    valueSpan.className = 'crosshair-value';
    row.appendChild(valueSpan);

    parent.appendChild(row);
    return valueSpan;
}

/**
 * Build series config cache for marker rendering
 */
function buildSeriesConfigs() {
    const chartDiv = state.elements?.chart;
    if (!chartDiv?.data) return;

    state.elements.seriesConfigs.clear();

    // Collect unique series from traces
    const seriesSeen = new Set();

    for (const trace of chartDiv.data) {
        if (!trace.meta) continue;
        const { seriesName } = trace.meta;
        if (!seriesName || seriesName.includes('FloorShadow')) continue;
        if (seriesSeen.has(seriesName)) continue;
        seriesSeen.add(seriesName);

        // Store marker config for this series
        const styleKey = seriesName.startsWith('misc') ? 'misc' : seriesName;
        const style = MARKER_STYLES[styleKey] || MARKER_STYLES.misc;
        const size = getMarkerSize(seriesName);

        state.elements.seriesConfigs.set(seriesName, {
            color: style.color,
            shape: style.shape,
            size: size
        });
    }

    // Also create rows in series section for each series
    const refs = state.elements.infoPanelRefs;
    if (refs.seriesContainer) {
        // Remove existing rows (keep heading)
        const heading = refs.seriesContainer.querySelector('.crosshair-heading');
        refs.seriesContainer.innerHTML = '';
        if (heading) refs.seriesContainer.appendChild(heading);
        refs.seriesRows.clear();

        for (const seriesName of seriesSeen) {
            const row = document.createElement('div');
            row.className = 'crosshair-row';
            row.style.display = 'none';

            const labelSpan = document.createElement('span');
            labelSpan.className = 'crosshair-label';
            row.appendChild(labelSpan);

            const valueSpan = document.createElement('span');
            valueSpan.className = 'crosshair-value';
            row.appendChild(valueSpan);

            refs.seriesContainer.appendChild(row);
            refs.seriesRows.set(seriesName, { row, labelSpan, valueSpan });
        }
    }
}

function getMarkerSize(seriesId) {
    let chartSize;
    let style;

    if (seriesId === CORRECTS) {
        chartSize = chartState.traceStyles[CORRECTS]?.raw?.markerSize ?? 8;
        style = MARKER_STYLES.corrects;
    } else if (seriesId === ERRORS) {
        chartSize = chartState.traceStyles[ERRORS]?.raw?.textSize ?? 20;
        style = MARKER_STYLES.errors;
    } else if (seriesId === 'timing') {
        chartSize = chartState.traceStyles.timing?.raw?.markerSize ?? 30;
        style = MARKER_STYLES.timing;
    } else if (seriesId.startsWith('misc')) {
        chartSize = chartState.traceStyles.misc?.[seriesId]?.raw?.markerSize ?? 8;
        style = MARKER_STYLES.misc;
    } else {
        chartSize = 8;
        style = MARKER_STYLES.misc;
    }

    return (chartSize * style.sizeMultiplier) + MARKER_PADDING;
}

// =============================================================================
// Activation / Deactivation
// =============================================================================

function activateCrosshair() {
    if (state.active) return;

    // Lazy DOM initialization
    if (!state.domReady) {
        if (!buildDOMElements()) return;
    }

    state.active = true;

    // Rebuild geometry cache (forced - always rebuild on activation)
    rebuildCache(true);

    // Rebuild series configs in case traces changed
    buildSeriesConfigs();

    const chartDiv = state.elements.chart;

    // Block Plotly's hover computation
    state.beforeHoverHandler = () => false;
    chartDiv.on('plotly_beforehover', state.beforeHoverHandler);

    // Disable Plotly's drag layer to prevent element-level listeners
    const dragLayer = chartDiv.querySelector('.nsewdrag');
    if (dragLayer) dragLayer.style.pointerEvents = 'none';

    // Enable event capture on overlay
    state.elements.eventOverlay.style.pointerEvents = 'auto';

    // Attach mousemove handler
    state.mouseMoveHandler = handleMouseMove;
    state.elements.eventOverlay.addEventListener('mousemove', state.mouseMoveHandler);

    // Attach resize handler (debounced)
    let resizeTimeout;
    state.resizeHandler = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            rebuildCache();
            // Redraw with current position after resize
            if (state.currentXPixel !== null) {
                drawCanvas();
            }
        }, 150);
    };
    window.addEventListener('resize', state.resizeHandler);

    // Attach relayout handler
    state.relayoutHandler = () => {
        rebuildCache();
        if (state.currentXPixel !== null) {
            drawCanvas();
        }
    };
    chartDiv.on('plotly_relayout', state.relayoutHandler);

    // Store current sidebar tab for restoration
    const activeTab = document.querySelector('.chart-menu-tab-pane.active');
    if (activeTab) {
        state.previousActiveTab = activeTab.id;
    }

    // Hide tabs and show crosshair content
    const tabs = document.querySelector('.chart-menu-tabs');
    if (tabs) tabs.style.display = 'none';

    document.querySelectorAll('.chart-menu-tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });

    const crosshairContent = document.getElementById('crosshair-content');
    if (crosshairContent) {
        crosshairContent.classList.add('active');
    }

    // Show counter overlay on mobile if hidden
    const counterOverlay = document.getElementById('counter-overlay');
    if (counterOverlay && counterOverlay.style.display === 'none') {
        counterOverlay.style.display = 'flex';
    }
}

function deactivateCrosshair() {
    if (!state.active) return;

    state.active = false;
    state.lastXRounded = null;
    state.currentXPixel = null;
    state.currentYPixel = null;
    state.currentTraceData = null;

    // Cancel pending RAF
    if (state.rafPending) {
        cancelAnimationFrame(state.rafPending);
        state.rafPending = null;
    }
    state.lastEvent = null;

    const chartDiv = state.elements?.chart;

    // Remove beforehover handler
    if (chartDiv && state.beforeHoverHandler) {
        chartDiv.removeListener('plotly_beforehover', state.beforeHoverHandler);
        state.beforeHoverHandler = null;
    }

    // Restore Plotly's drag layer
    if (chartDiv) {
        const dragLayer = chartDiv.querySelector('.nsewdrag');
        if (dragLayer) dragLayer.style.pointerEvents = '';
    }

    // Remove relayout handler
    if (chartDiv && state.relayoutHandler) {
        chartDiv.removeListener('plotly_relayout', state.relayoutHandler);
        state.relayoutHandler = null;
    }

    // Remove resize handler
    if (state.resizeHandler) {
        window.removeEventListener('resize', state.resizeHandler);
        state.resizeHandler = null;
    }

    // Disable event capture
    if (state.elements?.eventOverlay) {
        if (state.mouseMoveHandler) {
            state.elements.eventOverlay.removeEventListener('mousemove', state.mouseMoveHandler);
        }
        state.elements.eventOverlay.style.pointerEvents = 'none';
    }
    state.mouseMoveHandler = null;

    // Clear canvas
    const ctx = state.elements?.ctx;
    const canvas = state.elements?.canvas;
    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Hide crosshair content
    const crosshairContent = document.getElementById('crosshair-content');
    if (crosshairContent) {
        crosshairContent.classList.remove('active');
    }

    // Restore tabs
    const tabs = document.querySelector('.chart-menu-tabs');
    if (tabs) tabs.style.display = '';

    // Restore previous active tab
    if (state.previousActiveTab) {
        const previousPane = document.getElementById(state.previousActiveTab);
        if (previousPane) {
            previousPane.classList.add('active');
        }

        const tabName = state.previousActiveTab.replace('-content', '');
        const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
        if (tabButton) {
            tabButton.classList.add('active');
        }
    }
}

// =============================================================================
// Mouse Movement Pipeline
// =============================================================================

function handleMouseMove(event) {
    // CRITICAL: Stop propagation to prevent Plotly's document-level
    // mousemove listeners (dragElement system) from running O(n) hover detection
    event.stopPropagation();
    event.preventDefault();

    state.lastEvent = event;

    if (!state.rafPending) {
        state.rafPending = requestAnimationFrame(processFrame);
    }
}

/**
 * RAF callback - Tier 1 (per-frame) and conditionally Tier 2 (per-x-change)
 */
function processFrame() {
    state.rafPending = null;

    const event = state.lastEvent;
    if (!event || !state.cache) return;

    const cache = state.cache;

    // Read cursor position (no layout forcing)
    const xPixel = event.clientX - cache.rect.left;
    const yPixel = event.clientY - cache.rect.top;

    // Boundary check
    if (xPixel < cache.plotLeft || xPixel > cache.plotRight ||
        yPixel < cache.plotTop || yPixel > cache.plotBottom) {
        // Outside plot area - clear canvas
        const ctx = state.elements?.ctx;
        const canvas = state.elements?.canvas;
        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        state.currentXPixel = null;
        state.currentYPixel = null;
        return;
    }

    // Store current position
    state.currentXPixel = xPixel;
    state.currentYPixel = yPixel;

    // Compute data values from pixel position
    const xValue = cache.xRange[0] + (xPixel - cache.plotLeft) / cache.xScale;
    const yLogValue = cache.yRange[1] - (yPixel - cache.plotTop) / cache.yScale;

    // --- Tier 2: Only run when x changes ---
    const xRounded = Math.round(xValue);
    if (xRounded !== state.lastXRounded) {
        state.lastXRounded = xRounded;

        const traceData = findTraceDataAtX(xRounded);
        state.currentTraceData = traceData;

        updateInfoPanel(xRounded, yLogValue, traceData);
    }

    // --- Tier 1: Draw crosshair and markers ---
    drawCanvas();
}

/**
 * Draw crosshair lines and markers on canvas
 */
function drawCanvas() {
    const ctx = state.elements?.ctx;
    const canvas = state.elements?.canvas;
    if (!ctx || !canvas || !state.cache) return;

    const cache = state.cache;
    const xPixel = state.currentXPixel;
    const yPixel = state.currentYPixel;

    if (xPixel === null || yPixel === null) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw dashed crosshair lines
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash(DASH_PATTERN);

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(xPixel, cache.plotTop);
    ctx.lineTo(xPixel, cache.plotBottom);
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(cache.plotLeft, yPixel);
    ctx.lineTo(cache.plotRight, yPixel);
    ctx.stroke();

    // Reset line dash for markers
    ctx.setLineDash([]);

    // Draw markers at data points
    if (state.currentTraceData && state.lastXRounded !== null) {
        const xMarkerPixel = cache.plotLeft + (state.lastXRounded - cache.xRange[0]) * cache.xScale;

        for (const [seriesName, data] of state.currentTraceData) {
            if (!data || data.value <= 0) continue;

            const config = state.elements.seriesConfigs.get(seriesName);
            if (!config) continue;

            // Calculate y pixel position (log scale)
            const yLog = Math.log10(data.value);
            const yMarkerPixel = cache.plotBottom - (yLog - cache.yRange[0]) * cache.yScale;

            // Draw marker
            ctx.globalAlpha = MARKER_OPACITY;
            ctx.fillStyle = config.color;

            const size = config.size;
            const halfSize = size / 2;

            if (config.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(xMarkerPixel, yMarkerPixel, halfSize, 0, Math.PI * 2);
                ctx.fill();
            } else if (config.shape === 'square') {
                ctx.fillRect(xMarkerPixel - halfSize, yMarkerPixel - halfSize, size, size);
            } else if (config.shape === 'triangle-down') {
                ctx.beginPath();
                ctx.moveTo(xMarkerPixel, yMarkerPixel + halfSize);
                ctx.lineTo(xMarkerPixel - halfSize, yMarkerPixel - halfSize);
                ctx.lineTo(xMarkerPixel + halfSize, yMarkerPixel - halfSize);
                ctx.closePath();
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;
    }
}

// =============================================================================
// Data Lookup (Binary Search)
// =============================================================================

/**
 * Find data values for all traces at a given x position
 * Uses binary search for O(log n) per trace
 * @returns {Map} Map of seriesName -> { seriesName, aggType, value }
 */
function findTraceDataAtX(xRounded) {
    const chartDiv = state.elements?.chart;
    if (!chartDiv?.data) return new Map();

    const traces = chartDiv.data;
    const result = new Map();

    for (const trace of traces) {
        if (!trace.meta) continue;

        const { seriesName, aggType } = trace.meta;
        if (!seriesName || seriesName.includes('FloorShadow')) continue;

        const xArray = trace.x;
        const yArray = trace.y;
        if (!xArray || !yArray || xArray.length === 0) continue;

        // Binary search for closest x
        const { index, dist } = binarySearchClosest(xArray, xRounded);

        if (index >= 0 && dist <= 0.5) {
            const value = yArray[index];
            if (value !== null && value !== undefined && !isNaN(value)) {
                // Use first match for each series (raw preferred over aggregated)
                const key = seriesName;
                if (!result.has(key)) {
                    result.set(key, { seriesName, aggType, value });
                }
            }
        }
    }

    return result;
}

/**
 * Binary search for closest value in sorted array
 * @returns {{ index: number, dist: number }}
 */
function binarySearchClosest(arr, target) {
    if (!arr || arr.length === 0) return { index: -1, dist: Infinity };

    let lo = 0;
    let hi = arr.length - 1;

    // Handle edge cases
    if (target <= arr[0]) return { index: 0, dist: Math.abs(arr[0] - target) };
    if (target >= arr[hi]) return { index: hi, dist: Math.abs(arr[hi] - target) };

    // Binary search for insertion point
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < target) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    // Compare lo and lo-1 to find closest
    let bestIdx = lo;
    let bestDist = Math.abs(arr[lo] - target);

    if (lo > 0) {
        const prevDist = Math.abs(arr[lo - 1] - target);
        if (prevDist < bestDist) {
            bestIdx = lo - 1;
            bestDist = prevDist;
        }
    }

    return { index: bestIdx, dist: bestDist };
}

// =============================================================================
// Info Panel Updates
// =============================================================================

/**
 * Update info panel with data at current position
 * Uses textContent only - no innerHTML
 */
function updateInfoPanel(xRounded, yLogValue, traceData) {
    const refs = state.elements?.infoPanelRefs;
    if (!refs) return;

    // Date section
    const date = xPositionToDate(xRounded);
    if (date) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        refs.dayLabel.textContent = `${dayNames[date.getDay()]} | ${date.getDate()}`;
        refs.monthLabel.textContent = `${monthNames[date.getMonth()]} | ${String(date.getMonth() + 1).padStart(2, '0')}`;
        refs.yearLabel.textContent = date.getFullYear();
    }

    // Cursor section
    const yValue = Math.pow(10, yLogValue);
    refs.xLabel.textContent = xRounded;
    refs.yLabel.textContent = formatValue(yValue);

    // Series section - show/hide rows and update values
    if (refs.seriesRows) {
        for (const [seriesName, rowRefs] of refs.seriesRows) {
            const data = traceData.get(seriesName);

            if (!data) {
                rowRefs.row.style.display = 'none';
                continue;
            }

            const displayName = formatSeriesName(seriesName);
            rowRefs.labelSpan.textContent = `${displayName}:`;

            // Format value - timing shows reciprocal
            let displayValue;
            if (seriesName === 'timing') {
                displayValue = formatValue(1 / data.value);
            } else {
                displayValue = formatValue(data.value);
            }

            // Append aggregation type if not raw
            if (data.aggType && data.aggType !== 'raw') {
                displayValue += ` (${data.aggType})`;
            }

            rowRefs.valueSpan.textContent = displayValue;
            rowRefs.row.style.display = '';
        }
    }
}

/**
 * Get display name for a series from chartState
 */
function formatSeriesName(seriesId) {
    let config;

    if (seriesId && seriesId.startsWith('misc')) {
        config = chartState.traceStyles.misc?.[seriesId];
    } else if (seriesId) {
        config = chartState.traceStyles?.[seriesId];
    }

    if (config?.raw?.seriesName) {
        return config.raw.seriesName;
    }

    // Fallback
    const fallback = {
        corrects: 'Correct',
        errors: 'Incorrect',
        timing: 'Timing'
    };
    return fallback[seriesId] || seriesId;
}

// =============================================================================
// Initialization
// =============================================================================

function init() {
    // Keydown - activate on Shift (guard against repeat)
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Shift' && !state.shiftHeld) {
            state.shiftHeld = true;
            activateCrosshair();
        }
    });

    // Keyup - deactivate on Shift release
    document.addEventListener('keyup', (event) => {
        if (event.key === 'Shift') {
            state.shiftHeld = false;
            deactivateCrosshair();
        }
    });

    // Window blur - deactivate (handles alt-tab while Shift held)
    window.addEventListener('blur', () => {
        if (state.shiftHeld) {
            state.shiftHeld = false;
            deactivateCrosshair();
        }
    });
}

export { init, activateCrosshair, deactivateCrosshair };
