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
import { CHART_TYPE_CONFIG, WINDOW_UNITS } from '../config.js';
import { formatCelerationLabel, formatDoublingTimeLabel, formatPowerLawLabel, FIT_METHODS, evaluatePowerLaw } from '../util/fit_lines.js';
import { getCelLineSettings } from '../ui/celSettingsModal.js';
import { interpolateLinePoints } from '../util/lineInterpolation.js';
import { deleteTraces, addTraces } from '../util/plotlyWrapper.js';
import { getChartDiv } from '../util/dom.js';

// Meta type for hover traces (distinct from clickableLine)
const HOVER_TRACE_TYPE = 'hoverLine';

/**
 * Interpolate points along a power law curve for hover detection.
 * @param {number} x1 - Start x position
 * @param {number} x2 - End x position
 * @param {Object} fitResult - { slope, intercept, xShift }
 * @param {number} [yOffset=0] - Vertical offset in log-space (for bounce lines)
 * @returns {{ x: number[], y: number[] }}
 */
function interpolatePowerLawPoints(x1, x2, fitResult, yOffset = 0) {
    const numPoints = Math.max(50, Math.ceil(x2 - x1) + 1);
    const step = (x2 - x1) / (numPoints - 1);
    const xArray = [];
    const yArray = [];

    for (let i = 0; i < numPoints; i++) {
        const x = x1 + i * step;
        const logY = evaluatePowerLaw(x, fitResult) + yOffset;
        xArray.push(x);
        yArray.push(Math.pow(10, logY));
    }

    return { x: xArray, y: yArray };
}

/**
 * Removes all hover traces from the chart
 */
function removeAllHoverTraces() {
    const chartDiv = getChartDiv();
    if (!chartDiv?.data) return;

    const indices = [];
    chartDiv.data.forEach((trace, i) => {
        if (trace.meta?.type === HOVER_TRACE_TYPE) {
            indices.push(i);
        }
    });

    if (indices.length > 0) {
        deleteTraces(chartDiv, indices.sort((a, b) => b - a));
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
    const fitMethod = celLine.fitMethod || 'Unknown';

    let lines;
    if (fitMethod === FIT_METHODS.POWER_LAW) {
        lines = [`Power law: ${formatPowerLawLabel(celLine.slope)}`];
    } else {
        const config = CHART_TYPE_CONFIG[chartState.chartType] || CHART_TYPE_CONFIG.Daily;
        const { labelFormat } = getCelLineSettings();
        const wu = WINDOW_UNITS[chartState.chartType];
        const unitName = wu ? wu.name.toLowerCase() : 'day';
        const slope = labelFormat === 'doubling'
            ? formatDoublingTimeLabel(celLine.slope, config.unit, unitName)
            : formatCelerationLabel(celLine.slope, config.unit);
        lines = [`${fitMethod}: ${slope}`];
    }

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
 * Builds the hover label for an aim line (user text + celeration for diagonal).
 */
function buildAimHoverLabel(aimLine) {
    const lines = [];

    // User-supplied text label
    if (aimLine.text && aimLine.text.trim() !== '') {
        lines.push(aimLine.text);
    }

    // Celeration value for diagonal lines
    if (aimLine.direction === 'diagonal') {
        const x1 = dateToXPosition(aimLine.date1);
        const x2 = dateToXPosition(aimLine.date2);
        const dx = x2 - x1;
        if (dx > 0 && aimLine.y1 > 0 && aimLine.y2 > 0) {
            const logSlope = (Math.log10(aimLine.y2) - Math.log10(aimLine.y1)) / dx;
            const config = CHART_TYPE_CONFIG[chartState.chartType] || CHART_TYPE_CONFIG.Daily;
            const { labelFormat } = getCelLineSettings();
            const wu = WINDOW_UNITS[chartState.chartType];
            const unitName = wu ? wu.name.toLowerCase() : 'day';
            const slopeLabel = labelFormat === 'doubling'
                ? formatDoublingTimeLabel(logSlope, config.unit, unitName)
                : formatCelerationLabel(logSlope, config.unit);
            lines.push(slopeLabel);
        }
    }

    return lines.join('<br>');
}

/**
 * Builds hover traces for cel lines and aim lines.
 * Skips lines whose shapes are hidden (global visibility off,
 * or underlying data series hidden).
 */
function buildAllHoverTraces() {
    const chartDiv = getChartDiv();
    if (!chartDiv?._fullLayout) return [];

    const yaxis = chartDiv._fullLayout.yaxis;
    const isLogY = yaxis.type === 'log';

    const traces = [];

    // Cel lines
    const celVisible = chartState.lineVisibility.change;
    if (chartState.CelLines) {
        Object.values(chartState.CelLines).forEach(celLine => {
            if (!celLine.id) return; // Skip settings object

            // Same visibility rule as redrawCelLines in celLine.js
            const fittedAgg = celLine.aggId;
            const aggVisible = chartState.seriesVisibility[celLine.seriesKey]?.[fittedAgg] !== false;
            if (!celVisible || !aggVisible) return;

            const lineName = `cel-${celLine.id}`;
            const label = buildCelHoverLabel(celLine);
            const color = celLine.style?.color || 'rgba(0,0,0,0.85)';

            const x1 = dateToXPosition(celLine.date1);
            const x2 = dateToXPosition(celLine.date2);

            const isPowerLaw = celLine.fitMethod === FIT_METHODS.POWER_LAW && celLine.powerLawParams;

            if (isPowerLaw) {
                const plp = celLine.powerLawParams;
                const fitResult = { slope: plp.slope, intercept: plp.intercept, xShift: plp.xShift };
                const points = interpolatePowerLawPoints(x1, x2, fitResult);
                traces.push(createHoverTrace(points, lineName, label, color));

                if (celLine.bounceUpperOffset != null) {
                    const upperPoints = interpolatePowerLawPoints(x1, x2, fitResult, celLine.bounceUpperOffset);
                    traces.push(createHoverTrace(upperPoints, `${lineName}-upper`, label, color));
                }
                if (celLine.bounceLowerOffset != null) {
                    const lowerPoints = interpolatePowerLawPoints(x1, x2, fitResult, celLine.bounceLowerOffset);
                    traces.push(createHoverTrace(lowerPoints, `${lineName}-lower`, label, color));
                }
            } else {
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
            }
        });
    }

    // Aim lines
    const aimVisible = chartState.lineVisibility.aim;
    if (chartState.AimLines && aimVisible) {
        Object.values(chartState.AimLines).forEach(aimLine => {
            if (!aimLine.id) return;

            const lineName = `aim-${aimLine.id}`;
            const label = buildAimHoverLabel(aimLine);
            if (!label) return; // No text and not diagonal — nothing to show

            const color = aimLine.style?.color || 'rgba(0,0,0,0.85)';
            const x1 = dateToXPosition(aimLine.date1);
            const x2 = dateToXPosition(aimLine.date2);

            const points = interpolateLinePoints(x1, aimLine.y1, x2, aimLine.y2, isLogY);
            traces.push(createHoverTrace(points, lineName, label, color));
        });
    }

    return traces;
}

/**
 * Refreshes all hover traces - removes old ones and adds new ones
 */
function refreshHoverTraces() {
    const chartDiv = getChartDiv();
    if (!chartDiv?._fullLayout) return;

    removeAllHoverTraces();

    const traces = buildAllHoverTraces();
    if (traces.length > 0) {
        addTraces(chartDiv, traces);
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

    // Refresh when aim lines are saved or restyled
    eventBus.subscribe(EVENTS.LINE_AIM_SAVED, () => {
        setTimeout(refreshHoverTraces, 50);
    }, true);

    eventBus.subscribe(EVENTS.LINE_AIM_STYLE_CHANGED, () => {
        setTimeout(refreshHoverTraces, 50);
    }, true);

    // Refresh when global line visibility toggles (change or aim)
    eventBus.subscribe(EVENTS.LINE_VISIBILITY_CHANGED, (data) => {
        if (data.lineType === 'change' || data.lineType === 'aim') {
            setTimeout(refreshHoverTraces, 50);
        }
    }, true);

    // Refresh when a data series visibility changes
    eventBus.subscribe(EVENTS.SERIES_VISIBILITY_CHANGED, () => {
        setTimeout(refreshHoverTraces, 50);
    }, true);
}

export {
    init,
    refreshHoverTraces,
    removeAllHoverTraces
};
