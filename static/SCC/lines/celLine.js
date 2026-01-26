/**
 * Cel Line Mode - Drag to select x1 to x2 range for placing change lines
 *
 * When activated:
 * - Shows celeration cursor icon
 * - User holds down mouse/tap and drags to the right
 * - Creates a semi-transparent gray shaded area during drag
 * - On release, shows toast menu to confirm or cancel
 *
 * Emits events instead of calling peer modules directly.
 */

import { createConfirmToast, removeToast, createToast } from '../util/toaster.js';
import { icons } from '../util/icons.js';
import { applySvgCursor, restoreCursor } from '../util/cursorIcon.js';
import { chartState } from '../chartState.js';
import { xPositionToDate } from '../util/dates.js';
import { removeLine } from './allLines.js';
import { theilSenFit } from '../util/theilSen.js';
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
    x1: null,
    x2: null,
    shadeShape: null,
    previousDragMode: null,
    toastElement: null,
    previousLegendShow: null,
    awaitingSeriesSelection: false,
    seriesSelectionToast: null
};

/**
 * Activates cel line mode
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

    celLineState.previousDragMode = chartDiv.layout.dragmode;
    Plotly.relayout(chartDiv, { dragmode: false });

    applySvgCursor(chartDiv, icons.otherCeleration, {size: 32, hotspotX: 2, hotspotY: 16});

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

    chartDiv.addEventListener('mousedown', celLineState.mouseDownHandler);
    chartDiv.addEventListener('touchstart', celLineState.touchStartHandler, { passive: false });

    console.log('Cel line mode activated');
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

    removeShadeRectangle();
    removeCelLineToast();

    celLineState.x1 = null;
    celLineState.x2 = null;
    celLineState.shadeShape = null;

    console.log('Cel line mode deactivated');
}

function handleCelLineMouseDown(event, chartDiv) {
    if (event.target.closest('#cel-line-toast')) {
        return;
    }

    if (celLineState.awaitingSeriesSelection && event.target.closest('#custom-legend')) {
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

    const coords = getPlotCoordinatesForCelLine(event, chartDiv);
    if (!coords) return;

    if (coords.x > celLineState.x1) {
        celLineState.x2 = coords.x;
        updateShadeRectangle();
    }
}

function handleCelLineMouseUp(event, chartDiv) {
    if (!celLineState.isDragging) return;

    celLineState.isDragging = false;

    document.removeEventListener('mousemove', celLineState.mouseMoveHandler);
    document.removeEventListener('mouseup', celLineState.mouseUpHandler);

    if (celLineState.x2 && celLineState.x2 > celLineState.x1) {
        showCelLineToast();
    } else {
        removeShadeRectangle();
        celLineState.x1 = null;
        celLineState.x2 = null;
    }
}

function handleCelLineTouchStart(event, chartDiv) {
    event.preventDefault();

    if (event.target.closest('#cel-line-toast')) {
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

    if (event.touches.length === 1) {
        const touch = event.touches[0];
        const coords = getPlotCoordinatesForCelLineTouch(touch, chartDiv);
        if (!coords) return;

        if (coords.x > celLineState.x1) {
            celLineState.x2 = coords.x;
            updateShadeRectangle();
        }
    }
}

function handleCelLineTouchEnd(event, chartDiv) {
    if (!celLineState.isDragging) return;

    celLineState.isDragging = false;

    document.removeEventListener('touchmove', celLineState.touchMoveHandler);
    document.removeEventListener('touchend', celLineState.touchEndHandler);

    const changedTouch = event.changedTouches[0];
    const element = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY);

    if (element && element.closest('#cel-line-toast')) {
        return;
    }

    if (celLineState.x2 && celLineState.x2 > celLineState.x1) {
        showCelLineToast();
    } else {
        removeShadeRectangle();
        celLineState.x1 = null;
        celLineState.x2 = null;
    }
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

function showCelLineToast() {
    createConfirmToast({
        id: 'cel-line-toast',
        message: 'Place change line?',
        onYes: () => {
            removeCelLineToast();
            showSeriesSelectionMode();
        },
        onNo: () => {
            handleCelLineCancel();
        },
        noLabel: 'Cancel',
        stateRef: {
            state: celLineState,
            key: 'toastElement'
        }
    });
}

function removeCelLineToast() {
    removeToast('cel-line-toast');
    celLineState.toastElement = null;
}

function showSeriesSelectionMode() {
    celLineState.awaitingSeriesSelection = true;

    celLineState.previousLegendShow = chartState.legend.show;
    chartState.legend.show = true;
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);

    celLineState.seriesSelectionToast = createToast({
        id: 'cel-series-selection-toast',
        message: 'Step 2: Click a data series in the legend',
        buttons: [
            {
                label: 'Cancel',
                onClick: () => {
                    handleCelLineCancel();
                },
                type: 'secondary'
            }
        ],
        layout: 'horizontal',
        position: 'top-left'
    });

    setupLegendClickHandler();
}

function setupLegendClickHandler() {
    const legendItems = document.querySelectorAll('.legend-item');

    legendItems.forEach(item => {
        const handler = function(event) {
            if (celLineState.awaitingSeriesSelection) {
                event.stopPropagation();
                event.preventDefault();

                const seriesKey = item.dataset.seriesKey;
                handleSeriesSelection(seriesKey);
            }
        };

        item.celLineClickHandler = handler;
        item.addEventListener('click', handler, true);
    });
}

function handleSeriesSelection(seriesKey) {
    const baseKey = seriesKey.split('_')[0];

    const data = getDataInRangeForSeries(celLineState.x1, celLineState.x2, baseKey);

    if (!data || data.x.length < 5) {
        alert(`Need at least 5 data points. Found ${data ? data.x.length : 0}.`);
        handleCelLineCancel();
        return;
    }

    handleCelLineConfirm(data, baseKey);
}

function cleanupSeriesSelectionMode() {
    celLineState.awaitingSeriesSelection = false;

    removeToast('toast-top-left');
    celLineState.seriesSelectionToast = null;

    if (celLineState.previousLegendShow !== null) {
        chartState.legend.show = celLineState.previousLegendShow;
        eventBus.emit(EVENTS.UI_LEGEND_RENDER);
        celLineState.previousLegendShow = null;
    }

    const legendItems = document.querySelectorAll('.legend-item');
    legendItems.forEach(item => {
        if (item.celLineClickHandler) {
            item.removeEventListener('click', item.celLineClickHandler, true);
            delete item.celLineClickHandler;
        }
    });
}

function getDataInRangeForSeries(x1, x2, baseKey) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartDiv.data) {
        return null;
    }

    const seriesNameMap = {
        'correct': 'corrects',
        'incorrect': 'errors',
        'timing': 'timing',
        'misc1': 'misc1',
        'misc2': 'misc2'
    };

    const targetSeriesName = seriesNameMap[baseKey];
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

    const fit = theilSenFit(filteredX, filteredLogY);

    if (!fit) {
        alert('Could not calculate trend line.');
        handleCelLineCancel();
        return;
    }

    const firstX = filteredX[0];
    const lastX = filteredX[filteredX.length - 1];

    const logY1 = fit.slope * firstX + fit.intercept;
    const logY2 = fit.slope * lastX + fit.intercept;
    const y1_display = Math.pow(10, logY1);
    const y2_display = Math.pow(10, logY2);

    const celerationMultiplier = Math.pow(10, fit.slope * 7);
    const celeration = celerationMultiplier.toFixed(2);
    const labelText = `×${celeration}`;

    const lineId = Date.now();
    const lineName = `cel-${lineId}`;

    const trendStyle = chartState.lineStyles.trend[baseKey] || chartState.lineStyles.trend.timing;

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
        shapes: [...currentShapes, lineShape],
        annotations: [...currentAnnotations, annotation]
    });

    const metadata = {
        id: lineId,
        seriesKey: baseKey,
        date1: xPositionToDate(firstX),
        y1: y1_display,
        date2: xPositionToDate(lastX),
        y2: y2_display,
        slope: fit.slope,
        intercept: fit.intercept,
        celeration: celeration,
        text: labelText,
        shapeIndices: [shapeIndex],
        annotationIndex: annotationIndex
    };

    chartState.CelLines[lineId] = metadata;

    removeShadeRectangle();
    cleanupSeriesSelectionMode();
    deactivateCelLineMode();
}

function handleCelLineCancel() {
    removeShadeRectangle();
    removeCelLineToast();
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

    createToast({
        id: 'cel-line-click-toaster',
        message: `Celeration: ${metadata.text}`,
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

    Object.values(chartState.CelLines).forEach(metadata => {
        const lineName = `cel-${metadata.id}`;

        const x1 = Math.floor((metadata.date1 - chartState.startDate) / (1000 * 60 * 60 * 24));
        const x2 = Math.floor((metadata.date2 - chartState.startDate) / (1000 * 60 * 60 * 24));

        const trendStyle = chartState.lineStyles.trend[metadata.seriesKey] || chartState.lineStyles.trend.timing;

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
