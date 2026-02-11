/**
 * Line interpolation utility - generates evenly-spaced points along a line segment.
 * Used by lineClickHandler (clickable overlays) and lineHover (hover detection).
 *
 * @param {number} x1 - Start x coordinate
 * @param {number} y1 - Start y coordinate
 * @param {number} x2 - End x coordinate
 * @param {number} y2 - End y coordinate
 * @param {boolean} isLogY - Whether y-axis is logarithmic
 * @returns {{ x: number[], y: number[] }} Arrays of interpolated coordinates
 */
export function interpolateLinePoints(x1, y1, x2, y2, isLogY = false) {
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
