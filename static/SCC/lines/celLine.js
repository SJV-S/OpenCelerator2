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
import { CORRECTS, ERRORS, TIMING } from '../config.js';
import { xPositionToDate, dateToXPosition } from '../util/dates.js';
import { fit, FIT_METHODS, BOUNCE_ENVELOPES, DEFAULT_FIT_METHOD, DEFAULT_BOUNCE_ENVELOPE, calculateBounceBounds, calculateBounceLines, formatCelerationLabel } from '../util/fit_lines.js';
import { eventBus, EVENTS } from '../eventBus.js';

/**
 * Get the cel line color for a data series.
 * Simple fixed colors: green for corrects, red for errors, orange for timing, black for misc
 * @param {string} seriesKey - The series key (corrects, errors, timing, misc1, etc.)
 * @returns {string} The color to use for the cel line
 */
function getCelLineColor(seriesKey) {
    if (seriesKey === CORRECTS) return 'green';
    if (seriesKey === ERRORS) return 'red';
    if (seriesKey === TIMING) return 'orange';
    return 'black'; // misc series
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

    // Get trend style for width/dash
    const trendStyle = metadata.seriesKey.startsWith('misc')
        ? (chartState.lineStyles.trend.misc[metadata.seriesKey] || chartState.lineStyles.trend.timing)
        : (chartState.lineStyles.trend[metadata.seriesKey] || chartState.lineStyles.trend.timing);

    // Get cel line color based on series
    const celLineColor = getCelLineColor(metadata.seriesKey);

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
            width: trendStyle.width,
            dash: trendStyle.dash
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
                color: celLineColor,
                width: 1,
                dash: 'dot'
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
                color: celLineColor,
                width: 1,
                dash: 'dot'
            }
        });
    }

    // Annotation (invisible text with hover label)
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
            bgcolor: celLineColor,
            font: { color: 'white', size: 14 }
        }
    };

    return { shapes, annotation };
}

/**
 * Activates cel line mode
 * Step 1: Show toast with buttons for available data series
 */
function activateCelLineMode() {

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
        layout: 'vertical'
    });

}

/**
 * Get the first aggregation config for a series (handles cases where 'raw' may not exist)
 */
function getFirstConfig(seriesId) {
    let configs;

    if (seriesId && seriesId.startsWith('misc')) {
        configs = chartState.traceStyles.misc?.[seriesId];
    } else if (seriesId) {
        configs = chartState.traceStyles?.[seriesId];
    }

    if (!configs) return null;
    const firstAggType = Object.keys(configs)[0];
    return firstAggType ? configs[firstAggType] : null;
}

/**
 * Check if a series has any visible aggregation type.
 * Returns false if ALL visibility entries for this series are explicitly false.
 * @param {string} seriesKey - Base series key (corrects, errors, timing, misc1, etc.)
 * @returns {boolean} True if at least one aggregation type is visible
 */
function isSeriesVisible(seriesKey) {
    const visibility = chartState.seriesVisibility;
    const prefix = seriesKey + '_';
    const entries = Object.entries(visibility).filter(([key]) => key.startsWith(prefix));

    // If no visibility entries exist yet, treat as visible
    if (entries.length === 0) return true;

    // Visible if any aggregation type is not explicitly false
    return entries.some(([, visible]) => visible !== false);
}

/**
 * Get buttons for available data series
 */
function getAvailableSeriesButtons() {
    const buttons = [];

    // Check fixed series
    if (chartState.series.corrects && chartState.series.corrects.some(v => v !== null) && isSeriesVisible(CORRECTS)) {
        const config = getFirstConfig(CORRECTS);
        buttons.push({
            label: config?.seriesName || 'Corrects',
            onClick: () => selectSeriesAndEnableDrag(CORRECTS),
            type: 'primary'
        });
    }

    if (chartState.series.errors && chartState.series.errors.some(v => v !== null) && isSeriesVisible(ERRORS)) {
        const config = getFirstConfig(ERRORS);
        buttons.push({
            label: config?.seriesName || 'Errors',
            onClick: () => selectSeriesAndEnableDrag(ERRORS),
            type: 'primary'
        });
    }

    if (chartState.series.timing && chartState.series.timing.some(v => v !== null) && isSeriesVisible(TIMING)) {
        const config = getFirstConfig(TIMING);
        buttons.push({
            label: config?.seriesName || 'Timing',
            onClick: () => selectSeriesAndEnableDrag(TIMING),
            type: 'primary'
        });
    }

    // Check misc series
    Object.entries(chartState.series.misc).forEach(([miscId, data]) => {
        if (data && data.some(v => v !== null) && isSeriesVisible(miscId)) {
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
    const displayName = getFirstConfig(seriesKey)?.seriesName || seriesKey;
    console.log('[CEL DEBUG] SERIES SELECTED: "' + displayName + '" (id=' + seriesKey + ')');
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

    const coords = getPlotCoordinatesForCelLine(event, chartDiv);
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

    const coords = getPlotCoordinatesForCelLine(event, chartDiv);
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
        const coords = getPlotCoordinatesForCelLineTouch(touch, chartDiv);
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
        const coords = getPlotCoordinatesForCelLineTouch(touch, chartDiv);
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

    // Snap pixel to integer x using Plotly's axis mapping (matches crosshair behavior)
    const xaxis = chartDiv._fullLayout.xaxis;
    const xSnappedPixel = xaxis._offset + xaxis.l2p(xRounded);

    return { x: xRounded, xPixel: xSnappedPixel, yPixel: yPixel };
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

    // Snap pixel to integer x using Plotly's axis mapping (matches crosshair behavior)
    const xaxis = chartDiv._fullLayout.xaxis;
    const xSnappedPixel = xaxis._offset + xaxis.l2p(xRounded);

    return { x: xRounded, xPixel: xSnappedPixel, yPixel: yPixel };
}

// ============================================
// DOM Overlay Functions (fast, no Plotly calls)
// ============================================

/**
 * Get or create the overlay container for cel line preview elements
 */
function getOrCreateOverlayContainer() {
    const chartDiv = document.getElementById('chart');
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
    const chartDiv = document.getElementById('chart');
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
    const chartDiv = document.getElementById('chart');
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

// ============================================
// Plotly-based functions (kept for compatibility)
// ============================================

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
        celLineState.toastElement.remove();
        celLineState.toastElement = null;
    }
    if (celLineState.seriesSelectionToast) {
        celLineState.seriesSelectionToast.remove();
        celLineState.seriesSelectionToast = null;
    }
}

function getDataInRangeForSeries(x1, x2, baseKey) {
    const chartDiv = document.getElementById('chart');

    if (!chartDiv || !chartDiv.data) {
        return null;
    }

    // Get display name for the target series
    const targetDisplayName = getFirstConfig(baseKey)?.seriesName || baseKey;

    // Build map of trace seriesNames to display names
    const uniqueSeriesIds = [...new Set(chartDiv.data.filter(t => t.meta?.seriesName).map(t => t.meta.seriesName))];
    const seriesWithNames = uniqueSeriesIds
        .filter(id => !id.includes('FloorShadow'))
        .map(id => {
            const name = getFirstConfig(id)?.seriesName || id;
            return name + ' (' + id + ')';
        });

    console.log('[CEL DEBUG] TRACE MATCHING: Looking for "' + targetDisplayName + '" (' + baseKey + ')');
    console.log('[CEL DEBUG] Available series in chart: ' + seriesWithNames.join(', '));

    // baseKey is now consistent: 'corrects', 'errors', 'timing', or misc ID
    const targetSeriesName = baseKey;
    const xValues = [];
    const yValues = [];
    let matchingTraceCount = 0;

    for (let traceIdx = 0; traceIdx < chartDiv.data.length; traceIdx++) {
        const trace = chartDiv.data[traceIdx];

        if (!trace.x || !trace.y || !trace.meta) {
            continue;
        }

        if (trace.meta.seriesName !== targetSeriesName) {
            continue;
        }

        matchingTraceCount++;

        for (let i = 0; i < trace.x.length; i++) {
            const x = trace.x[i];
            const y = trace.y[i];

            if (x >= x1 && x <= x2 && y !== null && y !== undefined && !isNaN(y)) {
                xValues.push(x);
                yValues.push(y);
            }
        }
    }

    console.log('[CEL DEBUG] RESULT: Found ' + xValues.length + ' points from ' + matchingTraceCount + ' trace(s)');

    return { x: xValues, y: yValues };
}

function handleCelLineConfirm(data, baseKey) {
    const chartDiv = document.getElementById('chart');
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
    const date1Str = date1.getFullYear() + '-' + String(date1.getMonth() + 1).padStart(2, '0') + '-' + String(date1.getDate()).padStart(2, '0');
    const date2Str = date2.getFullYear() + '-' + String(date2.getMonth() + 1).padStart(2, '0') + '-' + String(date2.getDate()).padStart(2, '0');

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
        text: labelText,
        shapeIndices: [],
        annotationIndex: null
    };

    // Use builder to get shapes and annotation
    const elements = buildCelLineElements(metadata, chartDiv);

    const currentShapes = chartDiv.layout.shapes || [];
    const currentAnnotations = chartDiv.layout.annotations || [];
    const shapeIndex = currentShapes.length;
    const annotationIndex = currentAnnotations.length;

    Plotly.relayout(chartDiv, {
        shapes: [...currentShapes, ...elements.shapes],
        annotations: [...currentAnnotations, elements.annotation]
    }).catch(err => {
        console.error('[CEL DEBUG] Plotly.relayout FAILED:', err);
    });

    // Update shape indices in metadata
    metadata.shapeIndices = elements.shapes.map((_, i) => shapeIndex + i);
    metadata.annotationIndex = annotationIndex;

    const displayName = getFirstConfig(baseKey)?.seriesName || baseKey;
    console.log('[CEL DEBUG] LINE CREATED: "' + displayName + '" x1=' + firstX + ' x2=' + lastX + ' as ' + date1Str);

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
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    const currentShapes = chartDiv.layout.shapes || [];
    const currentAnnotations = chartDiv.layout.annotations || [];

    const nonCelShapes = currentShapes.filter(s => !s.name || !s.name.startsWith('cel-'));
    const nonCelAnnotations = currentAnnotations.filter(a => !a.name || !a.name.startsWith('cel-'));

    const celShapes = [];
    const celAnnotations = [];

    // Rebuild shapes and annotations from chartState using the builder
    const isVisible = chartState.lineVisibility.change;
    Object.values(chartState.CelLines).forEach(entry => {
        // Skip the settings object
        if (entry === chartState.CelLines.settings) return;

        const metadata = entry;

        const displayName = getFirstConfig(metadata.seriesKey)?.seriesName || metadata.seriesKey;
        console.log('[CEL DEBUG] REDRAW: "' + displayName + '" date1=' + metadata.date1);

        const elements = buildCelLineElements(metadata, chartDiv);

        // Apply saved visibility state to rebuilt elements
        if (!isVisible) {
            elements.shapes.forEach(s => s.visible = false);
            elements.annotation.visible = false;
        }

        // Add shapes
        celShapes.push(...elements.shapes);

        // Add annotation
        celAnnotations.push(elements.annotation);
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

export { activateCelLineMode, deactivateCelLineMode, init };

