/**
 * Data Tab - Display and edit raw chart data
 *
 * This module handles:
 * - Loading data from chartState.series for a selected date
 * - Displaying data in an editable table
 * - Updating data when user makes changes
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { createToast, createConfirmToast } from '../ui/toaster.js';
import { MISSING } from '../config.js';
import { isMissing } from '../util/format.js';
import { getFirstConfig } from './traceStyles.js';

// Track current state
let currentDataForDate = [];
let currentTimestampIndex = 0;

/**
 * Load and display data for the selected date
 */
export function loadDataForDate() {
    const dateInput = document.getElementById('entry-date');
    if (!dateInput) return;

    const selectedDate = new Date(dateInput.value);
    selectedDate.setHours(0, 0, 0, 0);

    // Get start and end of the selected day (in seconds)
    const startOfDay = Math.floor(selectedDate.getTime() / 1000);
    const endOfDay = startOfDay + (24 * 60 * 60);

    // Filter data for this date (preserve null for non-observations)
    currentDataForDate = [];
    for (let i = 0; i < chartState.series.xValues.length; i++) {
        const timestamp = chartState.series.xValues[i];
        if (timestamp >= startOfDay && timestamp < endOfDay) {
            const entry = {
                index: i,
                timestamp: timestamp,
                corrects: chartState.series.corrects[i],
                errors: chartState.series.errors[i],
                timing: chartState.series.timing[i],
                misc: {}
            };
            // Load dynamic misc series data
            Object.keys(chartState.series.misc).forEach(miscId => {
                entry.misc[miscId] = chartState.series.misc[miscId][i];
            });
            currentDataForDate.push(entry);
        }
    }

    // Reset to first entry
    currentTimestampIndex = 0;

    // Render the current entry
    renderCurrentEntry();
}

/**
 * Adjust which timestamp entry is shown
 * @param {number} offset - -1 for previous, +1 for next
 */
export function adjustTimestamp(offset) {
    if (currentDataForDate.length === 0) return;

    currentTimestampIndex += offset;

    // Wrap around
    if (currentTimestampIndex < 0) {
        currentTimestampIndex = currentDataForDate.length - 1;
    } else if (currentTimestampIndex >= currentDataForDate.length) {
        currentTimestampIndex = 0;
    }

    renderCurrentEntry();
}

/**
 * Render the currently selected entry
 */
function renderCurrentEntry() {
    const container = document.getElementById('data-entry-block');
    const timestampSelector = document.getElementById('timestamp-selector-container');
    const timestampDisplay = document.getElementById('current-timestamp-display');

    if (!container) return;

    // Clear existing content
    container.innerHTML = '';

    if (currentDataForDate.length === 0) {
        // Hide timestamp selector and show "no data" message
        if (timestampSelector) timestampSelector.style.display = 'none';
        container.innerHTML = '<div class="px-3 py-8 text-center text-gray-500 italic">No data available for this date</div>';
        return;
    }

    // Show timestamp selector
    if (timestampSelector) timestampSelector.style.display = 'block';

    // Hide arrows if only one entry
    const timestampPrevBtn = document.querySelector('[data-action="adjust-timestamp"][data-offset="-1"]');
    const timestampNextBtn = document.querySelector('[data-action="adjust-timestamp"][data-offset="1"]');
    const singleEntry = currentDataForDate.length === 1;

    if (timestampPrevBtn) {
        timestampPrevBtn.style.display = singleEntry ? 'none' : '';
    }
    if (timestampNextBtn) {
        timestampNextBtn.style.display = singleEntry ? 'none' : '';
    }

    // Get current entry
    const point = currentDataForDate[currentTimestampIndex];

    // Convert timestamp to readable time
    const date = new Date(point.timestamp * 1000);
    const timeString = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    // Update timestamp display - only show count if multiple entries
    if (timestampDisplay) {
        timestampDisplay.textContent = singleEntry
            ? timeString
            : `${timeString} (${currentTimestampIndex + 1} of ${currentDataForDate.length})`;
    }

    // Timing is stored in chartState.series.timing[] as total MINUTES
    // Convert back to hours, minutes, seconds for display
    const totalMinutes = point.timing;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    const seconds = Math.round((totalMinutes % 1) * 60);

    // Display values - empty string for missing (non-observations)
    const correctsValue = isMissing(point.corrects) ? '' : point.corrects;
    const errorsValue = isMissing(point.errors) ? '' : point.errors;
    const hoursValue = isMissing(hours) ? '' : hours;
    const minutesValue = isMissing(minutes) ? '' : minutes;
    const secondsValue = isMissing(seconds) ? '' : seconds;

    // Get sorted misc series IDs
    const miscIds = Object.keys(chartState.series.misc).sort((a, b) =>
        parseInt(a.slice(4)) - parseInt(b.slice(4))
    );

    // Generate misc fields HTML
    let miscFieldsHtml = '';
    if (miscIds.length > 0) {
        miscFieldsHtml = '<div class="mb-6 grid grid-cols-2 gap-4">';
        miscIds.forEach(miscId => {
            const config = getFirstConfig(miscId, true);
            const label = config?.seriesName || miscId;
            const value = isMissing(point.misc[miscId]) ? '' : point.misc[miscId];
            miscFieldsHtml += `
                <div>
                    <label class="block text-sm font-semibold text-gray-600 mb-2 text-center">${label}</label>
                    <input type="text" inputmode="numeric" pattern="[0-9]*"
                           value="${value}"
                           class="w-full px-3 py-3 text-lg border-2 border-gray-300 rounded focus:outline-none transition-colors text-center"
                           data-field="${miscId}"
                           placeholder=""
                           oninput="this.value=this.value.replace(/[^0-9]/g,'')">
                </div>
            `;
        });
        miscFieldsHtml += '</div>';
    }

    const block = document.createElement('div');
    block.dataset.index = point.index;

    block.innerHTML = `
        <div class="p-4 sm:p-6 w-full max-w-sm mx-auto">
            <!-- Corrects and Errors -->
            <div class="mb-6 grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-gray-600 mb-2 text-center">Corrects</label>
                    <input type="text" inputmode="numeric" pattern="[0-9]*"
                           value="${correctsValue}"
                           class="w-full px-3 py-3 text-lg border-2 border-gray-300 rounded focus:outline-none transition-colors text-center"
                           data-field="corrects"
                           placeholder=""
                           oninput="this.value=this.value.replace(/[^0-9]/g,'')">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-600 mb-2 text-center">Errors</label>
                    <input type="text" inputmode="numeric" pattern="[0-9]*"
                           value="${errorsValue}"
                           class="w-full px-3 py-3 text-lg border-2 border-gray-300 rounded focus:outline-none transition-colors text-center"
                           data-field="errors"
                           placeholder=""
                           oninput="this.value=this.value.replace(/[^0-9]/g,'')">
                </div>
            </div>

            <!-- Dynamic Misc Series -->
            ${miscFieldsHtml}

            <!-- Timing -->
            <div class="mb-6">
                <label class="block text-sm font-semibold text-gray-600 mb-2 text-center">Timing</label>
                <div class="grid grid-cols-3 gap-4">
                    <div>
                        <label class="block text-xs text-gray-500 mb-1 text-center">Hour</label>
                        <input type="text" inputmode="numeric" pattern="[0-9]*"
                               value="${hoursValue}"
                               class="w-full px-2 py-3 text-lg border-2 border-gray-300 rounded focus:outline-none transition-colors text-center"
                               data-field="hours"
                               placeholder=""
                               oninput="this.value=this.value.replace(/[^0-9]/g,'')">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1 text-center">Min</label>
                        <input type="text" inputmode="numeric" pattern="[0-9]*"
                               value="${minutesValue}"
                               class="w-full px-2 py-3 text-lg border-2 border-gray-300 rounded focus:outline-none transition-colors text-center"
                               data-field="minutes"
                               placeholder=""
                               oninput="this.value=this.value.replace(/[^0-9]/g,'')">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1 text-center">Sec</label>
                        <input type="text" inputmode="numeric" pattern="[0-9]*"
                               value="${secondsValue}"
                               class="w-full px-2 py-3 text-lg border-2 border-gray-300 rounded focus:outline-none transition-colors text-center"
                               data-field="seconds"
                               placeholder=""
                               oninput="this.value=this.value.replace(/[^0-9]/g,'')">
                    </div>
                </div>
            </div>
        </div>
    `;

    container.appendChild(block);
}

/**
 * Update the current entry with values from the input fields
 */
export function updateCurrentEntry() {
    if (currentDataForDate.length === 0) return;

    const point = currentDataForDate[currentTimestampIndex];
    const container = document.getElementById('data-entry-block');
    if (!container) return;

    // Get values from input fields — parseInt returns NaN for empty, convert to MISSING
    const parseOrMissing = (el) => { const n = parseInt(el.value); return isNaN(n) ? MISSING : n; };
    const corrects = parseOrMissing(container.querySelector('[data-field="corrects"]'));
    const errors = parseOrMissing(container.querySelector('[data-field="errors"]'));
    const hours = parseOrMissing(container.querySelector('[data-field="hours"]'));
    const minutes = parseOrMissing(container.querySelector('[data-field="minutes"]'));
    const seconds = parseOrMissing(container.querySelector('[data-field="seconds"]'));

    // Convert timing back to total minutes (same as dataEntry.js)
    const timingMinutes = (hours || 0) * 60 + (minutes || 0) + (seconds || 0) / 60;

    // Update chartState.series at the original index
    const dataIndex = point.index;
    chartState.series.corrects[dataIndex] = corrects;
    chartState.series.errors[dataIndex] = errors;
    chartState.series.timing[dataIndex] = timingMinutes;

    // Update dynamic misc series
    Object.keys(chartState.series.misc).forEach(miscId => {
        const input = container.querySelector(`[data-field="${miscId}"]`);
        if (input) {
            const value = parseOrMissing(input);
            chartState.series.misc[miscId][dataIndex] = value;
            currentDataForDate[currentTimestampIndex].misc[miscId] = value;
        }
    });

    // Update local copy
    currentDataForDate[currentTimestampIndex].corrects = corrects;
    currentDataForDate[currentTimestampIndex].errors = errors;
    currentDataForDate[currentTimestampIndex].timing = timingMinutes;

    // Refresh the chart to show updated data
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);

    // Show success toast
    createToast({
        message: 'Entry updated successfully',
        duration: 2000,
        position: 'top-right'
    });

    console.log('Entry updated at index:', dataIndex);
}

/**
 * Delete the current entry
 */
export function deleteCurrentEntry() {
    if (currentDataForDate.length === 0) return;

    const point = currentDataForDate[currentTimestampIndex];
    const date = new Date(point.timestamp * 1000);
    const timeString = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    // Show confirmation toast
    createConfirmToast({
        message: `Delete entry at ${timeString}?`,
        yesLabel: 'Delete',
        noLabel: 'Cancel',
        primaryColor: '#ef4444',  // Red color for delete action
        position: 'top-right',
        onYes: () => {
            const dataIndex = point.index;

            // Remove from chartState.series
            chartState.series.xValues.splice(dataIndex, 1);
            chartState.series.corrects.splice(dataIndex, 1);
            chartState.series.errors.splice(dataIndex, 1);
            chartState.series.timing.splice(dataIndex, 1);

            // Remove from dynamic misc series
            Object.keys(chartState.series.misc).forEach(miscId => {
                chartState.series.misc[miscId].splice(dataIndex, 1);
            });

            // Remove from local array
            currentDataForDate.splice(currentTimestampIndex, 1);

            // Adjust indices in remaining local data (since we removed an item from chartState.series)
            for (let i = 0; i < currentDataForDate.length; i++) {
                if (currentDataForDate[i].index > dataIndex) {
                    currentDataForDate[i].index--;
                }
            }

            // Adjust current index if needed
            if (currentTimestampIndex >= currentDataForDate.length && currentDataForDate.length > 0) {
                currentTimestampIndex = currentDataForDate.length - 1;
            }

            // Re-render
            renderCurrentEntry();

            // Refresh the chart to show updated data
            eventBus.emit(EVENTS.DATA_CHART_REFRESH);

            // Show success toast
            createToast({
                message: 'Entry deleted successfully',
                duration: 2000,
                position: 'top-right'
            });

            console.log('Entry deleted at index:', dataIndex);
        },
        onNo: () => {
            // User cancelled - do nothing
            console.log('Delete cancelled');
        }
    });
}

/**
 * Initialize event subscriptions
 */
export function init() {
    // Load data when switching to "previous" sub-tab
    eventBus.subscribe(EVENTS.NAV_DATA_SUBTAB_SWITCH, (data) => {
        if (data.subtab === 'previous') {
            loadDataForDate();
        }
    }, true);

    // Also reload when entry date changes while on previous sub-tab
    eventBus.subscribe(EVENTS.COUNTER_ENTRY_DATE_CHANGED, () => {
        const previousPane = document.getElementById('previous-subpane');
        if (previousPane && previousPane.classList.contains('active')) {
            loadDataForDate();
        }
    });
}

console.log('dataUpdate.js loaded');
