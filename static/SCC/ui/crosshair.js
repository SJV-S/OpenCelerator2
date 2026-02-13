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
import { CORRECTS, ERRORS, WINDOW_UNITS } from '../config.js';
import { dateToXPosition, xPositionToDate } from '../util/dates.js';
import { formatValue } from '../util/format.js';
import { getFirstConfig, isSeriesVisible } from '../series/traceStyles.js';
import { getChartDiv } from '../util/dom.js';

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
    relayoutHandler: null,

    // Cached geometry (rebuilt on activate/relayout)
    cache: null,

    // DOM references (created once, reused)
    elements: null,

    // Trace data from last x-change lookup
    currentTraceData: null,

    // Cel line data from last x-change lookup
    celLineCache: null,
    currentCelData: null,

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

// Bounce envelope → upper/lower display labels
const BOUNCE_LABELS = {
    '5-95 percentile':        { upper: '95th pctl', lower: '5th pctl' },
    'Interquartile range':    { upper: '75th pctl', lower: '25th pctl' },
    'Standard deviation':     { upper: '+1 SD',     lower: '-1 SD' },
    '90% confidence interval':{ upper: '95% CI',    lower: '5% CI' }
};

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
    const chartDiv = getChartDiv();
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

    // Top grid: Date + Cursor side-by-side
    const topGrid = document.createElement('div');
    topGrid.className = 'crosshair-top-grid';

    const dateSection = createSection('Date');
    refs.dayLabel = createRow(dateSection, 'Day:');
    refs.monthLabel = createRow(dateSection, 'Month:');
    refs.yearLabel = createRow(dateSection, 'Year:');
    topGrid.appendChild(dateSection);

    const divider = document.createElement('div');
    divider.className = 'crosshair-divider';
    topGrid.appendChild(divider);

    const cursorSection = createSection('Cursor');
    refs.xLabel = createRow(cursorSection, 'x:');
    refs.yLabel = createRow(cursorSection, 'y:');
    topGrid.appendChild(cursorSection);

    infoContent.appendChild(topGrid);

    // Series section
    const seriesSection = createSection('Series');
    seriesSection.id = 'crosshair-series-section';
    refs.seriesContainer = seriesSection;
    refs.seriesRows = new Map();
    infoContent.appendChild(seriesSection);

    // Pre-create a pool of cel row elements (9 rows = 3 lines × 3 values max)
    // Appended to series container; repositioned dynamically in updateInfoPanel
    refs.celRowPool = [];
    for (let i = 0; i < 9; i++) {
        const row = document.createElement('div');
        row.className = 'crosshair-row-stacked crosshair-cel-row';
        row.style.display = 'none';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'crosshair-label';
        row.appendChild(labelSpan);

        const valueSpan = document.createElement('span');
        valueSpan.className = 'crosshair-value';
        row.appendChild(valueSpan);

        refs.seriesContainer.appendChild(row);
        refs.celRowPool.push({ row, labelSpan, valueSpan });
    }
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

    // Collect unique series+aggId combinations from traces
    const keysSeen = new Set();

    for (const trace of chartDiv.data) {
        if (!trace.meta) continue;
        const { seriesName, aggId } = trace.meta;
        if (!seriesName || seriesName.includes('FloorShadow')) continue;

        const compoundKey = `${seriesName}_${aggId}`;
        if (keysSeen.has(compoundKey)) continue;
        keysSeen.add(compoundKey);

        // Store marker config keyed by compound key (style from base series name)
        const styleKey = seriesName.startsWith('misc') ? 'misc' : seriesName;
        const style = MARKER_STYLES[styleKey] || MARKER_STYLES.misc;
        const size = getMarkerSize(seriesName);

        state.elements.seriesConfigs.set(compoundKey, {
            color: style.color,
            shape: style.shape,
            size: size
        });
    }

    // Also create rows in series section for each series+aggId
    const refs = state.elements.infoPanelRefs;
    if (refs.seriesContainer) {
        // Remove existing rows (keep heading)
        const heading = refs.seriesContainer.querySelector('.crosshair-heading');
        refs.seriesContainer.innerHTML = '';
        if (heading) refs.seriesContainer.appendChild(heading);
        refs.seriesRows.clear();

        for (const compoundKey of keysSeen) {
            const row = document.createElement('div');
            row.className = 'crosshair-row-stacked';
            row.style.display = 'none';

            const labelSpan = document.createElement('span');
            labelSpan.className = 'crosshair-label';
            row.appendChild(labelSpan);

            const valueSpan = document.createElement('span');
            valueSpan.className = 'crosshair-value';
            row.appendChild(valueSpan);

            refs.seriesContainer.appendChild(row);
            refs.seriesRows.set(compoundKey, { row, labelSpan, valueSpan });
        }

        // Re-append cel pool rows so they stay in the series container after rebuild
        if (refs.celRowPool) {
            for (const poolEntry of refs.celRowPool) {
                refs.seriesContainer.appendChild(poolEntry.row);
            }
        }
    }
}

function getMarkerSize(seriesId) {
    let chartSize;
    let style;
    const config = getFirstConfig(seriesId);

    if (seriesId === CORRECTS) {
        chartSize = config?.markerSize ?? 8;
        style = MARKER_STYLES.corrects;
    } else if (seriesId === ERRORS) {
        chartSize = config?.markerSize ?? 20;
        style = MARKER_STYLES.errors;
    } else if (seriesId === 'timing') {
        chartSize = config?.markerSize ?? 30;
        style = MARKER_STYLES.timing;
    } else if (seriesId.startsWith('misc')) {
        chartSize = config?.markerSize ?? 8;
        style = MARKER_STYLES.misc;
    } else {
        chartSize = 8;
        style = MARKER_STYLES.misc;
    }

    return (chartSize * style.sizeMultiplier) + MARKER_PADDING;
}

/**
 * Build cache of visible cel line data for crosshair evaluation
 * Converts dates to x-positions once, avoiding per-frame work
 */
function buildCelLineCache() {
    state.celLineCache = [];
    const chartDiv = state.elements?.chart;
    if (!chartDiv) return;

    const globalVisible = chartState.lineVisibility?.change !== false;

    for (const [id, meta] of Object.entries(chartState.CelLines)) {
        if (id === 'settings') continue;

        // Skip if global change line visibility is off
        if (!globalVisible) continue;

        // Skip if the parent series is hidden
        if (!isSeriesVisible(meta.seriesKey)) continue;

        // Skip hidden shapes (per-line visibility)
        const shapeName = `cel-${meta.id}`;
        const shape = (chartDiv.layout.shapes || []).find(s => s.name === shapeName);
        if (shape && shape.visible === false) continue;

        const x0 = dateToXPosition(meta.date1);
        const x1 = dateToXPosition(meta.date2);

        // Match this cel line to a specific compound key (seriesName_aggId)
        // by finding which trace's data best fits the cel line at its midpoint
        const midX = Math.round((x0 + x1) / 2);
        const midLogY = meta.slope * midX + meta.intercept;
        let matchedKey = null;
        let bestDist = Infinity;

        for (const trace of chartDiv.data) {
            if (!trace.meta || !trace.x || !trace.y) continue;
            const { seriesName, aggId } = trace.meta;
            if (seriesName !== meta.seriesKey) continue;

            const { index, dist: xDist } = binarySearchClosest(trace.x, midX);
            if (index < 0 || xDist > 0.5) continue;

            const val = trace.y[index];
            if (val == null || val <= 0) continue;

            const dist = Math.abs(Math.log10(val) - midLogY);
            if (dist < bestDist) {
                bestDist = dist;
                matchedKey = `${seriesName}_${aggId}`;
            }
        }

        state.celLineCache.push({
            id: meta.id,
            seriesKey: meta.seriesKey,
            matchedKey,
            x0, x1,
            slope: meta.slope,
            intercept: meta.intercept,
            bounceUpperOffset: meta.bounceUpperOffset,
            bounceLowerOffset: meta.bounceLowerOffset,
            color: meta.style.color,
            bounceColor: meta.style.bounceColor,
            fitMethod: meta.fitMethod,
            bounceEnvelope: meta.bounceEnvelope,
            text: meta.text
        });
    }
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

    // Rebuild cel line cache for crosshair evaluation
    buildCelLineCache();

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
    state.celLineCache = null;
    state.currentCelData = null;

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

    // --- Tier 2: Only run when x changes (data lookup, date, series) ---
    const xRounded = Math.round(xValue);
    if (xRounded !== state.lastXRounded) {
        state.lastXRounded = xRounded;

        const traceData = findTraceDataAtX(xRounded);
        state.currentTraceData = traceData;

        const celData = findCelLinesAtX(xRounded, yLogValue);
        state.currentCelData = celData;

        updateInfoPanel(xRounded, yLogValue, traceData, celData);
    }

    // --- Tier 1: Cursor y-value updates every frame ---
    updateCursorY(yLogValue);

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

    // Vertical line - snapped to rounded x position (matches info panel)
    // Uses Plotly's internal axis mapping for pixel-perfect gridline alignment
    const xaxis = state.elements.chart._fullLayout.xaxis;
    const xSnapped = state.lastXRounded !== null
        ? xaxis._offset + xaxis.l2p(state.lastXRounded)
        : xPixel;
    ctx.beginPath();
    ctx.moveTo(xSnapped, cache.plotTop);
    ctx.lineTo(xSnapped, cache.plotBottom);
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
        const fullLayout = state.elements.chart._fullLayout;
        const xMarkerPixel = fullLayout.xaxis._offset + fullLayout.xaxis.l2p(state.lastXRounded);

        for (const [key, data] of state.currentTraceData) {
            if (!data || data.value <= 0) continue;

            const config = state.elements.seriesConfigs.get(key);
            if (!config) continue;

            // Calculate y pixel position using Plotly's axis mapping (log scale)
            const yLog = Math.log10(data.value);
            const yMarkerPixel = fullLayout.yaxis._offset + fullLayout.yaxis.l2p(yLog);

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

    // Draw diamond markers at cel line values
    if (state.currentCelData && state.currentCelData.length > 0 && state.lastXRounded !== null) {
        const fullLayout = state.elements.chart._fullLayout;
        const xMarkerPixel = fullLayout.xaxis._offset + fullLayout.xaxis.l2p(state.lastXRounded);
        const CEL_MARKER_OPACITY = 0.7;
        const CEL_COLOR = '#a855f7';
        const CEL_DIAMOND_HALF = 6;
        const CEL_BOUNCE_HALF = 4;

        for (const cel of state.currentCelData) {
            // Trend diamond
            if (cel.trendY > 0) {
                const yPx = fullLayout.yaxis._offset + fullLayout.yaxis.l2p(Math.log10(cel.trendY));
                ctx.globalAlpha = CEL_MARKER_OPACITY;
                ctx.fillStyle = CEL_COLOR;
                ctx.beginPath();
                ctx.moveTo(xMarkerPixel, yPx - CEL_DIAMOND_HALF);
                ctx.lineTo(xMarkerPixel + CEL_DIAMOND_HALF, yPx);
                ctx.lineTo(xMarkerPixel, yPx + CEL_DIAMOND_HALF);
                ctx.lineTo(xMarkerPixel - CEL_DIAMOND_HALF, yPx);
                ctx.closePath();
                ctx.fill();
            }

            // Upper bounce diamond (smaller)
            if (cel.upperY != null && cel.upperY > 0) {
                const yPx = fullLayout.yaxis._offset + fullLayout.yaxis.l2p(Math.log10(cel.upperY));
                ctx.globalAlpha = CEL_MARKER_OPACITY;
                ctx.fillStyle = CEL_COLOR;
                ctx.beginPath();
                ctx.moveTo(xMarkerPixel, yPx - CEL_BOUNCE_HALF);
                ctx.lineTo(xMarkerPixel + CEL_BOUNCE_HALF, yPx);
                ctx.lineTo(xMarkerPixel, yPx + CEL_BOUNCE_HALF);
                ctx.lineTo(xMarkerPixel - CEL_BOUNCE_HALF, yPx);
                ctx.closePath();
                ctx.fill();
            }

            // Lower bounce diamond (smaller)
            if (cel.lowerY != null && cel.lowerY > 0) {
                const yPx = fullLayout.yaxis._offset + fullLayout.yaxis.l2p(Math.log10(cel.lowerY));
                ctx.globalAlpha = CEL_MARKER_OPACITY;
                ctx.fillStyle = CEL_COLOR;
                ctx.beginPath();
                ctx.moveTo(xMarkerPixel, yPx - CEL_BOUNCE_HALF);
                ctx.lineTo(xMarkerPixel + CEL_BOUNCE_HALF, yPx);
                ctx.lineTo(xMarkerPixel, yPx + CEL_BOUNCE_HALF);
                ctx.lineTo(xMarkerPixel - CEL_BOUNCE_HALF, yPx);
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
 * @returns {Map} Map of seriesName -> { seriesName, aggId, onXAgg, acrossXAgg, value }
 */
function findTraceDataAtX(xRounded) {
    const chartDiv = state.elements?.chart;
    if (!chartDiv?.data) return new Map();

    const traces = chartDiv.data;
    const result = new Map();

    for (const trace of traces) {
        if (!trace.meta) continue;

        const { seriesName, aggId, onXAgg, acrossXAgg } = trace.meta;
        if (!seriesName || seriesName.includes('FloorShadow')) continue;

        // Skip series the user has hidden via the legend
        const visKey = `${seriesName}_${aggId}`;
        if (chartState.seriesVisibility[visKey] === false) continue;

        const xArray = trace.x;
        const yArray = trace.y;
        if (!xArray || !yArray || xArray.length === 0) continue;

        // Binary search for closest x
        const { index, dist } = binarySearchClosest(xArray, xRounded);

        if (index >= 0 && dist <= 0.5) {
            const value = yArray[index];
            if (value !== null && value !== undefined && !isNaN(value)) {
                // Key by series+aggId so each aggregation is tracked independently
                const key = `${seriesName}_${aggId}`;
                if (!result.has(key)) {
                    result.set(key, { seriesName, aggId, onXAgg, acrossXAgg, value });
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
// Cel Line Evaluation
// =============================================================================

/**
 * Find cel lines that intersect the current x position and compute their Y values.
 * When multiple cel lines for the same series overlap, keep only the one whose
 * trend value is closest to the cursor's y position (in log space).
 *
 * @param {number} xRounded - Rounded x position
 * @param {number} yLogValue - Cursor y in log10 space
 * @returns {Array} Array of { id, seriesKey, trendY, upperY, lowerY, color, bounceColor, text }
 */
function findCelLinesAtX(xRounded, yLogValue) {
    if (!state.celLineCache || state.celLineCache.length === 0) return [];

    // Evaluate all matching cel lines
    const candidates = [];

    for (const line of state.celLineCache) {
        if (xRounded < line.x0 || xRounded > line.x1) continue;

        const logY = line.slope * xRounded + line.intercept;
        const trendY = Math.pow(10, logY);

        let upperY = null;
        let lowerY = null;

        if (line.bounceUpperOffset != null) {
            upperY = Math.pow(10, logY + line.bounceUpperOffset);
        }
        if (line.bounceLowerOffset != null) {
            lowerY = Math.pow(10, logY + line.bounceLowerOffset);
        }

        candidates.push({
            id: line.id,
            seriesKey: line.seriesKey,
            trendY,
            upperY,
            lowerY,
            color: line.color,
            bounceColor: line.bounceColor,
            fitMethod: line.fitMethod,
            bounceEnvelope: line.bounceEnvelope,
            text: line.text,
            _logDist: Math.abs(logY - yLogValue)
        });
    }

    // Group by seriesKey, keep only nearest per series
    const bySeriesKey = new Map();
    for (const c of candidates) {
        const existing = bySeriesKey.get(c.seriesKey);
        if (!existing || c._logDist < existing._logDist) {
            bySeriesKey.set(c.seriesKey, c);
        }
    }

    return Array.from(bySeriesKey.values());
}

// =============================================================================
// Info Panel Updates
// =============================================================================

/**
 * Update cursor y-value in info panel (runs every frame)
 */
function updateCursorY(yLogValue) {
    const refs = state.elements?.infoPanelRefs;
    if (!refs?.yLabel) return;
    const yValue = Math.pow(10, yLogValue);
    refs.yLabel.textContent = formatValue(yValue);
}

/**
 * Update info panel with data at current position
 * Uses textContent only - no innerHTML
 */
function updateInfoPanel(xRounded, yLogValue, traceData, celData) {
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
        for (const [key, rowRefs] of refs.seriesRows) {
            const data = traceData.get(key);

            if (!data) {
                rowRefs.row.style.display = 'none';
                continue;
            }

            let displayName = formatSeriesName(data.seriesName);
            if (displayName.length > 30) {
                displayName = displayName.slice(0, 30) + '...';
            }
            rowRefs.labelSpan.textContent = displayName;

            // Format value - timing shows reciprocal
            let displayValue;
            if (data.seriesName === 'timing') {
                displayValue = formatValue(1 / data.value);
            } else {
                displayValue = formatValue(data.value);
            }

            // Append aggregation info if not plain raw
            const onX = data.onXAgg || 'raw';
            const acrossX = data.acrossXAgg;
            if (onX !== 'raw' || acrossX) {
                const parts = [];
                if (onX !== 'raw') parts.push(onX);
                if (acrossX) {
                    const unit = WINDOW_UNITS[chartState.chartType]?.abbrev || 'x';
                    parts.push(`${acrossX.fn} ${unit}${acrossX.window}`);
                }
                displayValue += ` (${parts.join(', ')})`;
            }

            rowRefs.valueSpan.textContent = displayValue;
            rowRefs.row.style.display = '';
        }
    }

    // Change lines — position cel pool rows after their matching series rows
    if (refs.celRowPool) {
        let rowIdx = 0;
        const pool = refs.celRowPool;

        if (celData && celData.length > 0) {
            for (const cel of celData) {
                const bounceLabels = BOUNCE_LABELS[cel.bounceEnvelope];

                let anchorRow = refs.seriesRows.get(cel.matchedKey)?.row;
                if (!anchorRow) {
                    for (const [key, rowRefs] of refs.seriesRows) {
                        if (key.startsWith(cel.seriesKey + '_')) { anchorRow = rowRefs.row; break; }
                    }
                }

                // Collect the cel rows for this line so we can insert them in order
                const celRows = [];

                // Trend row
                if (rowIdx < pool.length) {
                    const r = pool[rowIdx++];
                    r.labelSpan.textContent = cel.fitMethod;
                    r.valueSpan.textContent = formatValue(cel.trendY);
                    r.row.style.display = '';
                    celRows.push(r.row);
                }

                // Upper bounce row
                if (cel.upperY != null && rowIdx < pool.length) {
                    const r = pool[rowIdx++];
                    r.labelSpan.textContent = bounceLabels?.upper || 'Upper';
                    r.valueSpan.textContent = formatValue(cel.upperY);
                    r.row.style.display = '';
                    celRows.push(r.row);
                }

                // Lower bounce row
                if (cel.lowerY != null && rowIdx < pool.length) {
                    const r = pool[rowIdx++];
                    r.labelSpan.textContent = bounceLabels?.lower || 'Lower';
                    r.valueSpan.textContent = formatValue(cel.lowerY);
                    r.row.style.display = '';
                    celRows.push(r.row);
                }

                // Insert cel rows right after the anchor series row
                if (anchorRow) {
                    let insertBefore = anchorRow.nextSibling;
                    for (const celRow of celRows) {
                        refs.seriesContainer.insertBefore(celRow, insertBefore);
                        insertBefore = celRow.nextSibling;
                    }
                }
            }
        }

        // Hide unused pool rows
        for (let i = rowIdx; i < pool.length; i++) {
            pool[i].row.style.display = 'none';
        }
    }
}

/**
 * Get display name for a series from chartState
 */
function formatSeriesName(seriesId) {
    const config = getFirstConfig(seriesId);

    if (config?.seriesName) {
        return config.seriesName;
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
    // Keydown - mark Shift held (activation deferred until mouse moves)
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Shift' && !state.shiftHeld) {
            state.shiftHeld = true;
        }
    });

    // Mousemove - activate crosshair if Shift is held and not yet active
    document.addEventListener('mousemove', () => {
        if (state.shiftHeld && !state.active) {
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
