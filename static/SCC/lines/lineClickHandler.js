/**
 * Click Handler for Chart Lines
 *
 * This module handles all line click interactions:
 * - Creates clickable marker overlays when edit mode is enabled
 * - Handles click events and shows removal toasts
 * - Removes lines when user confirms
 */

import { chartState } from '../chartState.js';
import { timestampsToXPositions, dateToXPosition } from '../util/dates.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { createToast } from '../ui/toaster.js';
import { removeLine } from './allLines.js';

/**
 * Initialize click event listener on the chart
 * Call this after chart is rendered with Plotly.newPlot()
 */
function setupClickHandler() {
    if (window._clickHandlerAttached) return;

    const chartDiv = document.getElementById('chart');

    // Handler for clicks on data points/traces
    chartDiv.on('plotly_click', function(eventData) {
        const points = eventData.points;
        if (points.length === 0) return;

        const point = points[0];
        const meta = point.data.meta;

        if (meta && meta.type === 'clickableLine') {
            console.log(`Line clicked: ${meta.lineName}`);
            handleLineClick(meta.lineName);
        }
    });

    // Handler for clicks anywhere on chart area (for date selection)
    chartDiv.addEventListener('click', function(e) {
        const xaxis = chartDiv._fullLayout?.xaxis;
        if (!xaxis) return;

        const rect = chartDiv.getBoundingClientRect();
        const xData = xaxis.p2d(e.clientX - rect.left - xaxis._offset);

        // Only emit if within visible x-range
        if (xData >= xaxis.range[0] && xData <= xaxis.range[1]) {
            eventBus.emit(EVENTS.CHART_CLICKED, { x: xData });
        }
    });

    window._clickHandlerAttached = true;
    console.log('Click handler initialized');
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
        'phase': { stateKey: 'PhaseLines', label: 'Count marker' },
        'aim': { stateKey: 'AimLines', label: 'Event marker' },
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
                    message += `, +${metadata.forecast}d`;
                }
                message += ')';
            }
        } else {
            message = 'Celeration line';
        }
    }

    // Show toast with remove button
    createToast({
        message: message,
        buttons: [
            {
                label: 'Remove',
                onClick: () => {
                    console.log(`Remove clicked for ${lineName}`);
                    removeLine(lineType.stateKey, lineId);
                },
                type: 'secondary'
            }
        ],
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
    const chartDiv = document.getElementById('chart');
    const traces = lineData.points.map(segment => ({
        x: segment.x,
        y: segment.y,
        mode: 'markers',
        marker: { color: 'rgba(255,0,0,0.5)', size: 15, symbol: 'square', line: { width: 0 } },
        hoverinfo: 'none',
        showlegend: false,
        meta: { type: 'clickableLine', lineName: lineData.lineName }
    }));
    return Plotly.addTraces(chartDiv, traces);
}

/**
 * Remove clickability from a line
 * @param {string} lineName - Name of the line to remove
 */
function removeLineClickable(lineName) {
    const chartDiv = document.getElementById('chart');
    const indices = [];
    chartDiv.data.forEach((trace, i) => {
        if (trace.meta?.type === 'clickableLine' && trace.meta?.lineName === lineName) indices.push(i);
    });
    if (indices.length > 0) {
        Plotly.deleteTraces(chartDiv, indices.sort((a, b) => b - a));
    }
}

/**
 * Interpolates points along a line segment for clickability
 */
function interpolateLinePoints(x1, y1, x2, y2, isLogY = false) {
    const xArray = [];
    const yArray = [];
    const xLength = Math.abs(x2 - x1);

    let numPoints;
    if (xLength === 0) {
        if (isLogY && y1 > 0 && y2 > 0) {
            const logSpan = Math.abs(Math.log10(y2) - Math.log10(y1));
            numPoints = Math.max(50, Math.ceil(logSpan * 30));
        } else {
            numPoints = 100;
        }
    } else {
        numPoints = Math.ceil(xLength) + 1;
    }

    for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        xArray.push(x1 + t * (x2 - x1));

        if (isLogY && y1 > 0 && y2 > 0) {
            yArray.push(y1 * Math.pow(y2 / y1, t));
        } else {
            yArray.push(y1 + t * (y2 - y1));
        }
    }

    return { x: xArray, y: yArray };
}

/**
 * Sets clickability for all lines in chartState
 * @param {boolean} makeClickable - If true, make lines clickable; if false, remove
 */
function setLineClickability(makeClickable) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartDiv._fullLayout) {
        console.warn('Chart not initialized');
        return;
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

    if (makeClickable) {
        let clickablePromise = Promise.resolve();

        // Phase lines
        if (chartState.PhaseLines) {
            Object.values(chartState.PhaseLines).forEach(phaseLine => {
                clickablePromise = clickablePromise.then(() => {
                    const verticalTimestamp = Math.floor(phaseLine.verticalLineDate.getTime() / 1000);
                    const horizontalEndTimestamp = Math.floor(phaseLine.horizontalEndDate.getTime() / 1000);
                    const verticalX = timestampsToXPositions([verticalTimestamp])[0];
                    const horizontalEndX = timestampsToXPositions([horizontalEndTimestamp])[0];

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

        // Aim lines
        if (chartState.AimLines) {
            Object.values(chartState.AimLines).forEach(aimLine => {
                clickablePromise = clickablePromise.then(() => {
                    const timestamp1 = Math.floor(aimLine.date1.getTime() / 1000);
                    const timestamp2 = Math.floor(aimLine.date2.getTime() / 1000);
                    const x1 = timestampsToXPositions([timestamp1])[0];
                    const x2 = timestampsToXPositions([timestamp2])[0];

                    const points = [interpolateLinePoints(x1, aimLine.y1, x2, aimLine.y2, isLogY)];

                    return makeLineClickable({
                        lineName: `aim-${aimLine.id}`,
                        points: points
                    });
                });
            });
        }

        // Cel lines (change/trend lines)
        if (chartState.CelLines) {
            Object.entries(chartState.CelLines).forEach(([key, celLine]) => {
                // Skip the settings object
                if (key === 'settings') return;

                clickablePromise = clickablePromise.then(() => {
                    // Cel lines store dates as YYYY-MM-DD strings
                    const x1 = dateToXPosition(celLine.date1);
                    const x2 = dateToXPosition(celLine.date2);

                    const points = [interpolateLinePoints(x1, celLine.y1, x2, celLine.y2, isLogY)];

                    return makeLineClickable({
                        lineName: `cel-${celLine.id}`,
                        points: points
                    });
                });
            });
        }

        // Cut lines
        if (chartState.LineCuts && Object.keys(chartState.LineCuts).length > 0) {
            clickablePromise = clickablePromise.then(() => {
                const cutLineShapes = drawCutLineMarkers();

                if (cutLineShapes.length > 0) {
                    const currentShapes = chartDiv.layout.shapes || [];
                    const shapesWithoutCutMarkers = currentShapes.filter(shape =>
                        !shape.name || !shape.name.startsWith('cut-')
                    );
                    return Plotly.relayout(chartDiv, {
                        shapes: [...shapesWithoutCutMarkers, ...cutLineShapes]
                    }).then(() => {
                        let cutPromise = Promise.resolve();
                        Object.values(chartState.LineCuts).forEach(cut => {
                            cutPromise = cutPromise.then(() => {
                                const timestamp = Math.floor(cut.date.getTime() / 1000);
                                const xPos = timestampsToXPositions([timestamp])[0] - 0.5;
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
            console.log('All lines made clickable');
        });

    } else {
        const indices = [];
        chartDiv.data.forEach((trace, i) => {
            if (trace.meta?.type === 'clickableLine') indices.push(i);
        });
        if (indices.length > 0) {
            Plotly.deleteTraces(chartDiv, indices.sort((a, b) => b - a));
        }
        const shapes = chartDiv.layout.shapes || [];
        const filtered = shapes.filter(s => !s.name?.startsWith('cut-'));
        if (filtered.length !== shapes.length) {
            Plotly.relayout(chartDiv, { shapes: filtered });
        }
    }
}

/**
 * Draws dashed orange vertical lines at cut positions
 * @returns {Array} Array of shape objects for cut line markers
 */
function drawCutLineMarkers() {
    const chartDiv = document.getElementById('chart');
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
        const cutTimestamps = cutEntries.map(cut => Math.floor(cut.date.getTime() / 1000));
        const cutXPositions = timestampsToXPositions(cutTimestamps).map(x => x - 0.5);

        cutEntries.forEach((cut, index) => {
            const xPos = cutXPositions[index];
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
        setLineClickability(data.enabled);
    }, true);

    eventBus.subscribe(EVENTS.LINE_REMOVE_CLICKABLE, (data) => {
        removeLineClickable(data.lineName);
    }, true);
}

export {
    makeLineClickable,
    setLineClickability,
    setupClickHandler,
    drawCutLineMarkers,
    init
};

console.log('lineClickHandler.js loaded');