// share.js
// Handles chart screenshot, data export, and share link generation

import { chartState } from '../chartState.js';
import { createToast, createConfirmToast } from './toaster.js';
import { icons } from './icons.js';
import { createViewLink, createEditLink, isInitialized, isChartOwner, startSyncWatch, stopSyncWatch } from '../../Server/syncClient.js';
import { importChart, deleteChart } from '../storage/chartStorage.js';
import { getFirstConfig } from '../series/traceStyles.js';
import { isOnline } from '../../Server/onlineStatus.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { serializeDate } from '../util/dates.js';
import { DEVELOPER_MODE } from '../config.js';
import { compactChart } from '../storage/compactJson.js';
import { downloadFile } from '../util/download.js';
import { getChartDiv } from '../util/dom.js';

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
    const chartElement = getChartDiv();

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
        // Find misc series that have numeric data
        const miscSeriesWithData = Object.entries(chartState.series.misc || {})
            .filter(([id, data]) => data && data.some(val => Number.isFinite(val)))
            .map(([id]) => id)
            .sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)));

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

        // Determine which fixed columns have data
        const hasData = (arr) => arr && arr.some(val => Number.isFinite(val));
        const includeCorrects = hasData(chartState.series.corrects);
        const includeErrors = hasData(chartState.series.errors);
        const includeMinutes = chartState.minuteChart && hasData(chartState.series.timing);

        // Build header row — Date is always included
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

        // Helper function to format value (convert null/NaN to empty string)
        const formatValue = (val) => {
            if (val === undefined || val === null || Number.isNaN(val)) return '';
            return val;
        };

        // Iterate through each data point
        for (let i = 0; i < dataLength; i++) {
            // Skip rows where all data columns are empty/null
            const hasCorrect = includeCorrects && Number.isFinite(chartState.series.corrects[i]);
            const hasError = includeErrors && Number.isFinite(chartState.series.errors[i]);
            const hasMinute = includeMinutes && Number.isFinite(chartState.series.timing[i]);
            const hasMisc = miscSeriesWithData.some(id => Number.isFinite(chartState.series.misc[id][i]));
            if (!hasCorrect && !hasError && !hasMinute && !hasMisc) continue;

            // Convert Unix timestamp to human-readable date/time (ISO format without commas)
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
                const val = formatValue(chartState.series.misc[miscId][i]);
                row += `,${val}`;
            });

            csvContent += row + '\n';
        }

        const fileName = chartState.chartName ? `${chartState.chartName}.csv` : 'chart-data.csv';
        downloadFile(csvContent, fileName, 'text/csv;charset=utf-8;');

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
 * Handles share link option click - generates link and copies to clipboard
 * @param {string} type - 'view' or 'edit'
 */
async function handleShareLinkClick(type) {
    if (!isChartOwner(chartState)) return;

    const viewStatus = document.getElementById('share-view-status');
    const editStatus = document.getElementById('share-edit-status');
    const status = type === 'view' ? viewStatus : editStatus;

    // Hide both statuses first
    viewStatus?.classList.add('invisible');
    editStatus?.classList.add('invisible');

    if (!chartState.id) {
        createToast({ message: 'Save chart first', duration: 2000, position: 'top-right' });
        return;
    }

    if (!isInitialized()) {
        createToast({ message: 'Sync not enabled', duration: 2000, position: 'top-right' });
        return;
    }

    if (!isOnline()) {
        createToast({ message: 'No internet or server down', duration: 2000, position: 'top-right' });
        return;
    }

    try {
        const result = type === 'view'
            ? await createViewLink(chartState.id)
            : await createEditLink(chartState.id);

        const url = result.url || result;  // createViewLink returns string, createEditLink returns object

        // Update in-memory state so auto-save triggers pushes
        chartState.shared = true;
        chartState.acceptingEdits = (type === 'edit');
        if (result.chartKey) {
            chartState.chartKey = result.chartKey;
        }

        // Open WebSocket connection now that chart is shared
        startSyncWatch(chartState.id);

        await navigator.clipboard.writeText(url);

        status?.classList.remove('invisible');
        setTimeout(() => status?.classList.add('invisible'), 3000);
    } catch (error) {
        console.error('Share link error:', error);
        createToast({ message: 'Failed to create link', duration: 2000, position: 'top-right' });
    }
}

/**
 * Exports the entire chartState as a JSON file download
 *
 * Data flow:
 * - Serializes chartState object to JSON (null for missing data, ISO string for startDate)
 * - Creates a downloadable JSON file via blob
 * - Triggers browser download with filename based on chartName or 'chart-data.json'
 */
function exportChartStateToJSON() {
    try {
        // === IMPORT DEBUG: measure chartState before serialization ===
        console.log('[IMPORT DEBUG] === exportChartStateToJSON START ===');
        console.log('[IMPORT DEBUG] chartState top-level keys:', Object.keys(chartState));
        for (const key of Object.keys(chartState)) {
            try {
                const keySize = JSON.stringify(chartState[key]).length;
                console.log(`[IMPORT DEBUG]   chartState.${key}: ${keySize} chars`);
            } catch {
                console.log(`[IMPORT DEBUG]   chartState.${key}: [not serializable]`);
            }
        }

        // Build exportable object: spread chartState, override startDate to ISO string
        const exportObj = { ...chartState, startDate: serializeDate(chartState.startDate) };
        compactChart(exportObj);
        const jsonContent = DEVELOPER_MODE
            ? JSON.stringify(exportObj, null, 2)
            : JSON.stringify(exportObj);

        console.log('[IMPORT DEBUG] Serialized JSON total size:', jsonContent.length, 'chars (' + (jsonContent.length / 1024).toFixed(1) + ' KB)');
        console.log('[IMPORT DEBUG] === exportChartStateToJSON END ===');

        // Create a blob from the JSON content
        const fileName = chartState.chartName ? `${chartState.chartName}.json` : 'chart-data.json';
        downloadFile(jsonContent, fileName, 'application/json;charset=utf-8;');

        createToast({
            message: 'Chart exported successfully',
            duration: 2000,
            position: 'top-right'
        });

    } catch (error) {
        console.error('Error exporting chart state:', error);
        createToast({
            message: 'Export failed',
            duration: 2000,
            position: 'top-right'
        });
    }
}

/**
 * Unshares the current chart: creates a private fork, deletes the old shared copy
 * (which also calls leaveChart on the server), stops WebSocket, and navigates to the new chart.
 */
async function unshareChart() {
    const oldId = chartState.id;

    // Serialize current chartState into a plain object for import
    const snapshot = { ...chartState, startDate: serializeDate(chartState.startDate) };

    // importChart assigns a new UUID, new chartKey, sets shared: false
    const newId = await importChart(snapshot);
    if (!newId) {
        createToast({ message: 'Unshare failed', duration: 2000, position: 'top-right' });
        return;
    }

    // Delete old shared copy locally (also fires leaveChart on server)
    await deleteChart(oldId);

    // Disconnect WebSocket
    stopSyncWatch();

    // Navigate to the new private chart
    window.location.href = `/chart/${newId}`;
}

/**
 * Forks a private copy of a shared chart the user doesn't own.
 * Does NOT delete the original or leave the server — just creates a local copy.
 */
async function copyChart() {
    const snapshot = {
        ...chartState,
        startDate: serializeDate(chartState.startDate),
        chartName: (chartState.chartName || 'Unnamed') + ' \u2013 copy',
        publicKey: null,
        ownerName: null,
        acceptingEdits: false
    };

    const newId = await importChart(snapshot);
    if (!newId) {
        createToast({ message: 'Copy failed', duration: 2000, position: 'top-right' });
        return;
    }

    window.location.href = `/chart/${newId}`;
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

    // Inject JSON export icon
    const jsonIconElement = document.getElementById('json-icon');
    if (jsonIconElement) {
        jsonIconElement.innerHTML = icons.jsonExport();
    }

    const jsonExportBtn = document.getElementById('json-export-btn');
    if (jsonExportBtn) {
        jsonExportBtn.addEventListener('click', exportChartStateToJSON);
    }

    // Wire unshare/copy button (handler swapped on chart load based on ownership)
    const unshareBtn = document.getElementById('unshare-btn');
    if (unshareBtn) {
        unshareBtn.addEventListener('click', () => {
            if (isChartOwner(chartState)) {
                createConfirmToast({
                    message: 'Unshare this chart? A private copy will be created and you will leave the shared version.',
                    onYes: () => unshareChart(),
                    yesLabel: 'Unshare',
                    noLabel: 'Cancel',
                    primaryColor: '#dc2626'
                });
            } else {
                createConfirmToast({
                    message: 'Create a private copy of this chart?',
                    onYes: () => copyChart(),
                    yesLabel: 'Copy',
                    noLabel: 'Cancel'
                });
            }
        });
    }

    // Show/hide unshare button after chart loads from IDB (chartState.shared is set by then)
    // Also disable share buttons and swap label for non-owners
    eventBus.subscribe(EVENTS.STORAGE_CHART_LOADED, () => {
        const owner = isChartOwner(chartState);

        const btn = document.getElementById('unshare-btn');
        if (btn) {
            btn.hidden = !chartState.shared;
            if (chartState.shared) {
                if (owner) {
                    btn.textContent = 'Stop sharing chart';
                    btn.classList.add('text-red-600', 'border-red-300', 'hover:bg-red-50');
                    btn.classList.remove('text-blue-600', 'border-blue-300', 'hover:bg-blue-50');
                } else {
                    btn.textContent = 'Copy chart';
                    btn.classList.remove('text-red-600', 'border-red-300', 'hover:bg-red-50');
                    btn.classList.add('text-blue-600', 'border-blue-300', 'hover:bg-blue-50');
                }
            }
        }
        const shareBtns = [document.getElementById('share-view-btn'), document.getElementById('share-edit-btn')];
        for (const el of shareBtns) {
            if (!el) continue;
            if (owner) {
                el.style.opacity = '';
                el.style.cursor = '';
                el.title = '';
            } else {
                el.style.opacity = '0.45';
                el.style.cursor = 'not-allowed';
                el.title = chartState.ownerName
                    ? `${chartState.ownerName} owns this chart`
                    : 'Someone else owns this chart';
            }
        }
    }, true);

    console.log('Share tab initialized');
}

export { takeChartScreenshot, exportDataToCSV, initializeShareTab };
