// share.js
// Handles chart screenshot, data export (CSV, JSON).
// Share links and sync functionality stripped for plugin build.

import { chartState } from '../chartState.js';
import { createToast } from './toaster.js';
import { icons } from './icons.js';
import { getFirstConfig } from '../series/traceStyles.js';
import { serializeDate } from '../util/dates.js';
import { DEVELOPER_MODE } from '../config.js';
import { downloadFile } from '../util/download.js';
import { getChartDiv } from '../util/dom.js';

/**
 * Load an Image element from a data URL.
 * @param {string} src - data URL
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * Build a standalone SVG data URL from the already-rendered #custom-legend DOM.
 * Reads positions, markers, and labels directly via getBoundingClientRect().
 * @param {HTMLElement} legendEl - The #custom-legend element
 * @param {number} scale - Plotly export scale factor
 * @returns {string} data:image/svg+xml data URL
 */
function buildLegendSvg(legendEl, scale) {
    const legendRect = legendEl.getBoundingClientRect();
    const w = Math.ceil(legendRect.width * scale);
    const h = Math.ceil(legendRect.height * scale);

    const style = getComputedStyle(legendEl);
    const bg = style.backgroundColor || 'rgba(255,255,255,0.9)';
    const border = style.borderColor || '#ccc';
    const radius = parseFloat(style.borderRadius) * scale || 4 * scale;

    let inner = `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${radius}" ry="${radius}" fill="${bg}" stroke="${border}" stroke-width="${scale}"/>`;

    // Only include data series items (skip .legend-line-item which is the hover-only lines section)
    const items = legendEl.querySelectorAll('.legend-item:not(.legend-line-item)');
    items.forEach(item => {
        const hidden = item.classList.contains('legend-item-hidden');

        const markerEl = item.querySelector('.legend-marker svg');
        const labelEl = item.querySelector('.legend-label');
        if (!markerEl || !labelEl) return;

        const markerRect = markerEl.getBoundingClientRect();
        const labelRect = labelEl.getBoundingClientRect();

        // Positions relative to legend container, scaled
        const mx = (markerRect.left - legendRect.left) * scale;
        const my = (markerRect.top - legendRect.top) * scale;
        const mw = markerRect.width * scale;
        const mh = markerRect.height * scale;

        const lx = (labelRect.left - legendRect.left) * scale;
        const ly = (labelRect.top - legendRect.top) * scale;
        const fontSize = parseFloat(getComputedStyle(labelEl).fontSize) * scale;

        const opacity = hidden ? ' opacity="0.5"' : '';

        const vb = markerEl.getAttribute('viewBox') || '0 0 40 20';
        const markerInner = markerEl.innerHTML;

        inner += `<g${opacity}>`;
        inner += `<svg x="${mx}" y="${my}" width="${mw}" height="${mh}" viewBox="${vb}">${markerInner}</svg>`;

        const escapedText = labelEl.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        inner += `<text x="${lx}" y="${ly + fontSize * 0.85}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#000">${escapedText}</text>`;
        inner += `</g>`;
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${inner}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * Takes a screenshot of the Plotly chart, compositing the custom legend overlay.
 */
async function takeChartScreenshot() {
    const chartElement = getChartDiv();

    if (!chartElement) {
        createToast({ message: 'Chart not found', duration: 2000, position: 'top-right' });
        return;
    }

    if (typeof Plotly === 'undefined') {
        createToast({ message: 'Plotly library not loaded', duration: 2000, position: 'top-right' });
        return;
    }

    const fileName = (chartState.chartName || 'chart-screenshot') + '.png';
    const chartWidth = chartElement.layout.width || chartElement.offsetWidth;
    const chartHeight = chartElement.layout.height || chartElement.offsetHeight;
    const scale = 3;

    try {
        const chartDataUrl = await Plotly.toImage(chartElement, {
            format: 'png',
            width: chartWidth,
            height: chartHeight,
            scale
        });

        const legendEl = document.getElementById('custom-legend');
        const legendVisible = legendEl
            && legendEl.style.display !== 'none'
            && legendEl.querySelectorAll('.legend-item:not(.legend-line-item)').length > 0;

        if (!legendVisible) {
            const chartImg = await loadImage(chartDataUrl);
            const canvas = document.createElement('canvas');
            canvas.width = chartImg.width;
            canvas.height = chartImg.height;
            canvas.getContext('2d').drawImage(chartImg, 0, 0);
            const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            downloadFile(blob, fileName);
        } else {
            const chartImg = await loadImage(chartDataUrl);
            const canvas = document.createElement('canvas');
            canvas.width = chartImg.width;
            canvas.height = chartImg.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(chartImg, 0, 0);

            const legendSvgUrl = buildLegendSvg(legendEl, scale);
            const legendImg = await loadImage(legendSvgUrl);

            const lx = parseFloat(legendEl.style.left) * scale;
            const ly = parseFloat(legendEl.style.top) * scale;
            ctx.drawImage(legendImg, lx, ly);

            const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            downloadFile(blob, fileName);
        }

        createToast({ message: 'Screenshot downloaded', duration: 2000, position: 'top-right' });
    } catch (error) {
        console.error('Error taking screenshot:', error);
        createToast({ message: 'Screenshot failed', duration: 2000, position: 'top-right' });
    }
}

/**
 * Exports chart series data to CSV format and downloads it.
 */
function exportDataToCSV() {
    if (typeof chartState.series === 'undefined') {
        createToast({ message: 'No data available to export', duration: 2000, position: 'top-right' });
        return;
    }

    try {
        const miscSeriesWithData = Object.entries(chartState.series.misc || {})
            .filter(([id, data]) => data && data.some(val => Number.isFinite(val)))
            .map(([id]) => id)
            .sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)));

        const dataLength = chartState.series.xValues.length;

        if (dataLength === 0) {
            createToast({ message: 'No data to export', duration: 2000, position: 'top-right' });
            return;
        }

        const hasData = (arr) => arr && arr.some(val => Number.isFinite(val));
        const includeCorrects = hasData(chartState.series.corrects);
        const includeErrors = hasData(chartState.series.errors);
        const includeMinutes = chartState.minuteChart && hasData(chartState.series.timing);

        let csvContent = 'Date';
        if (includeCorrects) csvContent += ',Corrects';
        if (includeErrors) csvContent += ',Errors';
        if (includeMinutes) csvContent += ',Minutes';
        miscSeriesWithData.forEach(miscId => {
            const config = getFirstConfig(miscId, true);
            const name = config?.seriesName || miscId;
            csvContent += `,${name}`;
        });
        csvContent += '\n';

        const formatValue = (val) => {
            if (val === undefined || val === null || Number.isNaN(val)) return '';
            return val;
        };

        for (let i = 0; i < dataLength; i++) {
            const hasCorrect = includeCorrects && Number.isFinite(chartState.series.corrects[i]);
            const hasError = includeErrors && Number.isFinite(chartState.series.errors[i]);
            const hasMinute = includeMinutes && Number.isFinite(chartState.series.timing[i]);
            const hasMisc = miscSeriesWithData.some(id => Number.isFinite(chartState.series.misc[id][i]));
            if (!hasCorrect && !hasError && !hasMinute && !hasMisc) continue;

            const timestamp = chartState.series.xValues[i];
            let dateStr = '';
            if (timestamp) {
                const date = new Date(timestamp * 1000);
                dateStr = date.toISOString().replace('T', ' ').substring(0, 19);
            }

            let row = dateStr;
            if (includeCorrects) row += `,${formatValue(chartState.series.corrects[i])}`;
            if (includeErrors) row += `,${formatValue(chartState.series.errors[i])}`;
            if (includeMinutes) row += `,${formatValue(chartState.series.timing[i])}`;

            miscSeriesWithData.forEach(miscId => {
                row += `,${formatValue(chartState.series.misc[miscId][i])}`;
            });

            csvContent += row + '\n';
        }

        const fileName = chartState.chartName ? `${chartState.chartName}.csv` : 'chart-data.csv';
        downloadFile(csvContent, fileName, 'text/csv;charset=utf-8;');

        createToast({ message: 'Data exported successfully', duration: 2000, position: 'top-right' });

    } catch (error) {
        console.error('Error exporting data:', error);
        createToast({ message: 'Export failed', duration: 2000, position: 'top-right' });
    }
}

/**
 * Exports the entire chartState as a JSON file download.
 */
function exportChartStateToJSON() {
    try {
        const exportObj = { ...chartState, startDate: serializeDate(chartState.startDate) };
        const jsonContent = DEVELOPER_MODE
            ? JSON.stringify(exportObj, null, 2)
            : JSON.stringify(exportObj);

        const fileName = chartState.chartName ? `${chartState.chartName}.json` : 'chart-data.json';
        downloadFile(jsonContent, fileName, 'application/json;charset=utf-8;');

        createToast({ message: 'Chart exported successfully', duration: 2000, position: 'top-right' });

    } catch (error) {
        console.error('Error exporting chart state:', error);
        createToast({ message: 'Export failed', duration: 2000, position: 'top-right' });
    }
}

/**
 * Initializes the share tab — export buttons only (no share links).
 */
function initializeShareTab() {
    const cameraIconElement = document.getElementById('camera-icon');
    if (cameraIconElement) {
        cameraIconElement.innerHTML = icons.otherCamera();
    }

    const csvIconElement = document.getElementById('csv-icon');
    if (csvIconElement) {
        csvIconElement.innerHTML = icons.csvExportSvgIcon();
    }

    const jsonIconElement = document.getElementById('json-icon');
    if (jsonIconElement) {
        jsonIconElement.innerHTML = icons.jsonExport();
    }

    const screenshotBtn = document.getElementById('screenshot-btn');
    if (screenshotBtn) {
        screenshotBtn.addEventListener('click', takeChartScreenshot);
    }

    const csvExportBtn = document.getElementById('csv-export-btn');
    if (csvExportBtn) {
        csvExportBtn.addEventListener('click', exportDataToCSV);
    }

    const jsonExportBtn = document.getElementById('json-export-btn');
    if (jsonExportBtn) {
        jsonExportBtn.addEventListener('click', exportChartStateToJSON);
    }
}

export { takeChartScreenshot, exportDataToCSV, initializeShareTab };
