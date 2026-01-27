/**
 * Data Entry Operations
 *
 * This module handles:
 * - Submitting new data entries to the chart
 * - Setting the chart start date
 * - Generating dynamic misc series input fields
 *
 * Emits events instead of calling peer modules directly.
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';

/**
 * Generate input fields for all active misc series
 */
function generateMiscInputs() {
    const container = document.getElementById('misc-inputs-container');
    if (!container) return;

    container.innerHTML = '';

    // Get sorted misc series IDs
    const miscIds = Object.keys(chartState.series.misc).sort((a, b) =>
        parseInt(a.slice(4)) - parseInt(b.slice(4))
    );

    if (miscIds.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'grid';

    miscIds.forEach(miscId => {
        const config = chartState.traceStyles.misc[miscId]?.raw;
        const label = config?.seriesName || miscId;

        const div = document.createElement('div');
        div.innerHTML = `
            <label id="${miscId}-series-label" class="block text-sm font-semibold text-gray-600 mb-2 text-center" for="${miscId}">${label}</label>
            <input type="text" inputmode="numeric" pattern="[0-9]*" id="${miscId}"
                   class="w-full px-3 py-3 text-lg border-2 border-gray-300 rounded focus:outline-none transition-colors text-center"
                   placeholder=""
                   oninput="this.value=this.value.replace(/[^0-9]/g,'')">
        `;
        container.appendChild(div);
    });
}

/**
 * Submit a new data entry from the counter form
 * Emits: DATA_ENTRY_SUBMITTED, DATA_CHART_REFRESH
 *
 * For minute charts: validates timing input and calculates timing in minutes
 * For non-minute charts: skips timing validation and uses timing of 1
 */
function submitEntry() {
    const entryDate = document.getElementById('entry-date').value;
    const corrects = parseInt(document.getElementById('corrects').value);
    const incorrects = parseInt(document.getElementById('incorrects').value);

    let timingMinutes;

    if (chartState.minuteChart) {
        // Minute chart: validate and calculate timing
        const hours = parseInt(document.getElementById('hours').value);
        const minutes = parseInt(document.getElementById('minutes').value);
        const seconds = parseInt(document.getElementById('seconds').value);

        // Validation: At least one timing field must have an integer value
        const hasHours = !isNaN(hours) && hours >= 0;
        const hasMinutes = !isNaN(minutes) && minutes >= 0;
        const hasSeconds = !isNaN(seconds) && seconds >= 0;

        const timingLabel = document.getElementById('timing-series-label');

        if (!hasHours && !hasMinutes && !hasSeconds) {
            timingLabel.style.color = '#ef4444';
            return;
        }

        timingLabel.style.color = '';

        // Calculate total timing in minutes
        timingMinutes = (hours || 0) * 60 + (minutes || 0) + (seconds || 0) / 60;
    } else {
        // Non-minute chart: use timing of 1 (raw counts)
        timingMinutes = 1;
    }

    // Emit event to hide counter - navigation subscribes to this
    eventBus.emit(EVENTS.DATA_ENTRY_SUBMITTED);

    // Combine selected date with current time to create Unix timestamp
    const now = new Date();
    const selectedDate = new Date(entryDate);
    selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    const timestamp = Math.floor(selectedDate.getTime() / 1000);

    // Append data points to fixed series arrays
    chartState.series.xValues.push(timestamp);
    chartState.series.corrects.push(corrects);
    chartState.series.errors.push(incorrects);
    chartState.series.timing.push(timingMinutes);

    // Append data points to dynamic misc series
    Object.keys(chartState.series.misc).forEach(miscId => {
        const input = document.getElementById(miscId);
        const value = input ? parseInt(input.value) : NaN;
        chartState.series.misc[miscId].push(value);

        // Clear the input
        if (input) input.value = '';
    });

    // Clear fixed counter fields (but not timing fields)
    document.getElementById('corrects').value = '';
    document.getElementById('incorrects').value = '';

    // Emit event to refresh chart - replot subscribes to this
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
}

/**
 * Set the chart start date and refresh
 * @param {Date} newStartDate - The new start date
 */
function setStartDate(newStartDate) {
    chartState.startDate = newStartDate;
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
}

/**
 * Update timing section visibility based on chart type
 * Called after chartState.minuteChart is set
 */
function updateTimingVisibility() {
    const timingSection = document.getElementById('timing-series-label')?.parentElement;
    if (timingSection) {
        timingSection.style.display = chartState.minuteChart ? '' : 'none';
    }
}

/**
 * Initialize subscriptions for this module
 * Called by main.js coordinator
 */
function init() {
    // Subscribe to start date change events from dates.js
    eventBus.subscribe(EVENTS.DATA_START_DATE_CHANGED, (data) => {
        setStartDate(data.date);
    }, true);

    // Subscribe to misc series changes to regenerate input fields
    eventBus.subscribe(EVENTS.MISC_SERIES_ADDED, () => {
        generateMiscInputs();
    });

    eventBus.subscribe(EVENTS.MISC_SERIES_REMOVED, () => {
        generateMiscInputs();
    });

    // Generate initial misc inputs
    generateMiscInputs();
}

export {
    submitEntry,
    setStartDate,
    generateMiscInputs,
    updateTimingVisibility,
    init
};

console.log('dataEntry.js loaded');
