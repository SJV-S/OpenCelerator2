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

import { removeToast, createToast } from '../util/toaster.js';
import { icons } from '../util/icons.js';
import { applySvgCursor, restoreCursor } from '../util/cursorIcon.js';
import { chartState } from '../chartState.js';
import { xPositionToDate } from '../util/dates.js';
import { removeLine } from './allLines.js';
import { fit, FIT_METHODS, BOUNCE_ENVELOPES, DEFAULT_FIT_METHOD, DEFAULT_BOUNCE_ENVELOPE, calculateBounceBounds, calculateBounceLines, formatCelerationLabel } from '../util/fit_lines.js';
import { eventBus, EVENTS } from '../eventBus.js';

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
    shadeShape: null,
    previousDragMode: null,
    toastElement: null,
    seriesSelectionToast: null,
    selectedSeriesKey: null,
    lastUpdateTime: 0,
    throttleDelay: 33  // ~30fps throttle
};

/**
 * Activates cel line mode
 * Step 1: Show toast with buttons for available data series
 */
function activateCelLineMode() {
    console.log('Activating cel line mode');

    const chartDiv = document.getElementById('chart');
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
        layout: 'horizontal'
    });

    console.log('Cel line mode activated - awaiting series selection');
}

/**
 * Get buttons for available data series
 */
function getAvailableSeriesButtons() {
    const buttons = [];

    // Check fixed series
    if (chartState.series.corrects && chartState.series.corrects.some(v => v !== null)) {
        const config = chartState.traceStyles.correct?.raw;
        buttons.push({
            label: config?.seriesName || 'Corrects',
            onClick: () => selectSeriesAndEnableDrag('correct'),
            type: 'primary'
        });
    }

    if (chartState.series.errors && chartState.series.errors.some(v => v !== null)) {
        const config = chartState.traceStyles.incorrect?.raw;
        buttons.push({
            label: config?.seriesName || 'Errors',
            onClick: () => selectSeriesAndEnableDrag('incorrect'),
            type: 'primary'
        });
    }

    if (chartState.series.timing && chartState.series.timing.some(v => v !== null)) {
        const config = chartState.traceStyles.timing?.raw;
        buttons.push({
            label: config?.seriesName || 'Timing',
            onClick: () => selectSeriesAndEnableDrag('timing'),
            type: 'primary'
        });
    }

    // Check misc series
    Object.entries(chartState.series.misc).forEach(([miscId, data]) => {
        if (data && data.some(v => v !== null)) {
            const config = chartState.traceStyles.misc[miscId]?.raw;
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
        removeToast(celLineState.seriesSelectionToast.id);
        celLineState.seriesSelectionToast = null;
    }

    // Enable drag mode
    enableDragMode();
}

/**
 * Called after user selects a series - enables drag mode
 */
function enableDragMode() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    celLineState.previousDragMode = chartDiv.layout.dragmode;
    Plotly.relayout(chartDiv, { dragmode: false });

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
            const coords = getPlotCoordinatesForCelLine(event, chartDiv);
            if (coords) {
                updateVerticalGuideLine(coords.x);
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
        position: 'top-right-secondary'
    });

    console.log('Drag mode enabled for cel line');
}

/**
 * Deactivates cel line mode
 */
function deactivateCelLineMode() {
    console.log('Deactivating cel line mode');

    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    celLineState.active = false;
    celLineState.isDragging = false;
    celLineState.selectedSeriesKey = null;

    if (celLineState.previousDragMode !== null) {
        Plotly.relayout(chartDiv, { dragmode: celLineState.previousDragMode });
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

    removeShadeRectangle();
    removeVerticalGuideLine();
    cleanupSeriesSelectionMode();

    celLineState.x1 = null;
    celLineState.x2 = null;
    celLineState.shadeShape = null;

    console.log('Cel line mode deactivated');
}

function handleCelLineMouseDown(event, chartDiv) {
    if (event.target.closest('#cel-drag-toast')) {
        return;
    }

    const coords = getPlotCoordinatesForCelLine(event, chartDiv);
    if (!coords) return;

    celLineState.isDragging = true;
    celLineState.x1 = coords.x;
    celLineState.x2 = coords.x;

    document.addEventListener('mousemove', celLineState.mouseMoveHandler);
    document.addEventListener('mouseup', celLineState.mouseUpHandler);

    console.log(`Started drag at x1=${celLineState.x1}`);
}

function handleCelLineMouseMove(event, chartDiv) {
    if (!celLineState.isDragging) return;

    // Throttle updates to ~30fps to prevent CPU overload
    const now = Date.now();
    if (now - celLineState.lastUpdateTime < celLineState.throttleDelay) {
        return;
    }
    celLineState.lastUpdateTime = now;

    const coords = getPlotCoordinatesForCelLine(event, chartDiv);
    if (!coords) return;

    if (coords.x > celLineState.x1) {
        celLineState.x2 = coords.x;
        updateShadeRectangle();
        updateVerticalGuideLine(coords.x);
    }
}

function handleCelLineMouseUp(event, chartDiv) {
    if (!celLineState.isDragging) return;

    celLineState.isDragging = false;

    document.removeEventListener('mousemove', celLineState.mouseMoveHandler);
    document.removeEventListener('mouseup', celLineState.mouseUpHandler);

    if (celLineState.x2 && celLineState.x2 > celLineState.x1) {
        // Use pre-selected series to create the line
        finalizeCelLine();
    } else {
        removeShadeRectangle();
        removeVerticalGuideLine();
        celLineState.x1 = null;
        celLineState.x2 = null;
    }
}

function handleCelLineTouchStart(event, chartDiv) {
    event.preventDefault();

    if (event.target.closest('#cel-drag-toast')) {
        return;
    }

    if (event.touches.length === 1) {
        const touch = event.touches[0];
        const coords = getPlotCoordinatesForCelLineTouch(touch, chartDiv);
        if (!coords) return;

        celLineState.isDragging = true;
        celLineState.x1 = coords.x;
        celLineState.x2 = coords.x;

        document.addEventListener('touchmove', celLineState.touchMoveHandler, { passive: false });
        document.addEventListener('touchend', celLineState.touchEndHandler);
    }
}

function handleCelLineTouchMove(event, chartDiv) {
    event.preventDefault();

    if (!celLineState.isDragging) return;

    // Throttle updates to ~30fps to prevent CPU overload
    const now = Date.now();
    if (now - celLineState.lastUpdateTime < celLineState.throttleDelay) {
        return;
    }
    celLineState.lastUpdateTime = now;

    if (event.touches.length === 1) {
        const touch = event.touches[0];
        const coords = getPlotCoordinatesForCelLineTouch(touch, chartDiv);
        if (!coords) return;

        if (coords.x > celLineState.x1) {
            celLineState.x2 = coords.x;
            updateShadeRectangle();
            updateVerticalGuideLine(coords.x);
        }
    }
}

function handleCelLineTouchEnd(event, chartDiv) {
    if (!celLineState.isDragging) return;

    celLineState.isDragging = false;

    document.removeEventListener('touchmove', celLineState.touchMoveHandler);
    document.removeEventListener('touchend', celLineState.touchEndHandler);

    if (celLineState.x2 && celLineState.x2 > celLineState.x1) {
        // Use pre-selected series to create the line
        finalizeCelLine();
    } else {
        removeShadeRectangle();
        removeVerticalGuideLine();
        celLineState.x1 = null;
        celLineState.x2 = null;
    }
}

/**
 * Finalize cel line creation using pre-selected series
 */
function finalizeCelLine() {
    const baseKey = celLineState.selectedSeriesKey;
    if (!baseKey) {
        console.error('No series selected');
        deactivateCelLineMode();
        return;
    }

    const data = getDataInRangeForSeries(celLineState.x1, celLineState.x2, baseKey);

    if (!data || data.x.length < 5) {
        createToast({
            message: `Need at least 5 data points. Found ${data ? data.x.length : 0}.`,
            duration: 3000
        });
        removeShadeRectangle();
        removeVerticalGuideLine();
        celLineState.x1 = null;
        celLineState.x2 = null;
        // Stay in drag mode so user can try again
        return;
    }

    handleCelLineConfirm(data, baseKey);
}

function getPlotCoordinatesForCelLine(event, chartDiv) {
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

    if (xPixel < plotLeft || xPixel > plotRight || yPixel < plotTop || yPixel > plotBottom) {
        return null;
    }

    const xFraction = (xPixel - plotLeft) / (plotRight - plotLeft);
    const xRange = layout.xaxis.range;
    const xValue = xRange[0] + xFraction * (xRange[1] - xRange[0]);
    const xRounded = Math.round(xValue);

    return { x: xRounded, xPixel: xPixel, yPixel: yPixel };
}

function getPlotCoordinatesForCelLineTouch(touch, chartDiv) {
    const rect = chartDiv.getBoundingClientRect();
    const xPixel = touch.clientX - rect.left;
    const yPixel = touch.clientY - rect.top;
    const layout = chartDiv.layout;

    if (!layout || !layout.xaxis || !layout.yaxis) {
        return null;
    }

    const plotLeft = layout.margin.l;
    const plotRight = rect.width - layout.margin.r;
    const plotTop = layout.margin.t;
    const plotBottom = rect.height - layout.margin.b;

    if (xPixel < plotLeft || xPixel > plotRight || yPixel < plotTop || yPixel > plotBottom) {
        return null;
    }

    const xFraction = (xPixel - plotLeft) / (plotRight - plotLeft);
    const xRange = layout.xaxis.range;
    const xValue = xRange[0] + xFraction * (xRange[1] - xRange[0]);
    const xRounded = Math.round(xValue);

    return { x: xRounded, xPixel: xPixel, yPixel: yPixel };
}

function updateShadeRectangle() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    const layout = chartDiv.layout;
    if (!layout || !layout.yaxis) return;

    const yRange = layout.yaxis.range;
    const yMin = Math.pow(10, yRange[0]);
    const yMax = Math.pow(10, yRange[1]);

    const shadeShape = {
        type: 'rect',
        x0: celLineState.x1,
        y0: yMin,
        x1: celLineState.x2,
        y1: yMax,
        xref: 'x',
        yref: 'y',
        fillcolor: 'rgba(128, 128, 128, 0.3)',
        line: { width: 0 },
        name: 'celline-shade'
    };

    const currentShapes = chartDiv.layout.shapes || [];
    const filteredShapes = currentShapes.filter(shape => shape.name !== 'celline-shade');
    const newShapes = [...filteredShapes, shadeShape];

    Plotly.relayout(chartDiv, { shapes: newShapes }).then(() => {
        celLineState.shadeShape = newShapes.length - 1;
    });
}

function removeShadeRectangle() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    const currentShapes = chartDiv.layout.shapes || [];
    const newShapes = currentShapes.filter(shape => shape.name !== 'celline-shade');

    if (newShapes.length !== currentShapes.length) {
        Plotly.relayout(chartDiv, { shapes: newShapes });
    }

    celLineState.shadeShape = null;
}

function updateVerticalGuideLine(xValue) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    const lineShape = {
        type: 'line',
        x0: xValue,
        x1: xValue,
        y0: 0,
        y1: 1,
        xref: 'x',
        yref: 'paper',
        opacity: 0.25,
        line: {
            color: '#9333ea',
            width: 3
        },
        name: 'celline-guide'
    };

    const currentShapes = chartDiv.layout.shapes || [];
    const filteredShapes = currentShapes.filter(shape => shape.name !== 'celline-guide');
    const newShapes = [...filteredShapes, lineShape];

    Plotly.relayout(chartDiv, { shapes: newShapes });
}

function removeVerticalGuideLine() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    const currentShapes = chartDiv.layout.shapes || [];
    const newShapes = currentShapes.filter(shape => shape.name !== 'celline-guide');

    if (newShapes.length !== currentShapes.length) {
        Plotly.relayout(chartDiv, { shapes: newShapes });
    }
}

function cleanupSeriesSelectionMode() {
    if (celLineState.toastElement) {
        removeToast(celLineState.toastElement.id);
        celLineState.toastElement = null;
    }
    if (celLineState.seriesSelectionToast) {
        removeToast(celLineState.seriesSelectionToast.id);
        celLineState.seriesSelectionToast = null;
    }
}

function getDataInRangeForSeries(x1, x2, baseKey) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartDiv.data) {
        return null;
    }

    const seriesNameMap = {
        'correct': 'corrects',
        'incorrect': 'errors',
        'timing': 'timing'
    };

    // For misc series, the baseKey IS the seriesName (misc1, misc2, etc.)
    const targetSeriesName = seriesNameMap[baseKey] || baseKey;
    const xValues = [];
    const yValues = [];

    for (let traceIdx = 0; traceIdx < chartDiv.data.length; traceIdx++) {
        const trace = chartDiv.data[traceIdx];

        if (!trace.x || !trace.y || !trace.meta) continue;

        if (trace.meta.seriesName !== targetSeriesName) {
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
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

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

    // Get fit settings from chartState (or use defaults)
    const settings = chartState.CelLines.settings || {};
    const fitMethod = settings.fitMethod || DEFAULT_FIT_METHOD;
    const bounceEnvelope = settings.bounceEnvelope || DEFAULT_BOUNCE_ENVELOPE;
    const forecast = settings.forecast || 0;

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

    const labelText = formatCelerationLabel(fitResult.slope, 'weekly');

    // Calculate bounce bounds if envelope is enabled
    const bounceBounds = calculateBounceBounds(filteredLogY, filteredX, fitResult.slope, fitResult.intercept, bounceEnvelope);

    const lineId = Date.now();
    const lineName = `cel-${lineId}`;

    const trendStyle = chartState.lineStyles.trend[baseKey] || chartState.lineStyles.trend.timing;

    // Build shapes array - main trend line first
    const newShapes = [];
    const lineShape = {
        type: 'line',
        x0: firstX,
        y0: y1_display,
        x1: lastX,
        y1: y2_display,
        xref: 'x',
        yref: 'y',
        name: lineName,
        line: {
            color: trendStyle.color,
            width: trendStyle.width,
            dash: trendStyle.dash
        }
    };
    newShapes.push(lineShape);

    // Add bounce line shapes if bounds exist
    let bounceUpperY1 = null, bounceUpperY2 = null;
    let bounceLowerY1 = null, bounceLowerY2 = null;

    if (bounceBounds) {
        const bounceLines = calculateBounceLines([firstX, lastX], fitResult.slope, fitResult.intercept, bounceBounds);
        if (bounceLines) {
            bounceUpperY1 = bounceLines.upperY[0];
            bounceUpperY2 = bounceLines.upperY[1];
            bounceLowerY1 = bounceLines.lowerY[0];
            bounceLowerY2 = bounceLines.lowerY[1];

            // Upper bounce line
            newShapes.push({
                type: 'line',
                x0: firstX,
                y0: bounceUpperY1,
                x1: lastX,
                y1: bounceUpperY2,
                xref: 'x',
                yref: 'y',
                name: `${lineName}-upper`,
                line: {
                    color: trendStyle.color,
                    width: 1,
                    dash: 'dot'
                }
            });

            // Lower bounce line
            newShapes.push({
                type: 'line',
                x0: firstX,
                y0: bounceLowerY1,
                x1: lastX,
                y1: bounceLowerY2,
                xref: 'x',
                yref: 'y',
                name: `${lineName}-lower`,
                line: {
                    color: trendStyle.color,
                    width: 1,
                    dash: 'dot'
                }
            });
        }
    }

    const currentShapes = chartDiv.layout.shapes || [];
    const shapeIndex = currentShapes.length;

    const centerX = (firstX + lastX) / 2;
    const centerLogY = (logY1 + logY2) / 2;

    const annotation = {
        x: centerX,
        y: centerLogY,
        xref: 'x',
        yref: 'y',
        text: labelText,
        showarrow: false,
        font: { color: 'rgba(0,0,0,0)', size: 12 },
        bgcolor: 'rgba(0,0,0,0)',
        bordercolor: 'rgba(0,0,0,0)',
        borderwidth: 0,
        borderpad: 8,
        xanchor: 'center',
        yanchor: 'middle',
        name: lineName,
        hovertext: labelText,
        hoverlabel: {
            bgcolor: trendStyle.color,
            font: { color: 'white', size: 14 }
        }
    };

    const currentAnnotations = chartDiv.layout.annotations || [];
    const annotationIndex = currentAnnotations.length;

    Plotly.relayout(chartDiv, {
        shapes: [...currentShapes, ...newShapes],
        annotations: [...currentAnnotations, annotation]
    });

    // Store shape indices for all shapes (trend + bounce lines)
    const shapeIndices = [];
    for (let i = 0; i < newShapes.length; i++) {
        shapeIndices.push(shapeIndex + i);
    }

    const metadata = {
        id: lineId,
        seriesKey: baseKey,
        date1: xPositionToDate(firstX),
        y1: y1_display,
        date2: xPositionToDate(lastX),
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
        text: labelText,
        shapeIndices: shapeIndices,
        annotationIndex: annotationIndex
    };

    chartState.CelLines[lineId] = metadata;
    eventBus.emit(EVENTS.LINE_CEL_SAVED, { lineId, metadata });

    removeShadeRectangle();
    cleanupSeriesSelectionMode();
    deactivateCelLineMode();
}

function handleCelLineCancel() {
    removeShadeRectangle();
    removeVerticalGuideLine();
    cleanupSeriesSelectionMode();

    celLineState.x1 = null;
    celLineState.x2 = null;
}

function handleCelLineClick(lineName) {
    const lineId = parseInt(lineName.split('-')[1]);
    if (isNaN(lineId)) {
        console.error(`Invalid lineName format: ${lineName}`);
        return;
    }

    const metadata = chartState.CelLines[lineId];
    if (!metadata) {
        console.error(`No metadata found for line ID: ${lineId}`);
        return;
    }

    // Build info message including fit method and forecast
    let message = `Celeration: ${metadata.text}`;
    if (metadata.fitMethod) {
        message += ` (${metadata.fitMethod}`;
        if (metadata.forecast && metadata.forecast > 0) {
            message += `, +${metadata.forecast}d`;
        }
        message += ')';
    }

    createToast({
        id: 'cel-line-click-toaster',
        message: message,
        buttons: [
            {
                label: 'Remove',
                onClick: () => {
                    removeCelLineById(lineName);
                    removeToast('cel-line-click-toaster');
                },
                type: 'secondary'
            }
        ],
        layout: 'horizontal',
        duration: 3000
    });
}

function removeCelLineById(lineName) {
    const lineId = parseInt(lineName.split('-')[1]);
    if (isNaN(lineId)) {
        return false;
    }

    return removeLine('CelLines', lineId);
}

function redrawCelLines() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    const shapes = chartDiv.layout.shapes || [];
    const annotations = chartDiv.layout.annotations || [];

    const nonCelShapes = shapes.filter(s => !s.name || !s.name.startsWith('cel-'));
    const nonCelAnnotations = annotations.filter(a => !a.name || !a.name.startsWith('cel-'));

    const celShapes = [];
    const celAnnotations = [];

    Object.values(chartState.CelLines).forEach(entry => {
        // Skip the settings object
        if (entry === chartState.CelLines.settings) return;

        const metadata = entry;
        const lineName = `cel-${metadata.id}`;

        const x1 = Math.floor((metadata.date1 - chartState.startDate) / (1000 * 60 * 60 * 24));
        const x2 = Math.floor((metadata.date2 - chartState.startDate) / (1000 * 60 * 60 * 24));

        const trendStyle = chartState.lineStyles.trend[metadata.seriesKey] || chartState.lineStyles.trend.timing;

        // Main trend line
        const lineShape = {
            type: 'line',
            x0: x1,
            y0: metadata.y1,
            x1: x2,
            y1: metadata.y2,
            xref: 'x',
            yref: 'y',
            name: lineName,
            line: {
                color: trendStyle.color,
                width: trendStyle.width,
                dash: trendStyle.dash
            }
        };
        celShapes.push(lineShape);

        // Bounce lines if they exist in metadata
        if (metadata.bounceUpperY1 != null && metadata.bounceUpperY2 != null) {
            celShapes.push({
                type: 'line',
                x0: x1,
                y0: metadata.bounceUpperY1,
                x1: x2,
                y1: metadata.bounceUpperY2,
                xref: 'x',
                yref: 'y',
                name: `${lineName}-upper`,
                line: {
                    color: trendStyle.color,
                    width: 1,
                    dash: 'dot'
                }
            });
        }

        if (metadata.bounceLowerY1 != null && metadata.bounceLowerY2 != null) {
            celShapes.push({
                type: 'line',
                x0: x1,
                y0: metadata.bounceLowerY1,
                x1: x2,
                y1: metadata.bounceLowerY2,
                xref: 'x',
                yref: 'y',
                name: `${lineName}-lower`,
                line: {
                    color: trendStyle.color,
                    width: 1,
                    dash: 'dot'
                }
            });
        }

        const centerX = (x1 + x2) / 2;
        const logY1 = Math.log10(metadata.y1);
        const logY2 = Math.log10(metadata.y2);
        const centerLogY = (logY1 + logY2) / 2;

        const annotation = {
            x: centerX,
            y: centerLogY,
            xref: 'x',
            yref: 'y',
            text: metadata.text,
            showarrow: false,
            font: { color: 'rgba(0,0,0,0)', size: 12 },
            bgcolor: 'rgba(0,0,0,0)',
            bordercolor: 'rgba(0,0,0,0)',
            borderwidth: 0,
            borderpad: 8,
            xanchor: 'center',
            yanchor: 'middle',
            name: lineName,
            hovertext: metadata.text,
            hoverlabel: {
                bgcolor: trendStyle.color,
                font: { color: 'white', size: 14 }
            }
        };

        celAnnotations.push(annotation);
    });

    Plotly.relayout(chartDiv, {
        shapes: [...nonCelShapes, ...celShapes],
        annotations: [...nonCelAnnotations, ...celAnnotations]
    });
}

/**
 * Toggle visibility of all cel (celeration/change) lines
 * @param {boolean} visible - Whether cel lines should be visible
 */
function setCelLineVisibility(visible) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    const shapes = chartDiv.layout.shapes || [];
    const annotations = chartDiv.layout.annotations || [];
    let updated = false;

    // Update shapes with names starting with 'cel-'
    const updatedShapes = shapes.map(s => {
        if (s.name && s.name.startsWith('cel-')) {
            updated = true;
            return { ...s, visible };
        }
        return s;
    });

    // Update annotations with names starting with 'cel-'
    const updatedAnnotations = annotations.map(a => {
        if (a.name && a.name.startsWith('cel-')) {
            updated = true;
            return { ...a, visible };
        }
        return a;
    });

    if (updated) {
        Plotly.relayout(chartDiv, { shapes: updatedShapes, annotations: updatedAnnotations });
    }
}

/**
 * Initialize subscriptions for this module
 */
function init() {
    eventBus.subscribe(EVENTS.LINE_CEL_CLICKED, (data) => {
        handleCelLineClick(data.lineName);
    }, true);

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

    // Subscribe to line visibility changes from legend ('change' = cel lines)
    eventBus.subscribe(EVENTS.LINE_VISIBILITY_CHANGED, (data) => {
        if (data.lineType === 'change') {
            setCelLineVisibility(data.visible);
        }
    }, true);
}

export { activateCelLineMode, deactivateCelLineMode, handleCelLineClick, init };

console.log('celLine.js loaded');
