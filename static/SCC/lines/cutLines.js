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
import { createToast, createConfirmToast, createInfoToast, updateToastMessage } from '../ui/toaster.js';
import { xPositionToDate, timestampsToXPositions } from '../util/dates.js';
import { icons, applySvgCursor, restoreCursor } from '../ui/icons.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { relayout } from '../util/plotlyWrapper.js';
import { getPixelCoordinates } from '../util/plotCoordinates.js';
import { getChartDiv } from '../util/dom.js';

// Cut lines mode state (ephemeral UI state)
var cutLinesState = {
    active: false,
    mouseMoveHandler: null,
    clickHandler: null,
    touchStartHandler: null,
    touchMoveHandler: null,
    touchEndHandler: null,
    currentX: null,  // Current x position for cut (replaces reading from Plotly shape)
    previousDragMode: null,
    toastElement: null,
    isTouchActive: false
};

/**
 * Activates cut lines mode
 */
function activateCutLinesMode() {
    console.log('Activating cut lines mode');

    const chartDiv = getChartDiv();
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
    relayout(chartDiv, { dragmode: false });

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

    const chartDiv = getChartDiv();
    if (!chartDiv) return;

    cutLinesState.active = false;

    if (cutLinesState.previousDragMode !== null) {
        relayout(chartDiv, { dragmode: cutLinesState.previousDragMode });
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

    removeCutLineOverlay();
    removeCutLineToast();
    cutLinesState.currentX = null;

    console.log('Cut lines mode deactivated');
}

function handleCutLineMouseMove(event, chartDiv) {
    const coords = getPixelCoordinates(event, chartDiv, { halfStep: true });
    if (!coords) return;

    // Store current x for click handler
    cutLinesState.currentX = coords.x;
    // Use fast DOM overlay instead of Plotly
    updateGuideLineOverlay(coords.xPixel);
}

function handleCutLineDrawClick(event, chartDiv) {
    if (event.target.closest('#cut-line-toast')) {
        return;
    }

    // Read position from state (set by mousemove handler)
    if (cutLinesState.currentX !== null) {
        cutLine(cutLinesState.currentX);
    }

    deactivateCutLinesMode();
}

function handleCutLineTouchStart(event, chartDiv) {
    event.preventDefault();

    if (event.touches.length === 1) {
        cutLinesState.isTouchActive = true;
        updateCutLineToastMessage();

        const touch = event.touches[0];
        const coords = getPixelCoordinates(touch, chartDiv, { halfStep: true });
        if (coords) {
            cutLinesState.currentX = coords.x;
            updateGuideLineOverlay(coords.xPixel);
        }
    }
}

function handleCutLineTouchMove(event, chartDiv) {
    event.preventDefault();

    if (event.touches.length === 1) {
        const touch = event.touches[0];
        const coords = getPixelCoordinates(touch, chartDiv, { halfStep: true });
        if (coords) {
            cutLinesState.currentX = coords.x;
            updateGuideLineOverlay(coords.xPixel);
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

    // Read position from state (set by touchmove handler)
    if (cutLinesState.currentX !== null) {
        cutLine(cutLinesState.currentX);
    }

    deactivateCutLinesMode();
}

// ============================================
// DOM Overlay Functions (fast, no Plotly calls)
// ============================================

/**
 * Get or create the overlay container for cut line preview
 */
function getOrCreateCutLineOverlay() {
    const chartDiv = getChartDiv();
    if (!chartDiv) return null;

    let container = document.getElementById('cutline-overlay');
    if (!container) {
        container = document.createElement('div');
        container.id = 'cutline-overlay';
        container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 50;
        `;

        // Vertical guide line
        const guide = document.createElement('div');
        guide.id = 'cutline-guide-overlay';
        guide.style.cssText = `
            position: absolute;
            width: 1px;
            background: gray;
            display: none;
        `;

        container.appendChild(guide);
        chartDiv.appendChild(container);
    }

    return {
        container,
        guide: document.getElementById('cutline-guide-overlay')
    };
}

/**
 * Update the DOM guide line overlay position (no Plotly calls)
 */
function updateGuideLineOverlay(xPixel) {
    const chartDiv = getChartDiv();
    if (!chartDiv?.layout) return;

    const overlays = getOrCreateCutLineOverlay();
    if (!overlays) return;

    const layout = chartDiv.layout;
    const rect = chartDiv.getBoundingClientRect();
    const plotTop = layout.margin.t;
    const plotBottom = rect.height - layout.margin.b;
    const plotHeight = plotBottom - plotTop;

    overlays.guide.style.left = `${xPixel}px`;
    overlays.guide.style.top = `${plotTop}px`;
    overlays.guide.style.height = `${plotHeight}px`;
    overlays.guide.style.display = 'block';
}

/**
 * Remove the DOM overlay
 */
function removeCutLineOverlay() {
    const container = document.getElementById('cutline-overlay');
    if (container) {
        container.remove();
    }
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

    // Emit save event to trigger auto-save
    eventBus.emit(EVENTS.LINE_CUT_SAVED, { id: lineId });

    // Emit event to refresh chart instead of calling directly
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
}

function showCutLineToast() {
    cutLinesState.toastElement = createInfoToast({
        message: 'Click to cut',
        onCancel: () => {
            console.log('Cancel button clicked');
            deactivateCutLinesMode();
        }
    });
}

function updateCutLineToastMessage() {
    updateToastMessage(cutLinesState.toastElement,
        cutLinesState.isTouchActive ? 'Release to cut' : 'Click to cut');
}

function removeCutLineToast() {
    if (cutLinesState.toastElement) {
        cutLinesState.toastElement.remove();
        cutLinesState.toastElement = null;
    }
}

/**
 * Initialize subscriptions for this module
 */
function init() {
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

export { activateCutLinesMode, deactivateCutLinesMode, init };

console.log('cutLines.js loaded');
