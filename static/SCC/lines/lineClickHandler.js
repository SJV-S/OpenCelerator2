/**
 * Click Handler for Chart Lines
 *
 * This module handles all line click interactions:
 * - Creates clickable marker overlays when edit mode is enabled
 * - Handles click events and shows removal toasts
 * - Removes lines when user confirms
 *
 * NOTE: Hover labels on lines are NOT handled here. They live in
 * lineHover.js, which creates its own invisible scatter traces with
 * hovertext along every line (main + bounce). Any changes to what
 * appears when the user hovers over a line must be made there.
 */

import { chartState } from '../chartState.js';
import { WINDOW_UNITS } from '../config.js';
import { dateToXPosition } from '../util/dates.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { createToast } from '../ui/toaster.js';
import { removeLine } from './allLines.js';
import { showCelLineEditor } from '../ui/celLineEditor.js';
import { showPhaseLineEditor } from '../ui/phaseLineEditor.js';
import { showAimLineEditor } from '../ui/aimLineEditor.js';
import { interpolateLinePoints } from '../util/lineInterpolation.js';
import { FIT_METHODS, evaluatePowerLaw } from '../util/fit_lines.js';
import { getChartDiv } from '../util/dom.js';
import { relayout, addTraces, deleteTraces } from '../util/plotlyWrapper.js';

// Module-level state
let clickHandlerAttached = false;

// Per-category edit state
const categoryEditState = {
    phase: false,
    aim: false,
    cut: false,
    cel: false
};

// Delay between drawing individual line edit traces (ms)
const TRACE_DRAW_DELAY = 16; // ~1 frame at 60fps

/**
 * Initialize click event listener on the chart
 * Call this after chart is rendered with Plotly.newPlot()
 */
function setupClickHandler() {
    if (clickHandlerAttached) return;

    const chartDiv = getChartDiv();

    // Handle CHART_CLICKED for non-line clicks
    chartDiv.addEventListener('click', function(e) {
        const xaxis = chartDiv._fullLayout?.xaxis;
        const yaxis = chartDiv._fullLayout?.yaxis;
        if (!xaxis || !yaxis) return;

        const rect = chartDiv.getBoundingClientRect();
        const pixelX = e.clientX - rect.left;
        const xData = xaxis.p2d(pixelX - xaxis._offset);

        // Only emit CHART_CLICKED if within visible x-range
        if (xData >= xaxis.range[0] && xData <= xaxis.range[1]) {
            eventBus.emit(EVENTS.CHART_CLICKED, { x: xData });
        }
    });

    // Handle clickable line clicks via Plotly's trace detection
    chartDiv.on('plotly_click', function(eventData) {
        const points = eventData.points;
        if (points.length === 0) return;

        for (const point of points) {
            const meta = point.data.meta;
            if (meta && meta.type === 'clickableLine') {
                handleLineClick(meta.lineName);
                return;
            }
        }
    });

    clickHandlerAttached = true;
}

/**
 * Handle a line click - show toast with info and remove button
 * @param {string} lineName - Name of the clicked line (e.g., "phase-123", "cel-456")
 */
function handleLineClick(lineName) {
    const [category, idStr] = lineName.split('-');
    const lineId = parseInt(idStr);

    if (isNaN(lineId)) {
        console.error(`Invalid lineName format: ${lineName}`);
        return;
    }

    // Map category to chartState property and display info
    const lineTypeMap = {
        'phase': { stateKey: 'PhaseLines', label: 'Event marker' },
        'aim': { stateKey: 'AimLines', label: 'Count marker' },
        'cel': { stateKey: 'CelLines', label: null }, // Dynamic label from metadata
        'cut': { stateKey: 'LineCuts', label: 'Cut line' }
    };

    const lineType = lineTypeMap[category];
    if (!lineType) {
        console.warn(`Unknown line category: ${category}`);
        return;
    }

    // Build the toast message
    let message = lineType.label;

    // Cel lines have dynamic label from metadata
    if (category === 'cel') {
        const metadata = chartState.CelLines[lineId];
        if (metadata) {
            message = `Celeration: ${metadata.text}`;
            if (metadata.fitMethod) {
                message += ` (${metadata.fitMethod}`;
                if (metadata.forecast && metadata.forecast > 0) {
                    const abbr = WINDOW_UNITS[chartState.chartType]?.abbrev || 'd';
                    message += `, +${metadata.forecast}${abbr}`;
                }
                message += ')';
            }
        } else {
            message = 'Celeration line';
        }
    }

    // Build toast buttons
    const buttons = [];

    // Edit button for per-line style editing
    if (category === 'phase') {
        buttons.push({
            label: 'Edit',
            onClick: () => { showPhaseLineEditor(lineId); },
            type: 'secondary'
        });
    } else if (category === 'aim') {
        buttons.push({
            label: 'Edit',
            onClick: () => { showAimLineEditor(lineId); },
            type: 'secondary'
        });
    } else if (category === 'cel') {
        buttons.push({
            label: 'Edit',
            onClick: () => { showCelLineEditor(lineId); },
            type: 'secondary'
        });
    }

    buttons.push({
        label: 'Remove',
        onClick: () => {
            removeLine(lineType.stateKey, lineId);
        },
        type: 'secondary'
    });

    // Show toast with action buttons
    createToast({
        message: message,
        buttons: buttons,
        layout: 'horizontal',
        duration: 3000
    });
}

/**
 * Make a line clickable by overlaying marker traces
 * @param {Object} lineData - { lineName, points: Array<{x, y}> }
 */
function makeLineClickable(lineData) {
    setupClickHandler();
    const chartDiv = getChartDiv();
    const traces = lineData.points.map(segment => ({
        x: segment.x,
        y: segment.y,
        mode: 'markers',
        marker: { color: 'rgba(255,0,0,0.5)', size: 15, symbol: 'square', line: { width: 0 } },
        hoverinfo: 'none',
        showlegend: false,
        meta: { type: 'clickableLine', lineName: lineData.lineName }
    }));
    return addTraces(chartDiv, traces);
}

/**
 * Remove clickability from a line
 * @param {string} lineName - Name of the line to remove
 */
function removeLineClickable(lineName) {
    const chartDiv = getChartDiv();
    const indices = [];
    chartDiv.data.forEach((trace, i) => {
        if (trace.meta?.type === 'clickableLine') {
            if (trace.meta.lineName === lineName) indices.push(i);
        }
    });
    if (indices.length > 0) {
        deleteTraces(chartDiv, indices.sort((a, b) => b - a));
    }
}

/**
 * Helper to add a delay between operations
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sets clickability for a specific category of lines
 * @param {string} category - 'phase', 'aim', 'cut', or 'cel'
 * @param {boolean} makeClickable - If true, make lines clickable; if false, remove
 */
function setLineCategoryClickability(category, makeClickable) {
    const chartDiv = getChartDiv();
    if (!chartDiv || !chartDiv._fullLayout) {
        console.warn('Chart not initialized');
        return;
    }

    categoryEditState[category] = makeClickable;

    const yaxis = chartDiv._fullLayout.yaxis;
    const isLogY = yaxis.type === 'log';
    const visibleYMin = yaxis.range[0];
    const visibleYMax = yaxis.range[1];

    let yBottom, yTop;
    if (isLogY) {
        yBottom = Math.pow(10, visibleYMin);
        yTop = Math.pow(10, visibleYMax);
    } else {
        yBottom = visibleYMin;
        yTop = visibleYMax;
    }

    if (makeClickable) {
        // Count objects to determine if we need delays
        let objectCount = 0;
        if (category === 'phase' && chartState.PhaseLines) {
            objectCount = Object.keys(chartState.PhaseLines).length;
        } else if (category === 'aim' && chartState.AimLines) {
            objectCount = Object.keys(chartState.AimLines).length;
        } else if (category === 'cel' && chartState.CelLines) {
            objectCount = Object.values(chartState.CelLines).filter(l => l.id).length;
        } else if (category === 'cut' && chartState.LineCuts) {
            objectCount = Object.keys(chartState.LineCuts).length;
        }
        const useDelay = objectCount > 5;

        let clickablePromise = Promise.resolve();

        if (category === 'phase' && chartState.PhaseLines) {
            Object.values(chartState.PhaseLines).forEach(phaseLine => {
                clickablePromise = clickablePromise
                    .then(() => useDelay ? delay(TRACE_DRAW_DELAY) : Promise.resolve())
                    .then(() => {
                        const verticalX = dateToXPosition(phaseLine.verticalLineDate);
                        const horizontalEndX = dateToXPosition(phaseLine.horizontalEndDate);

                        const points = [];
                        let verticalPoints;
                        if (phaseLine.direction === 'top') {
                            verticalPoints = interpolateLinePoints(verticalX, yBottom, verticalX, phaseLine.verticalLineY, isLogY);
                        } else {
                            verticalPoints = interpolateLinePoints(verticalX, yTop, verticalX, phaseLine.verticalLineY, isLogY);
                        }
                        points.push(verticalPoints);

                        const horizontalPoints = interpolateLinePoints(verticalX, phaseLine.verticalLineY, horizontalEndX, phaseLine.verticalLineY, isLogY);
                        points.push(horizontalPoints);

                        return makeLineClickable({
                            lineName: `phase-${phaseLine.id}`,
                            points: points
                        });
                    });
            });
        }

        if (category === 'aim' && chartState.AimLines) {
            Object.values(chartState.AimLines).forEach(aimLine => {
                clickablePromise = clickablePromise
                    .then(() => useDelay ? delay(TRACE_DRAW_DELAY) : Promise.resolve())
                    .then(() => {
                        const x1 = dateToXPosition(aimLine.date1);
                        const x2 = dateToXPosition(aimLine.date2);

                        const points = [interpolateLinePoints(x1, aimLine.y1, x2, aimLine.y2, isLogY)];

                        return makeLineClickable({
                            lineName: `aim-${aimLine.id}`,
                            points: points
                        });
                    });
            });
        }

        if (category === 'cel' && chartState.CelLines) {
            Object.values(chartState.CelLines).forEach(celLine => {
                // Skip the settings object (it doesn't have an id property)
                if (!celLine.id) return;

                // Skip cel lines whose fitted aggregation is hidden
                if (celLine.seriesKey) {
                    const aggVisible = chartState.seriesVisibility[celLine.seriesKey]?.[celLine.aggId] !== false;
                    if (!aggVisible) return;
                }

                clickablePromise = clickablePromise
                    .then(() => useDelay ? delay(TRACE_DRAW_DELAY) : Promise.resolve())
                    .then(() => {
                        // Cel lines store dates as YYYY-MM-DD strings
                        const x1 = dateToXPosition(celLine.date1);
                        const x2 = dateToXPosition(celLine.date2);

                        let points;
                        const isPL = celLine.fitMethod === FIT_METHODS.POWER_LAW && celLine.powerLawParams;
                        if (isPL) {
                            const plp = celLine.powerLawParams;
                            const fitResult = { slope: plp.slope, intercept: plp.intercept, xShift: plp.xShift };
                            const numPts = Math.max(50, Math.ceil(x2 - x1) + 1);
                            const step = (x2 - x1) / (numPts - 1);
                            const xArr = [], yArr = [];
                            for (let i = 0; i < numPts; i++) {
                                const xv = x1 + i * step;
                                xArr.push(xv);
                                yArr.push(Math.pow(10, evaluatePowerLaw(xv, fitResult)));
                            }
                            points = [{ x: xArr, y: yArr }];
                        } else {
                            points = [interpolateLinePoints(x1, celLine.y1, x2, celLine.y2, isLogY)];
                        }

                        return makeLineClickable({
                            lineName: `cel-${celLine.id}`,
                            points: points
                        });
                    });
            });
        }

        if (category === 'cut' && chartState.LineCuts && Object.keys(chartState.LineCuts).length > 0) {
            clickablePromise = clickablePromise.then(() => {
                const cutLineShapes = drawCutLineMarkers();

                if (cutLineShapes.length > 0) {
                    const currentShapes = chartDiv.layout.shapes || [];
                    const shapesWithoutCutMarkers = currentShapes.filter(shape =>
                        !shape.name || !shape.name.startsWith('cut-')
                    );
                    return relayout(chartDiv, {
                        shapes: [...shapesWithoutCutMarkers, ...cutLineShapes]
                    }).then(() => {
                        let cutPromise = Promise.resolve();
                        Object.values(chartState.LineCuts).forEach(cut => {
                            cutPromise = cutPromise
                                .then(() => useDelay ? delay(TRACE_DRAW_DELAY) : Promise.resolve())
                                .then(() => {
                                    const xPos = dateToXPosition(cut.date) - 0.5;
                                    const points = [interpolateLinePoints(xPos, yBottom, xPos, yTop, isLogY)];

                                    return makeLineClickable({
                                        lineName: `cut-${cut.id}`,
                                        points: points
                                    });
                                });
                        });
                        return cutPromise;
                    });
                }
            });
        }

        clickablePromise.then(() => {
            // Move all clickable traces to the end so they're on top of data series
            const clickableIndices = [];
            chartDiv.data.forEach((trace, i) => {
                if (trace.meta?.type === 'clickableLine') clickableIndices.push(i);
            });
            if (clickableIndices.length > 0) {
                const total = chartDiv.data.length;
                const targets = clickableIndices.map((_, i) => total - clickableIndices.length + i);
                return Plotly.moveTraces(chartDiv, clickableIndices, targets);
            }
        });

    } else {
        // Remove only traces for this category
        const categoryPrefix = `${category}-`;
        const indices = [];
        chartDiv.data.forEach((trace, i) => {
            if (trace.meta?.type === 'clickableLine' && trace.meta.lineName.startsWith(categoryPrefix)) {
                indices.push(i);
            }
        });
        if (indices.length > 0) {
            deleteTraces(chartDiv, indices.sort((a, b) => b - a));
        }

        // For cut lines, also remove the marker shapes
        if (category === 'cut') {
            const shapes = chartDiv.layout.shapes || [];
            const filtered = shapes.filter(s => !s.name?.startsWith('cut-'));
            if (filtered.length !== shapes.length) {
                relayout(chartDiv, { shapes: filtered });
            }
        }
    }
}

/**
 * Draws dashed orange vertical lines at cut positions
 * @returns {Array} Array of shape objects for cut line markers
 */
function drawCutLineMarkers() {
    const chartDiv = getChartDiv();
    if (!chartDiv || !chartDiv._fullLayout) {
        return [];
    }

    const yaxis = chartDiv._fullLayout.yaxis;
    const isLogY = yaxis.type === 'log';
    const visibleYMin = yaxis.range[0];
    const visibleYMax = yaxis.range[1];

    let yBottom, yTop;
    if (isLogY) {
        yBottom = Math.pow(10, visibleYMin);
        yTop = Math.pow(10, visibleYMax);
    } else {
        yBottom = visibleYMin;
        yTop = visibleYMax;
    }

    const shapes = [];

    if (chartState.LineCuts && Object.keys(chartState.LineCuts).length > 0) {
        const cutEntries = Object.values(chartState.LineCuts);

        cutEntries.forEach((cut) => {
            const xPos = dateToXPosition(cut.date) - 0.5;
            shapes.push({
                type: 'line',
                x0: xPos,
                y0: yBottom,
                x1: xPos,
                y1: yTop,
                xref: 'x',
                yref: 'y',
                line: { color: 'orange', width: 2, dash: 'dash' },
                name: `cut-${cut.id}`
            });
        });
    }

    return shapes;
}

/**
 * Initialize event subscriptions
 */
function init() {
    eventBus.subscribe(EVENTS.NAV_LINE_CLICKABILITY_TOGGLE, (data) => {
        setLineCategoryClickability(data.category, data.enabled);
    }, true);

    eventBus.subscribe(EVENTS.LINE_REMOVE_CLICKABLE, (data) => {
        removeLineClickable(data.lineName);
    }, true);

    // When series visibility changes while cel edit mode is active,
    // add/remove clickable traces for affected cel lines
    eventBus.subscribe(EVENTS.SERIES_VISIBILITY_CHANGED, (data) => {
        if (!categoryEditState.cel || !chartState.CelLines) return;

        const baseKey = data.baseKey;
        const chartDiv = getChartDiv();
        const yaxis = chartDiv._fullLayout?.yaxis;
        if (!yaxis) return;

        const isLogY = yaxis.type === 'log';

        Object.values(chartState.CelLines).forEach(celLine => {
            if (!celLine.id || celLine.seriesKey !== baseKey) return;

            const fittedAgg = celLine.aggId;
            const aggVisible = chartState.seriesVisibility[baseKey]?.[fittedAgg] !== false;
            const lineName = `cel-${celLine.id}`;

            if (aggVisible) {
                // Re-add clickable trace if not already present
                const alreadyExists = chartDiv.data.some(
                    t => t.meta?.type === 'clickableLine' && t.meta.lineName === lineName
                );
                if (!alreadyExists) {
                    const x1 = dateToXPosition(celLine.date1);
                    const x2 = dateToXPosition(celLine.date2);
                    const points = [interpolateLinePoints(x1, celLine.y1, x2, celLine.y2, isLogY)];
                    makeLineClickable({ lineName, points });
                }
            } else {
                // Remove clickable trace for hidden agg
                removeLineClickable(lineName);
            }
        });
    }, true);
}

export {
    makeLineClickable,
    setLineCategoryClickability,
    setupClickHandler,
    drawCutLineMarkers,
    init
};
