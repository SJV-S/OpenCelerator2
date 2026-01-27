/**
 * Celeration Fan Module
 *
 * Implements the exact formulas from the celeration fan documentation.
 */

import { chartState } from '../chartState.js';

const CEL_VALUES = [16, 4, 2, 1.4, 1, 1/1.4, 1/2, 1/4, 1/16];
const LABELS = ['×16', '×4', '×2', '×1.4', '×1', '÷1.4', '÷2', '÷4', '÷16'];

const UNITS = { Daily: 7, Weekly: 5, Monthly: 6, Yearly: 5 };
const PERIOD_LABELS = { Daily: 'per week', Weekly: 'per month', Monthly: 'per 6 months', Yearly: 'per 5 years' };

const FAN_COLOR = '#6ad1e3';

/**
 * Step 1: Calculate angle (same formula for line AND text)
 */
function getAngleDegrees(cel) {
    return Math.atan(Math.log10(cel) / (Math.log10(2) / Math.tan(34 * Math.PI / 180))) * (180 / Math.PI);
}

/**
 * Convert data (x, y) to paper coordinates
 */
function toPaper(x, y, xMin, xMax, yMinLog, yMaxLog) {
    return {
        x: (x - xMin) / (xMax - xMin),
        y: (Math.log10(y) - yMinLog) / (yMaxLog - yMinLog)
    };
}

export function generateFanElements(layout, isMinuteChart, chartType) {
    const xMin = layout.xaxis.range[0];
    const xMax = layout.xaxis.range[1];
    const yMinLog = layout.yaxis.range[0]; // Already log10
    const yMaxLog = layout.yaxis.range[1]; // Already log10

    const unit = UNITS[chartType] || 7;
    const periodLabel = PERIOD_LABELS[chartType] || 'per week';

    // Fan center in DATA coordinates
    const xMid = isMinuteChart ? xMax * -0.22 : xMax * 1.04;
    const yMid = isMinuteChart ? 0.01 : 1000;

    // Line length in DATA units (9% of chart width)
    const lineLength = (xMax - xMin) * 0.09;

    const shapes = [];
    const annotations = [];

    CEL_VALUES.forEach((cel, i) => {
        // Step 1: Angle
        const angleDeg = getAngleDegrees(cel);
        const angleRad = angleDeg * Math.PI / 180;

        // Step 2: Line endpoint in DATA coordinates
        const dx = lineLength * Math.cos(angleRad);
        const xEnd = xMid + dx;
        const yEnd = yMid * Math.pow(10, Math.log10(cel) * dx / unit);

        // Convert line to paper
        const p0 = toPaper(xMid, yMid, xMin, xMax, yMinLog, yMaxLog);
        const p1 = toPaper(xEnd, yEnd, xMin, xMax, yMinLog, yMaxLog);

        shapes.push({
            type: 'line',
            name: `fan-line-${i}`,
            x0: p0.x, y0: p0.y,
            x1: p1.x, y1: p1.y,
            xref: 'paper', yref: 'paper',
            line: { color: FAN_COLOR, width: 1 }
        });

        // Step 3: Text position - SAME FORMULA, extended dx
        const dist = 1.1 + 0.05 * LABELS[i].length;
        const textDx = dx * dist;
        const textX = xMid + textDx;
        const textY = yMid * Math.pow(10, Math.log10(cel) * textDx / unit);

        const pText = toPaper(textX, textY, xMin, xMax, yMinLog, yMaxLog);

        // Step 4: Text angle = line angle
        annotations.push({
            name: `fan-label-${i}`,
            x: pText.x,
            y: pText.y,
            xref: 'paper',
            yref: 'paper',
            text: `<b>${LABELS[i]}</b>`,
            showarrow: false,
            font: { size: 10, color: FAN_COLOR },
            textangle: -angleDeg,
            xanchor: 'center',
            yanchor: 'center'
        });
    });

    // Header above fan
    const topDx = lineLength * Math.cos(getAngleDegrees(16) * Math.PI / 180) * 0.5;
    const headerX = xMid + topDx;
    const headerY = yMid * 22;
    const pHeader = toPaper(headerX, headerY, xMin, xMax, yMinLog, yMaxLog);
    annotations.push({
        name: 'fan-header',
        x: pHeader.x, y: pHeader.y,
        xref: 'paper', yref: 'paper',
        text: '<b>Standard<br>celeration</b>',
        showarrow: false,
        font: { size: 11, color: FAN_COLOR },
        xanchor: 'center', yanchor: 'bottom'
    });

    // Period below fan
    const bottomDx = lineLength * Math.cos(getAngleDegrees(1/16) * Math.PI / 180) * 0.5;
    const periodX = xMid + bottomDx;
    const periodY = yMid / 22;
    const pPeriod = toPaper(periodX, periodY, xMin, xMax, yMinLog, yMaxLog);
    annotations.push({
        name: 'fan-period',
        x: pPeriod.x, y: pPeriod.y,
        xref: 'paper', yref: 'paper',
        text: `<b>${periodLabel}</b>`,
        showarrow: false,
        font: { size: 11, color: FAN_COLOR },
        xanchor: 'center', yanchor: 'top'
    });

    return { shapes, annotations };
}

export function injectCelerationFan(plotData, isMinuteChart, chartType) {
    const plotWidth = plotData.layout.width - plotData.layout.margin.l - plotData.layout.margin.r;
    const extraMargin = Math.round(plotWidth * 0.18);

    if (isMinuteChart) {
        plotData.layout.margin.l += extraMargin;
    } else {
        plotData.layout.margin.r += extraMargin;
    }
    plotData.layout.width += extraMargin;

    const { shapes, annotations } = generateFanElements(plotData.layout, isMinuteChart, chartType);

    plotData.layout.shapes = [...(plotData.layout.shapes || []), ...shapes];
    plotData.layout.annotations = [...(plotData.layout.annotations || []), ...annotations];
    chartState.fanVisible = true;

    return plotData;
}

export function removeCelerationFan() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout) return;

    Plotly.relayout(chartDiv, {
        shapes: (chartDiv.layout.shapes || []).filter(s => !s.name?.startsWith('fan-')),
        annotations: (chartDiv.layout.annotations || []).filter(a => !a.name?.startsWith('fan-'))
    });
    chartState.fanVisible = false;
}

export function addCelerationFan() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout) return;

    const { shapes, annotations } = generateFanElements(chartDiv.layout, chartState.minuteChart, chartState.chartType);

    Plotly.relayout(chartDiv, {
        shapes: [...(chartDiv.layout.shapes || []), ...shapes],
        annotations: [...(chartDiv.layout.annotations || []), ...annotations]
    });
    chartState.fanVisible = true;
}

export function toggleCelerationFan(visible) {
    visible ? addCelerationFan() : removeCelerationFan();
}
