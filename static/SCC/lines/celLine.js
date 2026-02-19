/**
 * Cel Line Mode - Place change/celeration lines on data series
 *
 * UX Flow:
 * 1. User clicks "add change line" button
 * 2. Toast shows buttons for available data series
 * 3. User clicks a series button
 * 4. Cursor changes to celeration icon, user drags to select range
 * 5. Line is created using Theil-Sen regression on selected data
 *
 * Emits events instead of calling peer modules directly.
 */

import { createToast } from '../ui/toaster.js';
import { icons, applySvgCursor, restoreCursor } from '../ui/icons.js';
import { chartState } from '../chartState.js';
import { CORRECTS, ERRORS, TIMING, LINE_DEFAULTS, COLORS, CHART_TYPE_CONFIG, WINDOW_UNITS } from '../config.js';
import { xPositionToDate, dateToXPosition, formatDateISO } from '../util/dates.js';
import { fit, FIT_METHODS, BOUNCE_ENVELOPES, DEFAULT_FIT_METHOD, DEFAULT_BOUNCE_ENVELOPE, calculateBounceBounds, calculateBounceLines, formatCelerationLabel, formatDoublingTimeLabel } from '../util/fit_lines.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { getFirstConfig, isSeriesVisible } from '../series/traceStyles.js';
import { getPixelCoordinates } from '../util/plotCoordinates.js';
import { getChartDiv } from '../util/dom.js';
import { relayout } from '../util/plotlyWrapper.js';
import { getCelLineSettings } from '../ui/celSettingsModal.js';

/**
 * Get the cel line color for a data series.
 * Simple fixed colors: green for corrects, red for errors, orange for timing, black for misc
 * @param {string} seriesKey - The series key (corrects, errors, timing, misc1, etc.)
 * @returns {string} The color to use for the cel line
 */
function getCelLineColor(seriesKey) {
    if (seriesKey === CORRECTS) return COLORS.TREND_CORRECTS;
    if (seriesKey === ERRORS) return COLORS.TREND_ERRORS;
    if (seriesKey === TIMING) return COLORS.TREND_TIMING;
    return 'black'; // misc series
}

/**
 * Check if the primary (aggId "0") trace of a series is visible.
 * Cel lines are always fitted on aggId "0" data, so their visibility
 * should track that specific aggregation — not any companion rolling
 * window or residual trace that happens to share the same base series.
 */
function isPrimaryAggVisible(seriesKey) {
    return chartState.seriesVisibility[seriesKey + '_0'] !== false;
}

// Cel line drawing state (ephemeral UI state)
var celLineState = {
    active: false,
    isDragging: false,
    mouseDownHandler: null,
    mouseMoveHandler: null,
    mouseUpHandler: null,
    touchStartHandler: null,
    touchMoveHandler: null,
    touchEndHandler: null,
    guideHandler: null,
    x1: null,
    x2: null,
    x1Pixel: null,  // Starting pixel position for DOM overlay
    shadeShape: null,
    previousDragMode: null,
    toastElement: null,
    seriesSelectionToast: null,
    selectedSeriesKey: null
};

/**
 * Builds the shapes and annotation objects for a cel line.
 * Used by both initial draw (handleCelLineConfirm) and redraw (redrawCelLines).
 *
 * @param {Object} metadata - Cel line metadata
 * @param {number} metadata.id - Unique line ID
 * @param {string} metadata.seriesKey - Series key (corrects, errors, timing, misc1, etc.)
 * @param {Date|string} metadata.date1 - Start date
 * @param {number} metadata.y1 - Start y value (display scale)
 * @param {Date|string} metadata.date2 - End date
 * @param {number} metadata.y2 - End y value (display scale)
 * @param {number|null} metadata.bounceUpperY1 - Upper bounce line start y (if envelope enabled)
 * @param {number|null} metadata.bounceUpperY2 - Upper bounce line end y
 * @param {number|null} metadata.bounceLowerY1 - Lower bounce line start y
 * @param {number|null} metadata.bounceLowerY2 - Lower bounce line end y
 * @param {string} metadata.text - Label text (celeration value)
 * @param {HTMLElement} chartDiv - Chart container element
 * @returns {Object} { shapes: [main, upperBounce?, lowerBounce?], annotation }
 */
function buildCelLineElements(metadata, chartDiv) {
    const lineName = `cel-${metadata.id}`;
    const x1 = dateToXPosition(metadata.date1);
    const x2 = dateToXPosition(metadata.date2);

    // Per-line style (concrete values set at creation, backfilled by compat script)
    const { color: celLineColor, width: celLineWidth, dash: celLineDash,
            bounceColor, bounceWidth, bounceDash } = metadata.style;

    // Build shapes array - main trend line first
    const shapes = [];

    // Main trend line
    const mainShape = {
        type: 'line',
        x0: x1,
        y0: metadata.y1,
        x1: x2,
        y1: metadata.y2,
        xref: 'x',
        yref: 'y',
        name: lineName,
        line: {
            color: celLineColor,
            width: celLineWidth,
            dash: celLineDash
        }
    };
    shapes.push(mainShape);

    // Upper bounce line (if exists in metadata)
    if (metadata.bounceUpperY1 != null && metadata.bounceUpperY2 != null) {
        shapes.push({
            type: 'line',
            x0: x1,
            y0: metadata.bounceUpperY1,
            x1: x2,
            y1: metadata.bounceUpperY2,
            xref: 'x',
            yref: 'y',
            name: `${lineName}-upper`,
            line: {
                color: bounceColor,
                width: bounceWidth,
                dash: bounceDash
            }
        });
    }

    // Lower bounce line (if exists in metadata)
    if (metadata.bounceLowerY1 != null && metadata.bounceLowerY2 != null) {
        shapes.push({
            type: 'line',
            x0: x1,
            y0: metadata.bounceLowerY1,
            x1: x2,
            y1: metadata.bounceLowerY2,
            xref: 'x',
            yref: 'y',
            name: `${lineName}-lower`,
            line: {
                color: bounceColor,
                width: bounceWidth,
                dash: bounceDash
            }
        });
    }

    // Hover is handled by lineHover.js traces — no annotation needed for hover.
    // Annotation kept only as a named placeholder for redraw/visibility filtering.
    const centerX = (x1 + x2) / 2;
    const logY1 = Math.log10(metadata.y1);
    const logY2 = Math.log10(metadata.y2);
    const centerLogY = (logY1 + logY2) / 2;

    const annotation = {
        x: centerX,
        y: centerLogY,
        xref: 'x',
        yref: 'y',
        text: '',
        showarrow: false,
        font: { color: 'rgba(0,0,0,0)', size: 1 },
        bgcolor: 'rgba(0,0,0,0)',
        bordercolor: 'rgba(0,0,0,0)',
        borderwidth: 0,
        borderpad: 0,
        xanchor: 'center',
        yanchor: 'middle',
        name: lineName
    };

    return { shapes, annotation };
}

/**
 * Activates cel line mode
 * Step 1: Show toast with buttons for available data series
 */
function activateCelLineMode() {

    const chartDiv = getChartDiv();
    if (!chartDiv) {
        console.error('Chart div not found');
        return;
    }

    if (celLineState.active) {
        deactivateCelLineMode();
        return;
    }

    // Emit event to deactivate other modes
    eventBus.emit(EVENTS.MODE_ALL_DEACTIVATE);

    celLineState.active = true;
    celLineState.selectedSeriesKey = null;

    // Build buttons for available series
    const seriesButtons = getAvailableSeriesButtons();

    if (seriesButtons.length === 0) {
        createToast({
            message: 'No data series available',
            duration: 2000
        });
        celLineState.active = false;
        return;
    }

    // Add cancel button
    seriesButtons.push({
        label: 'Cancel',
        onClick: () => {
            deactivateCelLineMode();
        },
        type: 'secondary'
    });

    // Show toast with series buttons
    celLineState.seriesSelectionToast = createToast({
        message: 'Select series:',
        buttons: seriesButtons,
        layout: 'vertical-buttons'
    });

}

/**
 * Get buttons for available data series
 */
function getAvailableSeriesButtons() {
    const buttons = [];

    // Check fixed series (use Number.isFinite to match customLegend data checks)
    if (chartState.series.corrects && chartState.series.corrects.some(v => Number.isFinite(v)) && isSeriesVisible(CORRECTS)) {
        const config = getFirstConfig(CORRECTS);
        buttons.push({
            label: config?.seriesName || 'Corrects',
            onClick: () => selectSeriesAndEnableDrag(CORRECTS),
            type: 'primary'
        });
    }

    if (chartState.series.errors && chartState.series.errors.some(v => Number.isFinite(v)) && isSeriesVisible(ERRORS)) {
        const config = getFirstConfig(ERRORS);
        buttons.push({
            label: config?.seriesName || 'Errors',
            onClick: () => selectSeriesAndEnableDrag(ERRORS),
            type: 'primary'
        });
    }

    if (chartState.minuteChart && chartState.series.timing && chartState.series.timing.some(v => Number.isFinite(v)) && isSeriesVisible(TIMING)) {
        const config = getFirstConfig(TIMING);
        buttons.push({
            label: config?.seriesName || 'Timing',
            onClick: () => selectSeriesAndEnableDrag(TIMING),
            type: 'primary'
        });
    }

    // Check misc series
    Object.entries(chartState.series.misc).forEach(([miscId, data]) => {
        if (data && data.some(v => Number.isFinite(v)) && isSeriesVisible(miscId)) {
            const config = getFirstConfig(miscId);
            buttons.push({
                label: config?.seriesName || miscId,
                onClick: () => selectSeriesAndEnableDrag(miscId),
                type: 'primary'
            });
        }
    });

    return buttons;
}

/**
 * Called when user selects a series from the toast buttons
 */
function selectSeriesAndEnableDrag(seriesKey) {
    celLineState.selectedSeriesKey = seriesKey;

    // Remove series selection toast using stored reference
    if (celLineState.seriesSelectionToast) {
        celLineState.seriesSelectionToast.remove();
        celLineState.seriesSelectionToast = null;
    }

    // Enable drag mode
    enableDragMode();
}

/**
 * Called after user selects a series - enables drag mode
 */
function enableDragMode() {
    const chartDiv = getChartDiv();
    if (!chartDiv) return;

    celLineState.previousDragMode = chartDiv.layout.dragmode;
    relayout(chartDiv, { dragmode: false });

    applySvgCursor(chartDiv, icons.scatterLine, {size: 32, hotspotX: 16, hotspotY: 16});

    celLineState.mouseDownHandler = function(event) {
        handleCelLineMouseDown(event, chartDiv);
    };

    celLineState.mouseMoveHandler = function(event) {
        handleCelLineMouseMove(event, chartDiv);
    };

    celLineState.mouseUpHandler = function(event) {
        handleCelLineMouseUp(event, chartDiv);
    };

    celLineState.touchStartHandler = function(event) {
        handleCelLineTouchStart(event, chartDiv);
    };

    celLineState.touchMoveHandler = function(event) {
        handleCelLineTouchMove(event, chartDiv);
    };

    celLineState.touchEndHandler = function(event) {
        handleCelLineTouchEnd(event, chartDiv);
    };

    // Guide line follows cursor before dragging starts
    celLineState.guideHandler = function(event) {
        if (!celLineState.isDragging) {
            const coords = getPixelCoordinates(event, chartDiv, { snapPixel: true });
            if (coords) {
                // Use fast DOM overlay instead of Plotly
                updateGuideLineOverlay(coords.xPixel);
            }
        }
    };

    chartDiv.addEventListener('mousemove', celLineState.guideHandler);
    chartDiv.addEventListener('mousedown', celLineState.mouseDownHandler);
    chartDiv.addEventListener('touchstart', celLineState.touchStartHandler, { passive: false });

    // Show toast with instructions
    celLineState.toastElement = createToast({
        message: 'Drag to select range',
        buttons: [
            {
                label: 'Cancel',
                onClick: () => {
                    deactivateCelLineMode();
                },
                type: 'secondary'
            }
        ],
        layout: 'horizontal',
        position: 'top-right'
    });

}

/**
 * Deactivates cel line mode
 */
function deactivateCelLineMode() {

    const chartDiv = getChartDiv();
    if (!chartDiv) return;

    celLineState.active = false;
    celLineState.isDragging = false;
    celLineState.selectedSeriesKey = null;

    if (celLineState.previousDragMode !== null) {
        relayout(chartDiv, { dragmode: celLineState.previousDragMode });
        celLineState.previousDragMode = null;
    }

    restoreCursor(chartDiv);

    if (celLineState.mouseDownHandler) {
        chartDiv.removeEventListener('mousedown', celLineState.mouseDownHandler);
        celLineState.mouseDownHandler = null;
    }

    if (celLineState.touchStartHandler) {
        chartDiv.removeEventListener('touchstart', celLineState.touchStartHandler);
        celLineState.touchStartHandler = null;
    }

    if (celLineState.mouseMoveHandler) {
        document.removeEventListener('mousemove', celLineState.mouseMoveHandler);
        celLineState.mouseMoveHandler = null;
    }

    if (celLineState.mouseUpHandler) {
        document.removeEventListener('mouseup', celLineState.mouseUpHandler);
        celLineState.mouseUpHandler = null;
    }

    if (celLineState.touchMoveHandler) {
        document.removeEventListener('touchmove', celLineState.touchMoveHandler);
        celLineState.touchMoveHandler = null;
    }

    if (celLineState.touchEndHandler) {
        document.removeEventListener('touchend', celLineState.touchEndHandler);
        celLineState.touchEndHandler = null;
    }

    if (celLineState.guideHandler) {
        chartDiv.removeEventListener('mousemove', celLineState.guideHandler);
        celLineState.guideHandler = null;
    }

    removeOverlays();
    cleanupSeriesSelectionMode();

    celLineState.x1 = null;
    celLineState.x2 = null;
    celLineState.x1Pixel = null;
    celLineState.shadeShape = null;

}

function handleCelLineMouseDown(event, chartDiv) {
    if (event.target.closest('#cel-drag-toast')) {
        return;
    }

    const coords = getPixelCoordinates(event, chartDiv, { snapPixel: true });
    if (!coords) return;

    celLineState.isDragging = true;
    celLineState.x1 = coords.x;
    celLineState.x2 = coords.x;
    celLineState.x1Pixel = coords.xPixel;

    document.addEventListener('mousemove', celLineState.mouseMoveHandler);
    document.addEventListener('mouseup', celLineState.mouseUpHandler);

}

function handleCelLineMouseMove(event, chartDiv) {
    if (!celLineState.isDragging) return;

    const coords = getPixelCoordinates(event, chartDiv, { snapPixel: true });
    if (!coords) return;

    if (coords.x > celLineState.x1) {
        celLineState.x2 = coords.x;
        // Use fast DOM overlays instead of Plotly
        updateShadeOverlay(celLineState.x1Pixel, coords.xPixel);
        updateGuideLineOverlay(coords.xPixel);
    }
}

function handleCelLineMouseUp(event, chartDiv) {
    if (!celLineState.isDragging) return;

    celLineState.isDragging = false;

    document.removeEventListener('mousemove', celLineState.mouseMoveHandler);
    document.removeEventListener('mouseup', celLineState.mouseUpHandler);

    // Remove DOM overlays
    removeOverlays();

    if (celLineState.x2 && celLineState.x2 > celLineState.x1) {
        // Use pre-selected series to create the line
        finalizeCelLine();
    } else {
        celLineState.x1 = null;
        celLineState.x2 = null;
        celLineState.x1Pixel = null;
    }
}

function handleCelLineTouchStart(event, chartDiv) {
    event.preventDefault();

    if (event.target.closest('#cel-drag-toast')) {
        return;
    }

    if (event.touches.length === 1) {
        const touch = event.touches[0];
        const coords = getPixelCoordinates(touch, chartDiv, { snapPixel: true });
        if (!coords) return;

        celLineState.isDragging = true;
        celLineState.x1 = coords.x;
        celLineState.x2 = coords.x;
        celLineState.x1Pixel = coords.xPixel;

        document.addEventListener('touchmove', celLineState.touchMoveHandler, { passive: false });
        document.addEventListener('touchend', celLineState.touchEndHandler);
    }
}

function handleCelLineTouchMove(event, chartDiv) {
    event.preventDefault();

    if (!celLineState.isDragging) return;

    if (event.touches.length === 1) {
        const touch = event.touches[0];
        const coords = getPixelCoordinates(touch, chartDiv, { snapPixel: true });
        if (!coords) return;

        if (coords.x > celLineState.x1) {
            celLineState.x2 = coords.x;
            // Use fast DOM overlays instead of Plotly
            updateShadeOverlay(celLineState.x1Pixel, coords.xPixel);
            updateGuideLineOverlay(coords.xPixel);
        }
    }
}

function handleCelLineTouchEnd(event, chartDiv) {
    if (!celLineState.isDragging) return;

    celLineState.isDragging = false;

    document.removeEventListener('touchmove', celLineState.touchMoveHandler);
    document.removeEventListener('touchend', celLineState.touchEndHandler);

    // Remove DOM overlays
    removeOverlays();

    if (celLineState.x2 && celLineState.x2 > celLineState.x1) {
        // Use pre-selected series to create the line
        finalizeCelLine();
    } else {
        celLineState.x1 = null;
        celLineState.x2 = null;
        celLineState.x1Pixel = null;
    }
}

/**
 * Finalize cel line creation using pre-selected series
 */
function finalizeCelLine() {
    const baseKey = celLineState.selectedSeriesKey;

    if (!baseKey) {
        deactivateCelLineMode();
        return;
    }

    const data = getDataInRangeForSeries(celLineState.x1, celLineState.x2, baseKey);

    if (!data || data.x.length < 5) {
        createToast({
            message: `Need at least 5 data points. Found ${data ? data.x.length : 0}.`,
            duration: 3000
        });
        removeOverlays();
        celLineState.x1 = null;
        celLineState.x2 = null;
        celLineState.x1Pixel = null;
        // Stay in drag mode so user can try again
        return;
    }

    handleCelLineConfirm(data, baseKey);
}

// ============================================
// DOM Overlay Functions (fast, no Plotly calls)
// ============================================

/**
 * Get or create the overlay container for cel line preview elements
 */
function getOrCreateOverlayContainer() {
    const chartDiv = getChartDiv();
    if (!chartDiv) return null;

    let container = document.getElementById('celline-overlay');
    if (!container) {
        container = document.createElement('div');
        container.id = 'celline-overlay';
        container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 50;
        `;

        // Shade rectangle
        const shade = document.createElement('div');
        shade.id = 'celline-shade-overlay';
        shade.style.cssText = `
            position: absolute;
            background: rgba(128, 128, 128, 0.3);
            display: none;
        `;

        // Vertical guide line
        const guide = document.createElement('div');
        guide.id = 'celline-guide-overlay';
        guide.style.cssText = `
            position: absolute;
            width: 3px;
            background: rgba(147, 51, 234, 0.25);
            display: none;
        `;

        container.appendChild(shade);
        container.appendChild(guide);
        chartDiv.appendChild(container);
    }

    return {
        container,
        shade: document.getElementById('celline-shade-overlay'),
        guide: document.getElementById('celline-guide-overlay')
    };
}

/**
 * Update the DOM shade overlay position (no Plotly calls)
 */
function updateShadeOverlay(x1Pixel, x2Pixel) {
    const chartDiv = getChartDiv();
    if (!chartDiv?.layout) return;

    const overlays = getOrCreateOverlayContainer();
    if (!overlays) return;

    const layout = chartDiv.layout;
    const rect = chartDiv.getBoundingClientRect();
    const plotTop = layout.margin.t;
    const plotBottom = rect.height - layout.margin.b;
    const plotHeight = plotBottom - plotTop;

    const left = Math.min(x1Pixel, x2Pixel);
    const width = Math.abs(x2Pixel - x1Pixel);

    overlays.shade.style.left = `${left}px`;
    overlays.shade.style.top = `${plotTop}px`;
    overlays.shade.style.width = `${width}px`;
    overlays.shade.style.height = `${plotHeight}px`;
    overlays.shade.style.display = 'block';
}

/**
 * Update the DOM guide line overlay position (no Plotly calls)
 */
function updateGuideLineOverlay(xPixel) {
    const chartDiv = getChartDiv();
    if (!chartDiv?.layout) return;

    const overlays = getOrCreateOverlayContainer();
    if (!overlays) return;

    const layout = chartDiv.layout;
    const rect = chartDiv.getBoundingClientRect();
    const plotTop = layout.margin.t;
    const plotBottom = rect.height - layout.margin.b;
    const plotHeight = plotBottom - plotTop;

    overlays.guide.style.left = `${xPixel - 1}px`;  // Center the 3px line
    overlays.guide.style.top = `${plotTop}px`;
    overlays.guide.style.height = `${plotHeight}px`;
    overlays.guide.style.display = 'block';
}

/**
 * Remove the DOM overlays
 */
function removeOverlays() {
    const container = document.getElementById('celline-overlay');
    if (container) {
        container.remove();
    }
}


function cleanupSeriesSelectionMode() {
    if (celLineState.toastElement) {
        celLineState.toastElement.remove();
        celLineState.toastElement = null;
    }
    if (celLineState.seriesSelectionToast) {
        celLineState.seriesSelectionToast.remove();
        celLineState.seriesSelectionToast = null;
    }
}

function getDataInRangeForSeries(x1, x2, baseKey) {
    const chartDiv = getChartDiv();

    if (!chartDiv || !chartDiv.data) {
        return null;
    }

    const targetSeriesName = baseKey;
    const xValues = [];
    const yValues = [];

    for (let traceIdx = 0; traceIdx < chartDiv.data.length; traceIdx++) {
        const trace = chartDiv.data[traceIdx];

        if (!trace.x || !trace.y || !trace.meta) {
            continue;
        }

        if (trace.meta.seriesName !== targetSeriesName) {
            continue;
        }

        // Only use the primary agg config — avoid mixing raw data with
        // rolling-window/smoothed traces of the same series.
        if (trace.meta.aggId !== "0") {
            continue;
        }

        for (let i = 0; i < trace.x.length; i++) {
            const x = trace.x[i];
            const y = trace.y[i];

            if (x >= x1 && x <= x2 && y !== null && y !== undefined && !isNaN(y)) {
                xValues.push(x);
                yValues.push(y);
            }
        }
    }

    return { x: xValues, y: yValues };
}

function handleCelLineConfirm(data, baseKey) {
    const chartDiv = getChartDiv();
    if (!chartDiv) {
        return;
    }

    const validPairs = [];
    for (let i = 0; i < data.x.length; i++) {
        const y = data.y[i];
        if (y > 0 && isFinite(y)) {
            validPairs.push({ x: data.x[i], y: y, logY: Math.log10(y) });
        }
    }

    if (validPairs.length < 5) {
        alert(`Need at least 5 valid data points. Found only ${validPairs.length}.`);
        handleCelLineCancel();
        return;
    }

    const filteredX = validPairs.map(p => p.x);
    const filteredLogY = validPairs.map(p => p.logY);

    // Get fit settings from user preferences
    const settings = getCelLineSettings();
    const fitMethod = settings.fitMethod;
    const bounceEnvelope = settings.bounceEnvelope;
    const forecast = settings.forecast;

    const fitResult = fit(filteredX, filteredLogY, fitMethod);

    if (!fitResult) {
        alert('Could not calculate trend line.');
        handleCelLineCancel();
        return;
    }

    const firstX = filteredX[0];
    const dataLastX = filteredX[filteredX.length - 1];
    const lastX = dataLastX + forecast;  // Extend by forecast amount

    const logY1 = fitResult.slope * firstX + fitResult.intercept;
    const logY2 = fitResult.slope * lastX + fitResult.intercept;
    const y1_display = Math.pow(10, logY1);
    const y2_display = Math.pow(10, logY2);

    const config = CHART_TYPE_CONFIG[chartState.chartType] || CHART_TYPE_CONFIG.Daily;
    const labelFormat = settings.labelFormat;
    const wu = WINDOW_UNITS[chartState.chartType];
    const unitName = wu ? wu.name.toLowerCase() : 'day';
    const slopeLabel = labelFormat === 'doubling'
        ? formatDoublingTimeLabel(fitResult.slope, config.unit, unitName)
        : formatCelerationLabel(fitResult.slope, config.unit);
    const labelText = `${fitMethod}: ${slopeLabel}`;

    // Calculate bounce bounds if envelope is enabled
    const bounceBounds = calculateBounceBounds(filteredLogY, filteredX, fitResult.slope, fitResult.intercept, bounceEnvelope);

    // Calculate bounce line Y values
    let bounceUpperY1 = null, bounceUpperY2 = null;
    let bounceLowerY1 = null, bounceLowerY2 = null;

    if (bounceBounds) {
        const bounceLines = calculateBounceLines([firstX, lastX], fitResult.slope, fitResult.intercept, bounceBounds);
        if (bounceLines) {
            bounceUpperY1 = bounceLines.upperY[0];
            bounceUpperY2 = bounceLines.upperY[1];
            bounceLowerY1 = bounceLines.lowerY[0];
            bounceLowerY2 = bounceLines.lowerY[1];
        }
    }

    const lineId = Date.now();

    // Store dates as YYYY-MM-DD strings to avoid timezone issues with ISO serialization
    const date1 = xPositionToDate(firstX);
    const date2 = xPositionToDate(lastX);
    const date1Str = formatDateISO(date1);
    const date2Str = formatDateISO(date2);

    // Build metadata object
    const metadata = {
        id: lineId,
        seriesKey: baseKey,
        date1: date1Str,
        y1: y1_display,
        date2: date2Str,
        y2: y2_display,
        slope: fitResult.slope,
        intercept: fitResult.intercept,
        fitMethod: fitMethod,
        bounceEnvelope: bounceEnvelope,
        forecast: forecast,
        bounceUpperY1: bounceUpperY1,
        bounceUpperY2: bounceUpperY2,
        bounceLowerY1: bounceLowerY1,
        bounceLowerY2: bounceLowerY2,
        bounceUpperOffset: bounceBounds ? bounceBounds.upper : null,
        bounceLowerOffset: bounceBounds ? bounceBounds.lower : null,
        text: labelText,
        style: {
            color: getCelLineColor(baseKey),
            width: LINE_DEFAULTS.TREND_WIDTH,
            dash: 'solid',
            bounceColor: getCelLineColor(baseKey),
            bounceWidth: 1,
            bounceDash: 'dot'
        },
        shapeIndices: [],
        annotationIndex: null
    };

    // Use builder to get shapes and annotation
    const elements = buildCelLineElements(metadata, chartDiv);

    const currentShapes = chartDiv.layout.shapes || [];
    const currentAnnotations = chartDiv.layout.annotations || [];
    const shapeIndex = currentShapes.length;
    const annotationIndex = currentAnnotations.length;

    relayout(chartDiv, {
        shapes: [...currentShapes, ...elements.shapes],
        annotations: [...currentAnnotations, elements.annotation]
    }).catch(err => {
        console.error('[CEL DEBUG] Plotly.relayout FAILED:', err);
    });

    // Update shape indices in metadata
    metadata.shapeIndices = elements.shapes.map((_, i) => shapeIndex + i);
    metadata.annotationIndex = annotationIndex;

    chartState.CelLines[lineId] = metadata;
    eventBus.emit(EVENTS.LINE_CEL_SAVED, { lineId, metadata });

    removeOverlays();
    cleanupSeriesSelectionMode();
    deactivateCelLineMode();
}

function handleCelLineCancel() {
    removeOverlays();
    cleanupSeriesSelectionMode();

    celLineState.x1 = null;
    celLineState.x2 = null;
    celLineState.x1Pixel = null;
}

function redrawCelLines() {
    const chartDiv = getChartDiv();
    if (!chartDiv) return;

    const currentShapes = chartDiv.layout.shapes || [];
    const currentAnnotations = chartDiv.layout.annotations || [];

    const nonCelShapes = currentShapes.filter(s => !s.name || !s.name.startsWith('cel-'));
    const nonCelAnnotations = currentAnnotations.filter(a => !a.name || !a.name.startsWith('cel-'));

    const celShapes = [];
    const celAnnotations = [];

    // Rebuild shapes and annotations from chartState using the builder
    const globalVisible = chartState.lineVisibility.change;
    Object.values(chartState.CelLines).forEach(entry => {
        const metadata = entry;

        const elements = buildCelLineElements(metadata, chartDiv);

        // Visible only if global change visibility AND the primary agg is on
        const lineVisible = globalVisible && isPrimaryAggVisible(metadata.seriesKey);
        if (!lineVisible) {
            elements.shapes.forEach(s => s.visible = false);
            elements.annotation.visible = false;
        }

        // Add shapes
        celShapes.push(...elements.shapes);

        // Add annotation
        celAnnotations.push(elements.annotation);
    });

    relayout(chartDiv, {
        shapes: [...nonCelShapes, ...celShapes],
        annotations: [...nonCelAnnotations, ...celAnnotations]
    });
}

/**
 * Toggle visibility of all cel (celeration/change) lines.
 * When showing, each line also requires its series to be visible.
 * @param {boolean} visible - Whether cel lines should be globally visible
 */
function setCelLineVisibility(visible) {
    const chartDiv = getChartDiv();
    if (!chartDiv) return;

    const shapes = chartDiv.layout.shapes || [];
    const annotations = chartDiv.layout.annotations || [];
    let updated = false;

    // Build a set of line IDs whose series is currently visible
    const seriesVisibleById = new Map();
    if (visible) {
        for (const [id, entry] of Object.entries(chartState.CelLines)) {
                seriesVisibleById.set(String(id), isPrimaryAggVisible(entry.seriesKey));
        }
    }

    // Update shapes with names starting with 'cel-'
    const updatedShapes = shapes.map(s => {
        if (s.name && s.name.startsWith('cel-')) {
            updated = true;
            const lineId = s.name.replace('cel-', '').split('-')[0];
            const show = visible && (seriesVisibleById.get(lineId) !== false);
            return { ...s, visible: show };
        }
        return s;
    });

    // Update annotations with names starting with 'cel-'
    const updatedAnnotations = annotations.map(a => {
        if (a.name && a.name.startsWith('cel-')) {
            updated = true;
            const lineId = a.name.replace('cel-', '').split('-')[0];
            const show = visible && (seriesVisibleById.get(lineId) !== false);
            return { ...a, visible: show };
        }
        return a;
    });

    if (updated) {
        relayout(chartDiv, { shapes: updatedShapes, annotations: updatedAnnotations });
    }
}

/**
 * Update visibility of cel lines for a specific series.
 * @param {string} seriesKey - The series key that changed
 * @param {boolean} seriesVisible - Whether that series is now visible
 */
function updateCelLineSeriesVisibility(seriesKey, seriesVisible) {
    if (!chartState.lineVisibility.change) return; // global is off, nothing to toggle

    const chartDiv = getChartDiv();
    if (!chartDiv) return;

    // Find cel line IDs that belong to this series
    const affectedIds = [];
    for (const [id, entry] of Object.entries(chartState.CelLines)) {
        if (entry.seriesKey === seriesKey) affectedIds.push(String(id));
    }
    if (affectedIds.length === 0) return;

    const shapes = chartDiv.layout.shapes || [];
    const annotations = chartDiv.layout.annotations || [];
    let updated = false;

    const updatedShapes = shapes.map(s => {
        if (s.name && s.name.startsWith('cel-')) {
            const lineId = s.name.replace('cel-', '').split('-')[0];
            if (affectedIds.includes(lineId)) {
                updated = true;
                return { ...s, visible: seriesVisible };
            }
        }
        return s;
    });

    const updatedAnnotations = annotations.map(a => {
        if (a.name && a.name.startsWith('cel-')) {
            const lineId = a.name.replace('cel-', '').split('-')[0];
            if (affectedIds.includes(lineId)) {
                updated = true;
                return { ...a, visible: seriesVisible };
            }
        }
        return a;
    });

    if (updated) {
        relayout(chartDiv, { shapes: updatedShapes, annotations: updatedAnnotations });
    }
}

/**
 * Initialize subscriptions for this module
 */
function init() {
    // Subscribe to mode activation events from navigation
    eventBus.subscribe(EVENTS.MODE_CEL_ACTIVATE, () => {
        activateCelLineMode();
    });

    eventBus.subscribe(EVENTS.MODE_ALL_DEACTIVATE, () => {
        if (celLineState.active) {
            deactivateCelLineMode();
        }
    });

    // Redraw cel lines after chart replot completes
    eventBus.subscribe(EVENTS.DATA_CHART_REPLOT_COMPLETE, () => {
        redrawCelLines();
    });

    // Redraw cel lines when a line's style is edited
    eventBus.subscribe(EVENTS.LINE_CEL_STYLE_CHANGED, () => {
        redrawCelLines();
    });

    // Subscribe to line visibility changes from legend ('change' = cel lines)
    eventBus.subscribe(EVENTS.LINE_VISIBILITY_CHANGED, (data) => {
        if (data.lineType === 'change') {
            setCelLineVisibility(data.visible);
        }
    }, true);

    // Subscribe to series visibility changes - show/hide cel lines per series
    // Emitted seriesKey is like "corrects_0"; extract base to match cel metadata
    eventBus.subscribe(EVENTS.SERIES_VISIBILITY_CHANGED, (data) => {
        const baseKey = data.seriesKey.substring(0, data.seriesKey.lastIndexOf('_'));
        updateCelLineSeriesVisibility(baseKey, isPrimaryAggVisible(baseKey));
    }, true);
}

export { activateCelLineMode, deactivateCelLineMode, init };
