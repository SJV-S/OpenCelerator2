/**
 * Celeration Fan Module
 *
 * Implements the standard celeration fan - a visual reference showing standard rates
 * of change (×16 to ÷16) as 9 lines radiating from a common center point.
 *
 * =============================================================================
 * CRITICAL IMPLEMENTATION NOTES
 * =============================================================================
 *
 * 1. MARGIN EXPANSION (Clipping Prevention)
 * -----------------------------------------
 * The fan is positioned OUTSIDE the plot area (in the margins). Plotly clips any
 * shapes or annotations that fall outside the plot boundaries by default.
 *
 * Solution: Expand the margin BEFORE calling Plotly.newPlot(). The injectCelerationFan()
 * function adds extra margin space (18% of plot width) to the left (minute charts) or
 * right (non-minute charts), then positions the fan within this expanded margin.
 *
 * This MUST happen before initial render - attempting to add the fan after render
 * will result in clipped/invisible elements.
 *
 * 2. TEXT-LINE ALIGNMENT (Plotly Bounding Box Bug Workaround)
 * -----------------------------------------------------------
 * Problem: Text labels at intermediate angles (±17°, ±34°, ±51°) misalign from their
 * lines, while extreme angles (±68°) align correctly.
 *
 * Root cause: When showarrow=false, Plotly rotates the text first, then calculates
 * anchors on the EXPANDED bounding box. At intermediate angles, both sin and cos
 * contribute significantly, maximizing bounding box expansion and causing offset.
 * This is a known Plotly bug (GitHub Issue #1258, open since December 2016).
 *
 * Solution (two parts):
 *
 *   a) INVISIBLE ARROW TECHNIQUE: Use showarrow=true with ax=0, ay=0, and
 *      arrowcolor='rgba(0,0,0,0)'. This changes Plotly's behavior to anchor first,
 *      THEN rotate around that anchor - keeping text exactly where specified.
 *
 *   b) VISUAL ANGLE CALCULATION: The text rotation angle must match the line's
 *      visual appearance on screen, not the data-space angle. On a semi-log chart
 *      with non-square aspect ratio, these differ. Calculate the visual angle from
 *      paper-space line endpoints multiplied by actual pixel dimensions:
 *
 *        visualAngle = atan2((p1.y - p0.y) * plotHeight, (p1.x - p0.x) * plotWidth)
 *
 * 3. DRAGGABLE FAN (Performance-Optimized)
 * ----------------------------------------
 * Problem: Calling Plotly.relayout() on every mouse move causes severe CPU load,
 * even with throttling. The chart becomes unusable.
 *
 * Solution: Use CSS transforms on Plotly's actual SVG elements during drag, then
 * call Plotly.relayout() ONCE on mouseup to sync the data model.
 *
 *   - On mousedown: Cache references to the fan's SVG elements
 *   - On mousemove: Apply CSS transform: translate(dx, dy) to cached elements
 *   - On mouseup: Clear transforms, call Plotly.relayout() once with new positions
 *
 * This approach moves the actual rendered elements (not a preview/ghost), giving
 * smooth visual feedback with zero Plotly overhead during drag.
 *
 * 4. SVG ELEMENT SELECTION (Finding Fan Elements)
 * -----------------------------------------------
 * Problem: Plotly doesn't expose shape names in the SVG DOM. We need to identify
 * which SVG elements belong to the fan vs. template shapes (ticks, spines, etc.).
 *
 * Key insight: Fan shapes are added AFTER template shapes via injectCelerationFan(),
 * so they appear at the END of the layout.shapes array and thus at the END of the
 * SVG elements in .layer-above .shapelayer.
 *
 * Solution: Count fan shapes (shapeIndices.length), then select the LAST N elements
 * from the shapelayer:
 *
 *   const allShapes = aboveLayer.querySelectorAll('path, rect');
 *   const startIndex = allShapes.length - numFanShapes;
 *   // Select elements from startIndex to end
 *
 * =============================================================================
 */

import { chartState } from '../chartState.js';
import { MOBILE_BREAKPOINT, COLORS, CHART_MATH } from '../config.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { CHART_CONFIG } from '../util/resize-chart.js';

const CEL_VALUES = [16, 4, 2, 1.4, 1, 1/1.4, 1/2, 1/4, 1/16];
const LABELS = ['×16', '×4', '×2', '×1.4', '×1', '÷1.4', '÷2', '÷4', '÷16'];
const PERIOD_LABELS = { Daily: 'per week', Weekly: 'per month', Monthly: 'per 6 months', Yearly: 'per 5 years' };

/**
 * Check if current viewport is mobile-sized
 */
function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * Step 1: Calculate angle (same formula for line AND text)
 */
function getAngleDegrees(cel) {
    return Math.atan(Math.log10(cel) / (Math.log10(2) / Math.tan(CHART_MATH.ANGLE_DEGREES * Math.PI / 180))) * (180 / Math.PI);
}

/**
 * Convert data (x, y) to paper coordinates
 */
function toPaper(x, y, xMin, xMax, yMinLog, yMaxLog) {
    return {
        x: (x - xMin) / (xMax - xMin),
        y: (Math.log10(y) - yMinLog) / (yMaxLog - yMinLog)
    };
}

export function generateFanElements(layout, isMinuteChart, chartType) {
    const xMin = layout.xaxis.range[0];
    const xMax = layout.xaxis.range[1];
    const yMinLog = layout.yaxis.range[0]; // Already log10
    const yMaxLog = layout.yaxis.range[1]; // Already log10

    const config = CHART_CONFIG[chartType] || CHART_CONFIG.Daily;
    const unit = config.unit || 7;
    const periodLabel = PERIOD_LABELS[chartType] || 'per week';

    // Calculate plot area dimensions for visual angle calculation
    const plotWidth = layout.width - layout.margin.l - layout.margin.r;
    const plotHeight = layout.height - layout.margin.t - layout.margin.b;

    // Fan center in DATA coordinates (use capacity for fixed position)
    const capacity = config.capacity || xMax;
    const xMid = isMinuteChart ? capacity * config.fanXMultiplierMinute : capacity * config.fanXMultiplier;
    const yMid = isMinuteChart ? config.fanYPositionMinute : config.fanYPosition;

    // Line length based on chart height (constant visual size)
    const lineLengthPx = plotHeight * config.fanLineLengthMultiplier;
    const lineLength = lineLengthPx * (xMax - xMin) / plotWidth;

    const shapes = [];
    const annotations = [];

    CEL_VALUES.forEach((cel, i) => {
        // Step 1: Angle (data-space, for line endpoint calculation)
        const angleDeg = getAngleDegrees(cel);
        const angleRad = angleDeg * Math.PI / 180;

        // Step 2: Line endpoint in DATA coordinates
        const dx = lineLength * Math.cos(angleRad);
        const xEnd = xMid + dx;
        const yEnd = yMid * Math.pow(10, Math.log10(cel) * dx / unit);

        // Convert line to paper
        const p0 = toPaper(xMid, yMid, xMin, xMax, yMinLog, yMaxLog);
        const p1 = toPaper(xEnd, yEnd, xMin, xMax, yMinLog, yMaxLog);

        // Calculate VISUAL angle from paper coords + aspect ratio
        // This is the actual angle the line appears at on screen
        const visualAngleDeg = Math.atan2(
            (p1.y - p0.y) * plotHeight,
            (p1.x - p0.x) * plotWidth
        ) * (180 / Math.PI);

        shapes.push({
            type: 'line',
            name: `fan-line-${i}`,
            x0: p0.x, y0: p0.y,
            x1: p1.x, y1: p1.y,
            xref: 'paper', yref: 'paper',
            line: { color: COLORS.FAN, width: 1.25 }
        });

        // Step 3: Text position - SAME FORMULA, extended dx
        const dist = 1.1 + 0.05 * LABELS[i].length;
        const textDx = dx * dist;
        const textX = xMid + textDx;
        const textY = yMid * Math.pow(10, Math.log10(cel) * textDx / unit);

        const pText = toPaper(textX, textY, xMin, xMax, yMinLog, yMaxLog);

        // Step 4: Use VISUAL angle for text rotation
        // Use invisible arrow technique to fix Plotly's bounding box rotation problem
        // With showarrow: true, Plotly anchors first THEN rotates (correct behavior)
        // With showarrow: false, Plotly rotates first THEN anchors on expanded bbox (broken)
        annotations.push({
            name: `fan-label-${i}`,
            x: pText.x,
            y: pText.y,
            xref: 'paper',
            yref: 'paper',
            text: `<b>${LABELS[i]}</b>`,
            showarrow: true,
            ax: 0,
            ay: 0,
            arrowcolor: 'rgba(0,0,0,0)',
            font: { size: 10, color: COLORS.FAN, weight: 'bold' },
            textangle: -visualAngleDeg,
            xanchor: 'center',
            yanchor: 'middle'
        });
    });

    // Header above fan - centered on midpoint of horizontal ×1 line
    const headerX = xMid + lineLength / 2;
    const headerY = yMid * 15;
    const pHeader = toPaper(headerX, headerY, xMin, xMax, yMinLog, yMaxLog);
    annotations.push({
        name: 'fan-header',
        x: pHeader.x, y: pHeader.y,
        xref: 'paper', yref: 'paper',
        text: '<b>Standard<br>change</b>',
        showarrow: false,
        font: { size: 11, color: COLORS.FAN },
        xanchor: 'center', yanchor: 'bottom'
    });

    // Period below fan - centered on midpoint of horizontal ×1 line
    const periodX = xMid + lineLength / 2;
    const periodY = yMid / 15;
    const pPeriod = toPaper(periodX, periodY, xMin, xMax, yMinLog, yMaxLog);
    annotations.push({
        name: 'fan-period',
        x: pPeriod.x, y: pPeriod.y,
        xref: 'paper', yref: 'paper',
        text: `<b>${periodLabel}</b>`,
        showarrow: false,
        font: { size: 11, color: COLORS.FAN },
        xanchor: 'center', yanchor: 'top'
    });

    // Transparent hit-area rectangle for easier dragging
    // Calculate bounds from fan origin to line endpoints, header to period
    const p0 = toPaper(xMid, yMid, xMin, xMax, yMinLog, yMaxLog);
    const pEnd = toPaper(xMid + lineLength * 1.3, yMid, xMin, xMax, yMinLog, yMaxLog); // Extended for labels
    const hitPad = 0.03; // Extra padding
    shapes.push({
        type: 'rect',
        name: 'fan-hitarea',
        x0: p0.x - hitPad,
        y0: pPeriod.y - hitPad,
        x1: pEnd.x + hitPad,
        y1: pHeader.y + hitPad,
        xref: 'paper', yref: 'paper',
        fillcolor: 'rgba(0,0,0,0)',
        line: { width: 0 }
    });

    return { shapes, annotations };
}

export function injectCelerationFan(plotData, isMinuteChart, chartType) {
    // Skip fan on mobile - screen too small
    if (isMobile()) {
        chartState.fanVisible = false;
        // Note: No event emit here - this is initial render, not user action
        return plotData;
    }

    // Note: Margin expansion is handled by resizeChartByHeight() in resize-chart.js
    // This function only injects the fan shapes and annotations

    const { shapes, annotations } = generateFanElements(plotData.layout, isMinuteChart, chartType);

    plotData.layout.shapes = [...(plotData.layout.shapes || []), ...shapes];
    plotData.layout.annotations = [...(plotData.layout.annotations || []), ...annotations];

    return plotData;
}

export function removeCelerationFan() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout) return;

    Plotly.relayout(chartDiv, {
        shapes: (chartDiv.layout.shapes || []).filter(s => !s.name?.startsWith('fan-')),
        annotations: (chartDiv.layout.annotations || []).filter(a => !a.name?.startsWith('fan-'))
    });
    chartState.fanVisible = false;
}

export function addCelerationFan() {
    // Skip fan on mobile - screen too small
    if (isMobile()) return;

    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout) return;

    const { shapes, annotations } = generateFanElements(chartDiv.layout, chartState.minuteChart, chartState.chartType);

    Plotly.relayout(chartDiv, {
        shapes: [...(chartDiv.layout.shapes || []), ...shapes],
        annotations: [...(chartDiv.layout.annotations || []), ...annotations]
    });
    chartState.fanVisible = true;
}

export function toggleCelerationFan(visible) {
    console.log('[toggleCelerationFan] called with visible:', visible);
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) {
        console.log('[toggleCelerationFan] No chartDiv found');
        return;
    }

    const fanElements = getFanSvgElements(chartDiv);
    console.log('[toggleCelerationFan] Found', fanElements.length, 'fan elements');
    fanElements.forEach(el => {
        el.style.display = visible ? '' : 'none';
    });

    chartState.fanVisible = visible;
}

/**
 * Regenerate the fan with current layout dimensions
 * Called on resize to recalculate visual angles for new aspect ratio
 */
export function regenerateFan() {
    // On mobile, remove fan if it exists (e.g., resized from desktop)
    if (isMobile()) {
        if (chartState.fanVisible) {
            removeCelerationFan();
        }
        return;
    }

    if (!chartState.fanVisible) return;

    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout) return;

    // Remove existing fan shapes and annotations
    const existingShapes = (chartDiv.layout.shapes || []).filter(s => !s.name?.startsWith('fan-'));
    const existingAnnotations = (chartDiv.layout.annotations || []).filter(a => !a.name?.startsWith('fan-'));

    // Generate new fan with current layout dimensions
    const { shapes, annotations } = generateFanElements(chartDiv.layout, chartState.minuteChart, chartState.chartType);

    // Update in single relayout call
    Plotly.relayout(chartDiv, {
        shapes: [...existingShapes, ...shapes],
        annotations: [...existingAnnotations, ...annotations]
    });
}

/**
 * Initialize fan module - subscribe to events
 * Called by main.js coordinator
 */
export function init() {
    eventBus.subscribe(EVENTS.FAN_VISIBILITY_CHANGED, (data) => {
        toggleCelerationFan(data.visible);
    }, true);
}

// =============================================================================
// DRAGGABLE FAN
// =============================================================================

let dragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    fanElements: null  // Cached SVG elements for the fan (lines, rect, annotations)
};

let fanHoverState = {
    isHovered: false,
    tooltip: null
};

/**
 * Show/hide fan tooltip
 */
function updateFanTooltip(show, x, y) {
    if (show) {
        if (!fanHoverState.tooltip) {
            fanHoverState.tooltip = document.createElement('div');
            fanHoverState.tooltip.className = 'fixed px-2 py-1 text-xs rounded pointer-events-none z-[9999]';
            fanHoverState.tooltip.style.cssText = `background: ${COLORS.FAN}; color: white;`;
            fanHoverState.tooltip.textContent = 'Drag to move';
            document.body.appendChild(fanHoverState.tooltip);
        }
        fanHoverState.tooltip.style.left = `${x + 10}px`;
        fanHoverState.tooltip.style.top = `${y + 10}px`;
        fanHoverState.tooltip.style.display = 'block';
    } else if (fanHoverState.tooltip) {
        fanHoverState.tooltip.style.display = 'none';
    }
}

/**
 * Update fan highlight on hover
 */
function updateFanHighlight(chartDiv, isHovered) {
    const updates = {};

    (chartDiv.layout.shapes || []).forEach((shape, i) => {
        if (shape.name === 'fan-hitarea') {
            updates[`shapes[${i}].fillcolor`] = isHovered ? COLORS.FAN_HIGHLIGHT : 'rgba(0,0,0,0)';
        }
    });

    if (Object.keys(updates).length > 0) {
        Plotly.relayout(chartDiv, updates);
    }
}

/**
 * Convert pixel coordinates to paper coordinates
 */
function pixelToPaper(chartDiv, pixelX, pixelY) {
    const layout = chartDiv.layout;
    const bbox = chartDiv.getBoundingClientRect();

    const plotLeft = bbox.left + layout.margin.l;
    const plotRight = bbox.right - layout.margin.r;
    const plotTop = bbox.top + layout.margin.t;
    const plotBottom = bbox.bottom - layout.margin.b;

    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;

    const paperX = (pixelX - plotLeft) / plotWidth;
    const paperY = 1 - (pixelY - plotTop) / plotHeight;

    return { x: paperX, y: paperY };
}

/**
 * Check if a paper coordinate point is within the fan's hit-area rectangle
 */
function isPointOnFan(chartDiv, paperX, paperY) {
    const layout = chartDiv.layout;
    const hitArea = (layout.shapes || []).find(s => s.name === 'fan-hitarea');

    if (!hitArea) return false;

    return paperX >= hitArea.x0 && paperX <= hitArea.x1 &&
           paperY >= hitArea.y0 && paperY <= hitArea.y1;
}

/**
 * Get indices of fan shapes and annotations in layout arrays
 */
function getFanIndices(chartDiv) {
    const layout = chartDiv.layout;
    const shapeIndices = [];
    const annotationIndices = [];

    (layout.shapes || []).forEach((shape, i) => {
        if (shape.name?.startsWith('fan-')) {
            shapeIndices.push(i);
        }
    });

    (layout.annotations || []).forEach((ann, i) => {
        if (ann.name?.startsWith('fan-')) {
            annotationIndices.push(i);
        }
    });

    return { shapeIndices, annotationIndices };
}

/**
 * Get Plotly's SVG elements for the fan
 *
 * Uses shape indices looked up by name (fan-*) to select the correct SVG elements.
 * Plotly maintains 1:1 mapping between layout.shapes indices and SVG elements.
 */
function getFanSvgElements(chartDiv) {
    const { shapeIndices, annotationIndices } = getFanIndices(chartDiv);
    const elements = [];

    // Select shapes by data-index attribute (set by Plotly to match layout.shapes index)
    shapeIndices.forEach(i => {
        const el = chartDiv.querySelector(`[data-index="${i}"]`);
        if (el) elements.push(el);
    });

    // Select annotations by data-index attribute
    annotationIndices.forEach(i => {
        const el = chartDiv.querySelector(`.annotation[data-index="${i}"]`);
        if (el) elements.push(el);
    });

    return elements;
}

/**
 * Update fan position in Plotly data
 */
function updateFanPosition(chartDiv, dx, dy) {
    const layout = chartDiv.layout;
    const updates = {};

    (layout.shapes || []).forEach((shape, i) => {
        if (shape.name?.startsWith('fan-')) {
            updates[`shapes[${i}].x0`] = shape.x0 + dx;
            updates[`shapes[${i}].y0`] = shape.y0 + dy;
            updates[`shapes[${i}].x1`] = shape.x1 + dx;
            updates[`shapes[${i}].y1`] = shape.y1 + dy;
        }
    });

    (layout.annotations || []).forEach((ann, i) => {
        if (ann.name?.startsWith('fan-')) {
            updates[`annotations[${i}].x`] = ann.x + dx;
            updates[`annotations[${i}].y`] = ann.y + dy;
        }
    });

    Plotly.relayout(chartDiv, updates);
}

function handleMouseDown(e) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout || !chartState.fanVisible) return;

    const paper = pixelToPaper(chartDiv, e.clientX, e.clientY);

    if (isPointOnFan(chartDiv, paper.x, paper.y)) {
        dragState.isDragging = true;
        dragState.startX = e.clientX;
        dragState.startY = e.clientY;

        // Get and cache the actual Plotly SVG elements
        dragState.fanElements = getFanSvgElements(chartDiv);

        chartDiv.style.cursor = 'grabbing';
        updateFanTooltip(false);  // Hide tooltip while dragging

        // Prevent Plotly's pan from intercepting
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }
}

function handleMouseMove(e) {
    if (dragState.isDragging && dragState.fanElements) {
        // Apply CSS transform to actual Plotly elements (fast)
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        const transform = `translate(${dx}px, ${dy}px)`;

        dragState.fanElements.forEach(el => {
            el.style.transform = transform;
        });
        return;
    }

    // Hover detection when not dragging
    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout || !chartState.fanVisible) return;

    const paper = pixelToPaper(chartDiv, e.clientX, e.clientY);
    const isOnFan = isPointOnFan(chartDiv, paper.x, paper.y);

    if (isOnFan) {
        chartDiv.style.cursor = 'grab';
        updateFanTooltip(true, e.clientX, e.clientY);
    } else {
        if (fanHoverState.isHovered) {
            chartDiv.style.cursor = '';
            updateFanTooltip(false);
        }
    }

    if (isOnFan !== fanHoverState.isHovered) {
        fanHoverState.isHovered = isOnFan;
        updateFanHighlight(chartDiv, isOnFan);
    }
}

function handleMouseUp(e) {
    if (dragState.isDragging) {
        dragState.isDragging = false;

        const chartDiv = document.getElementById('chart');

        // Clear CSS transforms
        if (dragState.fanElements) {
            dragState.fanElements.forEach(el => {
                el.style.transform = '';
            });
            dragState.fanElements = null;
        }

        if (chartDiv) {
            chartDiv.style.cursor = '';

            // Calculate delta in paper coords and update Plotly once
            const paperStart = pixelToPaper(chartDiv, dragState.startX, dragState.startY);
            const paperEnd = pixelToPaper(chartDiv, e.clientX, e.clientY);
            const dx = paperEnd.x - paperStart.x;
            const dy = paperEnd.y - paperStart.y;

            if (dx !== 0 || dy !== 0) {
                updateFanPosition(chartDiv, dx, dy);
            }

            // Reset hover state after drag
            fanHoverState.isHovered = false;
            updateFanHighlight(chartDiv, false);
        }
    }
}

/**
 * Initialize fan drag functionality - call after chart is created
 */
export function initFanDrag() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    // Remove existing listeners (in case of re-init)
    chartDiv.removeEventListener('mousedown', handleMouseDown, true);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    // Use capture phase for mousedown so we intercept before Plotly's pan handler
    chartDiv.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}
