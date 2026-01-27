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
 * =============================================================================
 */

import { chartState } from '../chartState.js';

const CEL_VALUES = [16, 4, 2, 1.4, 1, 1/1.4, 1/2, 1/4, 1/16];
const LABELS = ['×16', '×4', '×2', '×1.4', '×1', '÷1.4', '÷2', '÷4', '÷16'];

const UNITS = { Daily: 7, Weekly: 5, Monthly: 6, Yearly: 5 };
const PERIOD_LABELS = { Daily: 'per week', Weekly: 'per month', Monthly: 'per 6 months', Yearly: 'per 5 years' };

const FAN_COLOR = '#6ad1e3';

/**
 * Step 1: Calculate angle (same formula for line AND text)
 */
function getAngleDegrees(cel) {
    return Math.atan(Math.log10(cel) / (Math.log10(2) / Math.tan(34 * Math.PI / 180))) * (180 / Math.PI);
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

    const unit = UNITS[chartType] || 7;
    const periodLabel = PERIOD_LABELS[chartType] || 'per week';

    // Calculate plot area dimensions for visual angle calculation
    const plotWidth = layout.width - layout.margin.l - layout.margin.r;
    const plotHeight = layout.height - layout.margin.t - layout.margin.b;

    // Fan center in DATA coordinates
    const xMid = isMinuteChart ? xMax * -0.22 : xMax * 1.04;
    const yMid = isMinuteChart ? 0.01 : 1000;

    // Line length in DATA units (9% of chart width)
    const lineLength = (xMax - xMin) * 0.09;

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
            line: { color: FAN_COLOR, width: 1.25 }
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
            font: { size: 10, color: FAN_COLOR, weight: 'bold' },
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
        font: { size: 11, color: FAN_COLOR },
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
        font: { size: 11, color: FAN_COLOR },
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
    const plotWidth = plotData.layout.width - plotData.layout.margin.l - plotData.layout.margin.r;
    const extraMargin = Math.round(plotWidth * 0.18);

    if (isMinuteChart) {
        plotData.layout.margin.l += extraMargin;
    } else {
        plotData.layout.margin.r += extraMargin;
    }
    plotData.layout.width += extraMargin;

    const { shapes, annotations } = generateFanElements(plotData.layout, isMinuteChart, chartType);

    plotData.layout.shapes = [...(plotData.layout.shapes || []), ...shapes];
    plotData.layout.annotations = [...(plotData.layout.annotations || []), ...annotations];
    chartState.fanVisible = true;

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
    visible ? addCelerationFan() : removeCelerationFan();
}

// =============================================================================
// DRAGGABLE FAN
// =============================================================================

let dragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    fanGroup: null  // SVG group containing fan elements
};

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
 */
function getFanSvgElements(chartDiv) {
    const { shapeIndices, annotationIndices } = getFanIndices(chartDiv);
    const elements = [];

    // Find the layer-above shapelayer (where paper-coordinate shapes go)
    const aboveLayer = chartDiv.querySelector('.layer-above .shapelayer');
    if (aboveLayer) {
        // Grab all shapes from this layer - they should all be fan shapes
        aboveLayer.querySelectorAll('path, rect').forEach(el => {
            elements.push(el);
        });
    }

    // Get annotation groups by index
    const annotations = chartDiv.querySelectorAll('.annotation');
    annotationIndices.forEach(i => {
        if (annotations[i]) elements.push(annotations[i]);
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
        e.preventDefault();
    }
}

function handleMouseMove(e) {
    if (!dragState.isDragging || !dragState.fanElements) return;

    // Apply CSS transform to actual Plotly elements (fast)
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const transform = `translate(${dx}px, ${dy}px)`;

    dragState.fanElements.forEach(el => {
        el.style.transform = transform;
    });
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
        }
    }
}

/**
 * Initialize fan drag functionality - call after chart is created
 */
export function initFanDrag() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    chartDiv.removeEventListener('mousedown', handleMouseDown);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    chartDiv.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}
