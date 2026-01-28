/**
 * Cut Lines Mode - Vertical line follows cursor for visual cutting guidance
 *
 * When activated:
 * - Shows vertical line from top to bottom of y-axis following mouse
 * - Changes cursor to scissors
 * - Clicking deactivates the mode
 *
 * Emits events instead of calling peer modules directly.
 */

import { chartState } from '../chartState.js';
import { createToast, createConfirmToast, createInfoToast, removeToast, updateToastMessage } from '../util/toaster.js';
import { xPositionToDate, timestampsToXPositions } from '../util/dates.js';
import { icons } from '../util/icons.js';
import { applySvgCursor, restoreCursor } from '../util/cursorIcon.js';
import { eventBus, EVENTS } from '../eventBus.js';

// Cut lines mode state (ephemeral UI state)
var cutLinesState = {
    active: false,
    mouseMoveHandler: null,
    clickHandler: null,
    touchStartHandler: null,
    touchMoveHandler: null,
    touchEndHandler: null,
    verticalLineShape: null,
    lastUpdateTime: 0,
    throttleDelay: 33,
    previousDragMode: null,
    toastElement: null,
    isTouchActive: false
};

/**
 * Activates cut lines mode
 */
function activateCutLinesMode() {
    console.log('Activating cut lines mode');

    const chartDiv = document.getElementById('chart');
    if (!chartDiv) {
        console.error('Chart div not found');
        return;
    }

    if (cutLinesState.active) {
        deactivateCutLinesMode();
        return;
    }

    // Emit event to deactivate other modes
    eventBus.emit(EVENTS.MODE_ALL_DEACTIVATE);

    cutLinesState.active = true;

    cutLinesState.previousDragMode = chartDiv.layout.dragmode;
    Plotly.relayout(chartDiv, { dragmode: false });

    applySvgCursor(chartDiv, icons.otherScissors, {size: 32, hotspotX: 16, hotspotY: 16});

    cutLinesState.mouseMoveHandler = function(event) {
        handleCutLineMouseMove(event, chartDiv);
    };

    cutLinesState.clickHandler = function(event) {
        handleCutLineDrawClick(event, chartDiv);
    };

    cutLinesState.touchStartHandler = function(event) {
        handleCutLineTouchStart(event, chartDiv);
    };

    cutLinesState.touchMoveHandler = function(event) {
        handleCutLineTouchMove(event, chartDiv);
    };

    cutLinesState.touchEndHandler = function(event) {
        handleCutLineTouchEnd(event, chartDiv);
    };

    chartDiv.addEventListener('mousemove', cutLinesState.mouseMoveHandler);
    chartDiv.addEventListener('click', cutLinesState.clickHandler);
    chartDiv.addEventListener('touchstart', cutLinesState.touchStartHandler, { passive: false });
    chartDiv.addEventListener('touchmove', cutLinesState.touchMoveHandler, { passive: false });
    chartDiv.addEventListener('touchend', cutLinesState.touchEndHandler);

    showCutLineToast();

    console.log('Cut lines mode activated');
}

/**
 * Deactivates cut lines mode
 */
function deactivateCutLinesMode() {
    console.log('Deactivating cut lines mode');

    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    cutLinesState.active = false;

    if (cutLinesState.previousDragMode !== null) {
        Plotly.relayout(chartDiv, { dragmode: cutLinesState.previousDragMode });
        cutLinesState.previousDragMode = null;
    }

    restoreCursor(chartDiv);

    if (cutLinesState.mouseMoveHandler) {
        chartDiv.removeEventListener('mousemove', cutLinesState.mouseMoveHandler);
        cutLinesState.mouseMoveHandler = null;
    }

    if (cutLinesState.clickHandler) {
        chartDiv.removeEventListener('click', cutLinesState.clickHandler);
        cutLinesState.clickHandler = null;
    }

    if (cutLinesState.touchStartHandler) {
        chartDiv.removeEventListener('touchstart', cutLinesState.touchStartHandler);
        cutLinesState.touchStartHandler = null;
    }

    if (cutLinesState.touchMoveHandler) {
        chartDiv.removeEventListener('touchmove', cutLinesState.touchMoveHandler);
        cutLinesState.touchMoveHandler = null;
    }

    if (cutLinesState.touchEndHandler) {
        chartDiv.removeEventListener('touchend', cutLinesState.touchEndHandler);
        cutLinesState.touchEndHandler = null;
    }

    removeVerticalLine();
    removeCutLineToast();

    console.log('Cut lines mode deactivated');
}

function handleCutLineMouseMove(event, chartDiv) {
    const now = Date.now();
    if (now - cutLinesState.lastUpdateTime < cutLinesState.throttleDelay) {
        return;
    }
    cutLinesState.lastUpdateTime = now;

    const coords = getPlotCoordinatesForCutLine(event, chartDiv);
    if (!coords) return;

    updateVerticalLine(coords.x);
}

function handleCutLineDrawClick(event, chartDiv) {
    if (event.target.closest('#cut-line-toast')) {
        return;
    }

    const currentShapes = chartDiv.layout.shapes || [];
    const cutLineShape = currentShapes.find(shape => shape.name === 'cutline-guide');

    if (cutLineShape) {
        cutLine(cutLineShape.x0);
    }

    deactivateCutLinesMode();
}

function handleCutLineTouchStart(event, chartDiv) {
    event.preventDefault();

    if (event.touches.length === 1) {
        cutLinesState.isTouchActive = true;
        updateCutLineToastMessage();

        const touch = event.touches[0];
        const coords = getPlotCoordinatesForCutLineTouch(touch, chartDiv);
        if (coords) {
            updateVerticalLine(coords.x);
        }
    }
}

function handleCutLineTouchMove(event, chartDiv) {
    event.preventDefault();

    const now = Date.now();
    if (now - cutLinesState.lastUpdateTime < cutLinesState.throttleDelay) {
        return;
    }
    cutLinesState.lastUpdateTime = now;

    if (event.touches.length === 1) {
        const touch = event.touches[0];
        const coords = getPlotCoordinatesForCutLineTouch(touch, chartDiv);
        if (coords) {
            updateVerticalLine(coords.x);
        }
    }
}

function handleCutLineTouchEnd(event, chartDiv) {
    const changedTouch = event.changedTouches[0];
    const element = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY);

    if (element && element.closest('#cut-line-toast')) {
        cutLinesState.isTouchActive = false;
        updateCutLineToastMessage();
        return;
    }

    const currentShapes = chartDiv.layout.shapes || [];
    const cutLineShape = currentShapes.find(shape => shape.name === 'cutline-guide');

    if (cutLineShape) {
        cutLine(cutLineShape.x0);
    }

    deactivateCutLinesMode();
}

function getPlotCoordinatesForCutLine(event, chartDiv) {
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
    const xRounded = Math.floor(xValue) + 0.5;

    return { x: xRounded, xPixel: xPixel, yPixel: yPixel };
}

function getPlotCoordinatesForCutLineTouch(touch, chartDiv) {
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
    const xRounded = Math.floor(xValue) + 0.5;

    return { x: xRounded, xPixel: xPixel, yPixel: yPixel };
}

function updateVerticalLine(xValue) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    const layout = chartDiv.layout;
    if (!layout || !layout.yaxis) return;

    const yRange = layout.yaxis.range;
    const yMin = Math.pow(10, yRange[0]);
    const yMax = Math.pow(10, yRange[1]);

    const lineShape = {
        type: 'line',
        x0: xValue,
        y0: yMin,
        x1: xValue,
        y1: yMax,
        xref: 'x',
        yref: 'y',
        line: { color: 'gray', width: 1 },
        name: 'cutline-guide'
    };

    const currentShapes = chartDiv.layout.shapes || [];
    const filteredShapes = currentShapes.filter(shape => shape.name !== 'cutline-guide');
    const newShapes = [...filteredShapes, lineShape];

    Plotly.relayout(chartDiv, { shapes: newShapes }).then(() => {
        cutLinesState.verticalLineShape = newShapes.length - 1;
    });
}

function removeVerticalLine() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    const currentShapes = chartDiv.layout.shapes || [];
    const newShapes = currentShapes.filter(shape => shape.name !== 'cutline-guide');

    if (newShapes.length !== currentShapes.length) {
        Plotly.relayout(chartDiv, { shapes: newShapes });
    }

    cutLinesState.verticalLineShape = null;
}

function cutLine(xValue) {
    if (!chartState.startDate) {
        console.error('Cannot cut: chart has no data yet');
        return;
    }

    const xUpper = Math.ceil(xValue);
    const dateUpper = xPositionToDate(xUpper);
    const lineId = Date.now();

    chartState.LineCuts[lineId] = {
        id: lineId,
        date: dateUpper
    };

    // Emit event to refresh chart instead of calling directly
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
}

function showCutLineToast() {
    createInfoToast({
        id: 'cut-line-toast',
        message: 'Click to cut',
        messageId: 'cut-line-toast-message',
        onCancel: () => {
            console.log('Cancel button clicked');
            deactivateCutLinesMode();
        },
        stateRef: {
            state: cutLinesState,
            key: 'toastElement'
        }
    });
}

function updateCutLineToastMessage() {
    updateToastMessage('cut-line-toast-message',
        cutLinesState.isTouchActive ? 'Release to cut' : 'Click to cut');
}

function removeCutLineToast() {
    removeToast('cut-line-toast');
    cutLinesState.toastElement = null;
}

/**
 * Handles click events on cut lines (called via event subscription)
 * @param {string} lineName - Name of the clicked line
 */
function handleCutLineClick(lineName) {
    console.log(`[CUT LINE CLICK] Cut line clicked: ${lineName}`);

    const lineId = parseInt(lineName.split('-')[1]);
    if (isNaN(lineId)) {
        console.error(`[CUT LINE CLICK] Invalid lineName format: ${lineName}`);
        return;
    }

    createToast({
        id: 'cut-line-click-toaster',
        message: 'Cut line',
        buttons: [
            {
                label: 'Remove',
                onClick: () => {
                    console.log(`[CUT LINE CLICK] Remove clicked for ${lineName}`);

                    if (chartState.LineCuts && chartState.LineCuts[lineId]) {
                        eventBus.emit(EVENTS.LINE_REMOVE_CLICKABLE, { lineName: `cut-${lineId}` });
                        delete chartState.LineCuts[lineId];
                        console.log(`[CUT LINE CLICK] Removed cut with ID ${lineId}`);
                        eventBus.emit(EVENTS.DATA_CHART_REFRESH);
                    } else {
                        console.error(`[CUT LINE CLICK] Invalid cut ID: ${lineId}`);
                    }

                    removeToast('cut-line-click-toaster');
                },
                type: 'secondary'
            }
        ],
        layout: 'horizontal',
        duration: 3000
    });
}

/**
 * Initialize subscriptions for this module
 */
function init() {
    // Subscribe to line click events
    eventBus.subscribe(EVENTS.LINE_CUT_CLICKED, (data) => {
        handleCutLineClick(data.lineName);
    }, true);

    // Subscribe to mode activation events from navigation
    eventBus.subscribe(EVENTS.MODE_CUT_ACTIVATE, () => {
        activateCutLinesMode();
    });

    // Subscribe to mode deactivation events
    eventBus.subscribe(EVENTS.MODE_ALL_DEACTIVATE, () => {
        if (cutLinesState.active) {
            deactivateCutLinesMode();
        }
    });
}

export { activateCutLinesMode, deactivateCutLinesMode, handleCutLineClick, init };

console.log('cutLines.js loaded');
