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

// Shape name for the entry date indicator line
const ENTRY_DATE_INDICATOR_NAME = 'entry-date-indicator';

// Timer for auto-hiding the indicator
let indicatorTimer = null;
const INDICATOR_TIMEOUT = 5000; // 5 seconds

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

// ============================================================================
// ENTRY DATE INDICATOR LINE
// ============================================================================

/**
 * Convert a date string (YYYY-MM-DD) to an x-position on the chart
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {number} X-position (days from startDate)
 */
function dateToXPosition(dateString) {
    if (!chartState.startDate) return 0;

    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);

    const startDate = new Date(chartState.startDate);
    startDate.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor((date - startDate) / (1000 * 60 * 60 * 24));
    return daysDiff;
}

/**
 * Draw or update the entry date indicator line on the chart
 * @param {string} dateString - Date in YYYY-MM-DD format
 */
function updateEntryDateIndicator(dateString) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartDiv.layout) return;

    const xPos = dateToXPosition(dateString);

    // Get current shapes, filter out any existing indicator
    const currentShapes = (chartDiv.layout.shapes || []).filter(
        shape => shape.name !== ENTRY_DATE_INDICATOR_NAME
    );

    // Create the new indicator line
    const indicatorLine = {
        name: ENTRY_DATE_INDICATOR_NAME,
        type: 'line',
        x0: xPos,
        x1: xPos,
        y0: 0,
        y1: 1,
        yref: 'paper',
        opacity: 0.25,
        line: {
            color: '#9333ea',  // Purple
            width: 3
        }
    };

    // Update the chart with the new shapes
    Plotly.relayout(chartDiv, {
        shapes: [...currentShapes, indicatorLine]
    });

    // Reset timer - clear existing and start new
    if (indicatorTimer) {
        clearTimeout(indicatorTimer);
    }
    indicatorTimer = setTimeout(() => {
        removeEntryDateIndicator();
    }, INDICATOR_TIMEOUT);
}

/**
 * Remove the entry date indicator line from the chart
 */
function removeEntryDateIndicator() {
    // Clear timer if running
    if (indicatorTimer) {
        clearTimeout(indicatorTimer);
        indicatorTimer = null;
    }

    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartDiv.layout) return;

    // Filter out the indicator line
    const currentShapes = (chartDiv.layout.shapes || []).filter(
        shape => shape.name !== ENTRY_DATE_INDICATOR_NAME
    );

    Plotly.relayout(chartDiv, {
        shapes: currentShapes
    });
}

/**
 * Emit entry date change event based on current input value
 */
function emitEntryDateChange() {
    const entryDateInput = document.getElementById('entry-date');
    if (entryDateInput && entryDateInput.value) {
        eventBus.emit(EVENTS.COUNTER_ENTRY_DATE_CHANGED, { date: entryDateInput.value });
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

    // ========================================================================
    // Entry date indicator subscriptions
    // ========================================================================

    // Show indicator when counter overlay opens
    eventBus.subscribe(EVENTS.COUNTER_SHOW, () => {
        const entryDateInput = document.getElementById('entry-date');
        if (entryDateInput && entryDateInput.value) {
            updateEntryDateIndicator(entryDateInput.value);
        }
    });

    // Hide indicator when counter overlay closes
    eventBus.subscribe(EVENTS.COUNTER_HIDE, () => {
        removeEntryDateIndicator();
    });

    // Handle tab switching - show only on data tab
    eventBus.subscribe(EVENTS.NAV_TAB_SWITCH, (data) => {
        if (data.tab === 'data') {
            const entryDateInput = document.getElementById('entry-date');
            if (entryDateInput && entryDateInput.value) {
                updateEntryDateIndicator(entryDateInput.value);
            }
        } else {
            removeEntryDateIndicator();
        }
    }, true);

    // Update indicator when entry date changes
    eventBus.subscribe(EVENTS.COUNTER_ENTRY_DATE_CHANGED, (data) => {
        updateEntryDateIndicator(data.date);
    }, true);

    // Set up entry-date input listeners
    const entryDateInput = document.getElementById('entry-date');
    if (entryDateInput) {
        // Listen for direct input changes (calendar picker)
        entryDateInput.addEventListener('change', emitEntryDateChange);
    }

    // Listen for arrow button clicks (they adjust the date, then we emit)
    document.querySelectorAll('[data-action="adjust-date"]').forEach(button => {
        button.addEventListener('click', () => {
            // Small delay to let the date input update first
            setTimeout(emitEntryDateChange, 10);
        });
    });
}

export {
    submitEntry,
    setStartDate,
    generateMiscInputs,
    updateTimingVisibility,
    init
};

console.log('dataEntry.js loaded');
