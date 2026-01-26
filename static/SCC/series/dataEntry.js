/**
 * Data Entry Operations
 *
 * This module handles:
 * - Submitting new data entries to the chart
 * - Setting the chart start date
 *
 * Emits events instead of calling peer modules directly.
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';

/**
 * Submit a new data entry from the counter form
 * Emits: DATA_ENTRY_SUBMITTED, DATA_CHART_REFRESH
 */
function submitEntry() {
    const entryDate = document.getElementById('entry-date').value;
    const corrects = parseInt(document.getElementById('corrects').value);
    const incorrects = parseInt(document.getElementById('incorrects').value);
    const misc1 = parseInt(document.getElementById('misc1').value);
    const misc2 = parseInt(document.getElementById('misc2').value);
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

    // Emit event to hide counter - navigation subscribes to this
    eventBus.emit(EVENTS.DATA_ENTRY_SUBMITTED);

    // Combine selected date with current time to create Unix timestamp
    const now = new Date();
    const selectedDate = new Date(entryDate);
    selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    const timestamp = Math.floor(selectedDate.getTime() / 1000);

    // Calculate total timing in minutes
    const timingMinutes = (hours || 0) * 60 + (minutes || 0) + (seconds || 0) / 60;

    // Append data points to arrays
    chartState.series.timestamps.push(timestamp);
    chartState.series.corrects.push(corrects);
    chartState.series.errors.push(incorrects);
    chartState.series.timing.push(timingMinutes);
    chartState.series.misc1.push(misc1);
    chartState.series.misc2.push(misc2);

    // Clear counter fields (but not timing fields)
    document.getElementById('corrects').value = '';
    document.getElementById('incorrects').value = '';
    document.getElementById('misc1').value = '';
    document.getElementById('misc2').value = '';

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
 * Initialize subscriptions for this module
 * Called by main.js coordinator
 */
function init() {
    // Subscribe to start date change events from dates.js
    eventBus.subscribe(EVENTS.DATA_START_DATE_CHANGED, (data) => {
        setStartDate(data.date);
    }, true);
}

export {
    submitEntry,
    setStartDate,
    init
};

console.log('dataEntry.js loaded');
