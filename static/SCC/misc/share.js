// share.js
// Handles chart screenshot and data export functionality

import { chartState } from '../chartState.js';
import { createToast } from '../util/toaster.js';
import { icons } from '../util/icons.js';
import { getFirstConfig } from '../series/traceStyles.js';

/**
 * Takes a screenshot of the Plotly chart and downloads it as PNG
 *
 * Data flow:
 * - Accesses the Plotly chart via DOM element with id 'chart'
 * - Uses Plotly.downloadImage() to export chart as PNG
 * - Triggers browser download with filename 'chart-screenshot.png'
 */
function takeChartScreenshot() {
    // Get the Plotly chart element
    const chartElement = document.getElementById('chart');

    if (!chartElement) {
        createToast({
            message: 'Chart not found',
            duration: 2000,
            position: 'top-right'
        });
        return;
    }

    // Check if Plotly is available
    if (typeof Plotly === 'undefined') {
        createToast({
            message: 'Plotly library not loaded',
            duration: 2000,
            position: 'top-right'
        });
        return;
    }

    // Use chartName from metadata if available, otherwise default to 'chart-screenshot'
    const fileName = chartState.chartName || 'chart-screenshot';

    // Get the chart's actual rendered dimensions to preserve aspect ratio
    const chartWidth = chartElement.layout.width || chartElement.offsetWidth;
    const chartHeight = chartElement.layout.height || chartElement.offsetHeight;

    // Download chart as PNG using Plotly's built-in function
    Plotly.downloadImage(chartElement, {
        format: 'png',
        width: chartWidth,
        height: chartHeight,
        filename: fileName
    }).then(() => {
        createToast({
            message: 'Screenshot downloaded',
            duration: 2000,
            position: 'top-right'
        });
    }).catch((error) => {
        console.error('Error taking screenshot:', error);
        createToast({
            message: 'Screenshot failed',
            duration: 2000,
            position: 'top-right'
        });
    });
}

/**
 * Exports chart series data to CSV format and downloads it
 *
 * Data flow:
 * - Reads chartState.series object (defined in chartState.js, loaded globally)
 * - Converts data to CSV format with headers
 * - Creates a downloadable CSV file via blob
 * - Triggers browser download with filename 'chart-data.csv'
 */
function exportDataToCSV() {
    // Check if chartState.series exists
    // chartState.series defined in: static/chartState.js (loaded globally)
    if (typeof chartState.series === 'undefined') {
        createToast({
            message: 'No data available to export',
            duration: 2000,
            position: 'top-right'
        });
        return;
    }

    try {
        // Find misc series that have integer data
        const miscSeriesWithData = Object.entries(chartState.series.misc)
            .filter(([id, data]) => data && data.some(val => Number.isInteger(val)))
            .map(([id]) => id)
            .sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)));

        // Prepare CSV data
        let csvContent = '';

        // Add header row based on which series have data
        csvContent += 'Date,Corrects,Errors,Minutes';
        miscSeriesWithData.forEach(miscId => {
            const config = getFirstConfig(miscId, true);
            const name = config?.seriesName || miscId;
            csvContent += `,${name}`;
        });
        csvContent += '\n';

        // Get the length of timestamps array
        const dataLength = chartState.series.xValues.length;

        if (dataLength === 0) {
            createToast({
                message: 'No data to export',
                duration: 2000,
                position: 'top-right'
            });
            return;
        }

        // Helper function to format value (convert NaN to empty string)
        const formatValue = (val) => {
            if (val === undefined || val === null || Number.isNaN(val)) return '';
            return val;
        };

        // Iterate through each data point
        for (let i = 0; i < dataLength; i++) {
            // Convert Unix timestamp to human-readable date/time (ISO format without commas)
            const timestamp = chartState.series.xValues[i];
            let dateStr = '';
            if (timestamp) {
                const date = new Date(timestamp * 1000);
                dateStr = date.toISOString().replace('T', ' ').substring(0, 19);
            }

            const correct = formatValue(chartState.series.corrects[i]);
            const error = formatValue(chartState.series.errors[i]);
            const timing = formatValue(chartState.series.timing[i]);

            let row = `${dateStr},${correct},${error},${timing}`;

            miscSeriesWithData.forEach(miscId => {
                const val = formatValue(chartState.series.misc[miscId][i]);
                row += `,${val}`;
            });

            csvContent += row + '\n';
        }

        // Create a blob from the CSV content
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

        // Create a download link and trigger download
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        // Use chartName from metadata if available, otherwise default to 'chart-data'
        const fileName = chartState.chartName ? `${chartState.chartName}.csv` : 'chart-data.csv';

        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        createToast({
            message: 'Data exported successfully',
            duration: 2000,
            position: 'top-right'
        });

    } catch (error) {
        console.error('Error exporting data:', error);
        createToast({
            message: 'Export failed',
            duration: 2000,
            position: 'top-right'
        });
    }
}

/**
 * Handles share link option click
 * Shows "Copied" feedback on the clicked option
 *
 * @param {string} type - 'view' or 'edit'
 */
function handleShareLinkClick(type) {
    const viewStatus = document.getElementById('share-view-status');
    const editStatus = document.getElementById('share-edit-status');

    // Hide both statuses first
    viewStatus?.classList.add('invisible');
    editStatus?.classList.add('invisible');

    // Show status for clicked option
    const status = type === 'view' ? viewStatus : editStatus;
    status?.classList.remove('invisible');

    // Hide after 3 seconds
    setTimeout(() => {
        status?.classList.add('invisible');
    }, 3000);

    // TODO: Actual clipboard copy will go here
}

/**
 * Initializes the share tab functionality
 *
 * Data flow:
 * - Injects SVG icons into DOM elements (camera and CSV icons from icons.js)
 * - Attaches click event listeners to icon buttons
 * - Called when share tab is loaded or selected
 */
function initializeShareTab() {
    // Inject camera icon
    const cameraIconElement = document.getElementById('camera-icon');
    if (cameraIconElement) {
        cameraIconElement.innerHTML = icons.otherCamera();
    }

    // Inject CSV export icon
    const csvIconElement = document.getElementById('csv-icon');
    if (csvIconElement) {
        csvIconElement.innerHTML = icons.csvExportSvgIcon();
    }

    // Inject share link icons
    const viewLinkIcon = document.getElementById('view-link-icon');
    if (viewLinkIcon) {
        viewLinkIcon.style.position = 'relative';
        viewLinkIcon.innerHTML = `
            ${icons.shareLink()}
            <span style="position: absolute; top: -4px; right: -4px; width: 24px; height: 24px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
                ${icons.lockSolid(16)}
            </span>
        `;
    }

    const editLinkIcon = document.getElementById('edit-link-icon');
    if (editLinkIcon) {
        editLinkIcon.innerHTML = icons.shareLink();
    }

    // Attach share link click handlers
    const shareViewBtn = document.getElementById('share-view-btn');
    if (shareViewBtn) {
        shareViewBtn.addEventListener('click', () => handleShareLinkClick('view'));
    }

    const shareEditBtn = document.getElementById('share-edit-btn');
    if (shareEditBtn) {
        shareEditBtn.addEventListener('click', () => handleShareLinkClick('edit'));
    }

    const screenshotBtn = document.getElementById('screenshot-btn');
    if (screenshotBtn) {
        screenshotBtn.addEventListener('click', takeChartScreenshot);
    }

    const csvExportBtn = document.getElementById('csv-export-btn');
    if (csvExportBtn) {
        csvExportBtn.addEventListener('click', exportDataToCSV);
    }

    console.log('Share tab initialized');
}

export { takeChartScreenshot, exportDataToCSV, initializeShareTab };
