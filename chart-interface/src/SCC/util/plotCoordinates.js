/**
 * Plot coordinate conversion utilities.
 *
 * Converts mouse/touch pixel positions to chart data coordinates.
 * Consolidates duplicate getPlotCoordinates functions from line modules.
 */

import { chartState } from '../chartState.js';

/**
 * Convert a mouse/touch event to data-space coordinates using Plotly's _fullLayout internals.
 * Used by phaseLines and aimLines.
 *
 * @param {MouseEvent|Touch} eventOrTouch - Must have clientX/clientY
 * @param {HTMLElement} chartDiv - The Plotly chart div
 * @param {Object} [options]
 * @param {Function|null} [options.roundY] - Function to snap y value (e.g. roundYValue), or null for no rounding
 * @returns {{ x: number, y: number }|null}
 */
export function getDataCoordinates(eventOrTouch, chartDiv, options = {}) {
    if (!chartDiv._fullLayout) return null;

    const xaxis = chartDiv._fullLayout.xaxis;
    const yaxis = chartDiv._fullLayout.yaxis;
    if (!xaxis || !yaxis) return null;

    const bbox = chartDiv.getBoundingClientRect();

    const xPixelInPlotArea = eventOrTouch.clientX - bbox.left - xaxis._offset;
    const yPixelInPlotArea = eventOrTouch.clientY - bbox.top - yaxis._offset;

    const visibleXMin = xaxis.range[0];
    const visibleXMax = xaxis.range[1];
    const visibleYMin = yaxis.range[0];
    const visibleYMax = yaxis.range[1];

    const isLogY = yaxis.type === 'log';

    let xValue = visibleXMin + (xPixelInPlotArea / xaxis._length) * (visibleXMax - visibleXMin);
    xValue = Math.round(xValue);

    if (xValue < 0 || xValue > chartState.chartCapacity) return null;

    let yValue;
    if (isLogY) {
        const logYValue = visibleYMax - (yPixelInPlotArea / yaxis._length) * (visibleYMax - visibleYMin);
        yValue = Math.pow(10, logYValue);
    } else {
        yValue = visibleYMax - (yPixelInPlotArea / yaxis._length) * (visibleYMax - visibleYMin);
    }

    if (options.roundY) {
        yValue = options.roundY(yValue);
    }

    return { x: xValue, y: yValue };
}

/**
 * Convert a mouse/touch event to an x data coordinate plus pixel positions.
 * Uses layout margins for bounds checking. Used by cutLines and celLines.
 *
 * @param {MouseEvent|Touch} eventOrTouch - Must have clientX/clientY
 * @param {HTMLElement} chartDiv - The Plotly chart div
 * @param {Object} [options]
 * @param {boolean} [options.snapPixel=false] - Snap xPixel to integer x using Plotly's l2p()
 * @param {boolean} [options.halfStep=false] - Use floor+0.5 rounding instead of Math.round
 * @returns {{ x: number, xPixel: number, yPixel: number }|null}
 */
export function getPixelCoordinates(eventOrTouch, chartDiv, options = {}) {
    const rect = chartDiv.getBoundingClientRect();
    const xPixel = eventOrTouch.clientX - rect.left;
    const yPixel = eventOrTouch.clientY - rect.top;
    const layout = chartDiv.layout;

    if (!layout || !layout.xaxis || !layout.yaxis) return null;

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
    const xRounded = options.halfStep ? Math.floor(xValue) + 0.5 : Math.round(xValue);

    let finalXPixel = xPixel;
    if (options.snapPixel && chartDiv._fullLayout) {
        const xaxis = chartDiv._fullLayout.xaxis;
        finalXPixel = xaxis._offset + xaxis.l2p(xRounded);
    }

    return { x: xRounded, xPixel: finalXPixel, yPixel };
}
