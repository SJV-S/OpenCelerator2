/**
 * Line Hover Module
 *
 * Creates invisible marker traces along lines to enable hover detection.
 * Uses the same interpolation approach as lineClickHandler but with
 * fully invisible markers that show labels on hover.
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { dateToXPosition } from '../util/dates.js';
import { CHART_TYPE_CONFIG } from '../config.js';
import { formatCelerationLabel } from '../util/fit_lines.js';

// Meta type for hover traces (distinct from clickableLine)
const HOVER_TRACE_TYPE = 'hoverLine';

/**
 * Interpolates points along a line segment
 * (Same logic as lineClickHandler)
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
 * Removes all hover traces from the chart
 */
function removeAllHoverTraces() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.data) return;

    const indices = [];
    chartDiv.data.forEach((trace, i) => {
        if (trace.meta?.type === HOVER_TRACE_TYPE) {
            indices.push(i);
        }
    });

    if (indices.length > 0) {
        Plotly.deleteTraces(chartDiv, indices.sort((a, b) => b - a));
    }
}

/**
 * Creates a hover trace for a line
 */
function createHoverTrace(points, lineName, label, color) {
    return {
        x: points.x,
        y: points.y,
        mode: 'markers',
        marker: {
            color: 'rgba(0,0,0,0)',
            size: 20,
            symbol: 'square',
            line: { width: 0 }
        },
        hoverinfo: 'text',
        hovertext: label,
        hoverlabel: {
            bgcolor: color || 'rgba(0,0,0,0.85)',
            font: { color: 'white', size: 18 }
        },
        showlegend: false,
        meta: { type: HOVER_TRACE_TYPE, lineName }
    };
}

/**
 * Builds the common hover label for a cel line (trend + bounce info).
 */
function buildCelHoverLabel(celLine) {
    // Build label from raw fields — never rely on celLine.text for format
    const config = CHART_TYPE_CONFIG[chartState.chartType] || CHART_TYPE_CONFIG.Daily;
    const slope = formatCelerationLabel(celLine.slope, config.unit);
    const fitMethod = celLine.fitMethod || 'Unknown';

    let lines = [`${fitMethod}: ${slope}`];

    // Derive bounce spread if bounce lines exist
    let upperOffset = celLine.bounceUpperOffset;
    let lowerOffset = celLine.bounceLowerOffset;
    if (upperOffset == null && celLine.bounceUpperY1 != null && celLine.y1 > 0) {
        upperOffset = Math.log10(celLine.bounceUpperY1) - Math.log10(celLine.y1);
    }
    if (lowerOffset == null && celLine.bounceLowerY1 != null && celLine.y1 > 0) {
        lowerOffset = Math.log10(celLine.bounceLowerY1) - Math.log10(celLine.y1);
    }
    if (upperOffset != null && lowerOffset != null) {
        const spread = Math.pow(10, upperOffset - lowerOffset);
        lines.push(`${celLine.bounceEnvelope}: ×${spread.toFixed(2)}`);
    }

    return lines.join('<br>');
}

/**
 * Check if a data series has any visible aggregation type.
 * Mirrors isSeriesVisible() in celLine.js.
 */
function isSeriesVisible(seriesKey) {
    const visibility = chartState.seriesVisibility;
    const prefix = seriesKey + '_';
    const entries = Object.entries(visibility).filter(([key]) => key.startsWith(prefix));
    if (entries.length === 0) return true;
    return entries.some(([, visible]) => visible !== false);
}

/**
 * Builds hover traces for cel lines only.
 * Skips lines whose shapes are hidden (global change visibility off,
 * or underlying data series hidden).
 */
function buildAllHoverTraces() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv?._fullLayout) return [];

    const yaxis = chartDiv._fullLayout.yaxis;
    const isLogY = yaxis.type === 'log';
    const globalVisible = chartState.lineVisibility.change;

    const traces = [];

    // Cel lines only
    if (chartState.CelLines) {
        Object.values(chartState.CelLines).forEach(celLine => {
            if (!celLine.id) return; // Skip settings object

            // Same visibility rule as redrawCelLines in celLine.js
            if (!globalVisible || !isSeriesVisible(celLine.seriesKey)) return;

            const lineName = `cel-${celLine.id}`;
            const label = buildCelHoverLabel(celLine);
            const color = celLine.style?.color || 'rgba(0,0,0,0.85)';

            const x1 = dateToXPosition(celLine.date1);
            const x2 = dateToXPosition(celLine.date2);

            // Main trend line
            const points = interpolateLinePoints(x1, celLine.y1, x2, celLine.y2, isLogY);
            traces.push(createHoverTrace(points, lineName, label, color));

            // Upper bounce — same label
            if (celLine.bounceUpperY1 != null && celLine.bounceUpperY2 != null) {
                const upperPoints = interpolateLinePoints(x1, celLine.bounceUpperY1, x2, celLine.bounceUpperY2, isLogY);
                traces.push(createHoverTrace(upperPoints, `${lineName}-upper`, label, color));
            }

            // Lower bounce — same label
            if (celLine.bounceLowerY1 != null && celLine.bounceLowerY2 != null) {
                const lowerPoints = interpolateLinePoints(x1, celLine.bounceLowerY1, x2, celLine.bounceLowerY2, isLogY);
                traces.push(createHoverTrace(lowerPoints, `${lineName}-lower`, label, color));
            }
        });
    }

    return traces;
}

/**
 * Refreshes all hover traces - removes old ones and adds new ones
 */
function refreshHoverTraces() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv?._fullLayout) return;

    removeAllHoverTraces();

    const traces = buildAllHoverTraces();
    if (traces.length > 0) {
        Plotly.addTraces(chartDiv, traces);
    }
}

/**
 * Initialize the module
 */
function init() {
    // Refresh hover traces when cel lines are saved
    eventBus.subscribe(EVENTS.LINE_CEL_SAVED, () => {
        setTimeout(refreshHoverTraces, 50);
    }, true);

    // Refresh after chart replot
    eventBus.subscribe(EVENTS.DATA_CHART_REPLOT_COMPLETE, () => {
        setTimeout(refreshHoverTraces, 100);
    }, true);

    // Refresh when a line is removed (could be a cel line)
    eventBus.subscribe(EVENTS.LINE_REMOVED, () => {
        setTimeout(refreshHoverTraces, 50);
    }, true);

    // Refresh when global change-line visibility toggles
    eventBus.subscribe(EVENTS.LINE_VISIBILITY_CHANGED, (data) => {
        if (data.lineType === 'change') {
            setTimeout(refreshHoverTraces, 50);
        }
    }, true);

    // Refresh when a data series visibility changes
    eventBus.subscribe(EVENTS.SERIES_VISIBILITY_CHANGED, () => {
        setTimeout(refreshHoverTraces, 50);
    }, true);

    console.log('lineHover.js initialized');
}

export {
    init,
    refreshHoverTraces,
    removeAllHoverTraces
};

console.log('lineHover.js loaded');
