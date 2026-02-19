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
import { TIMING_MS, COLORS, CHART_MATH, MISSING } from '../config.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { snapToChartBoundary, xPositionToDate, dateToXPosition, dateToTimestamp, adjustDateByChartUnit } from '../util/dates.js';
import { relayout } from '../util/plotlyWrapper.js';
import { getFirstConfig } from './traceStyles.js';
import { getChartDiv, escapeHtml } from '../util/dom.js';

// Shape name for the entry date indicator line
const ENTRY_DATE_INDICATOR_NAME = 'entry-date-indicator';

// Timer for auto-hiding the indicator
let indicatorTimer = null;

// Track whether the Data tab is currently active (for click-to-set-date feature)
// Initialized in init() based on DOM state
let dataTabActive = false;

// Track whether line edit mode is active (disables click-to-set-date)
let lineEditModeActive = false;

// The selected entry date as a Date object, decoupled from the display
let selectedEntryDate = null;

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Update the entry-date display element with chart-type-appropriate formatting.
 * Stores the Date object in the module variable for use by submitEntry().
 *
 * Display adapts to chart type, omitting components fixed by snapping:
 * - Daily/Weekly: DD-Mon-YYYY (Weekly snaps to Monday, so specific date matters)
 * - Monthly: Mon-YYYY (day is always 1st)
 * - Yearly: YYYY (always Jan 1st)
 *
 * @param {Date} date - Snapped date to display and store
 */
function setEntryDate(date) {
    selectedEntryDate = date;
    const el = document.getElementById('entry-date');
    if (!el) return;

    const chartType = (chartState.chartType || 'Daily').toLowerCase();
    switch (chartType) {
        case 'yearly':
            el.textContent = `${date.getFullYear()}`;
            break;
        case 'monthly':
            el.textContent = `${MONTH_NAMES[date.getMonth()]}-${date.getFullYear()}`;
            break;
        default:
            el.textContent = `${date.getDate()}-${MONTH_NAMES[date.getMonth()]}-${date.getFullYear()}`;
    }
}

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
        const config = getFirstConfig(miscId, true);
        const label = config?.seriesName || miscId;

        const div = document.createElement('div');
        div.innerHTML = `
            <label id="${escapeHtml(miscId)}-series-label" class="block text-sm font-semibold text-gray-600 mb-2 text-center" for="${escapeHtml(miscId)}">${escapeHtml(label)}</label>
            <input type="text" inputmode="numeric" pattern="[0-9]*" id="${escapeHtml(miscId)}"
                   class="w-full px-3 py-3 text-lg border-2 border-gray-300 rounded focus:outline-none transition-colors text-center"
                   placeholder="">
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
    if (!selectedEntryDate) return;

    const rawC = parseInt(document.getElementById('corrects').value);
    const corrects = isNaN(rawC) ? MISSING : rawC;
    const rawI = parseInt(document.getElementById('incorrects').value);
    const incorrects = isNaN(rawI) ? MISSING : rawI;

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

    // Manual entry always uses timestamps (not raw x-positions)
    chartState.hasTimestamps = true;

    // Combine selected date with current time to create Unix timestamp
    const now = new Date();
    const dateForTimestamp = new Date(selectedEntryDate.getTime());
    dateForTimestamp.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    const timestamp = dateToTimestamp(dateForTimestamp);

    // Append data points to fixed series arrays
    chartState.series.xValues.push(timestamp);
    chartState.series.corrects.push(corrects);
    chartState.series.errors.push(incorrects);
    chartState.series.timing.push(timingMinutes);

    // Append data points to dynamic misc series
    Object.keys(chartState.series.misc).forEach(miscId => {
        const input = document.getElementById(miscId);
        const raw = input ? parseInt(input.value) : MISSING;
        const value = (typeof raw === 'number' && isNaN(raw)) ? MISSING : raw;
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
 * Draw or update the entry date indicator line on the chart
 * @param {string} dateString - Date in YYYY-MM-DD format
 */
async function updateEntryDateIndicator(dateString) {
    return;  // Disabled
    const chartDiv = getChartDiv();
    if (!chartDiv || !chartDiv.layout) return;

    const xPos = dateToXPosition(dateString);
    const shapes = chartDiv.layout.shapes || [];
    const index = shapes.findIndex(s => s.name === ENTRY_DATE_INDICATOR_NAME);

    if (index >= 0) {
        // Update existing indicator position
        await relayout(chartDiv, {
            [`shapes[${index}].x0`]: xPos,
            [`shapes[${index}].x1`]: xPos
        });
    } else {
        // Add new indicator at end
        await relayout(chartDiv, {
            [`shapes[${shapes.length}]`]: {
                name: ENTRY_DATE_INDICATOR_NAME,
                type: 'line',
                x0: xPos,
                x1: xPos,
                y0: 0,
                y1: 1,
                yref: 'paper',
                opacity: CHART_MATH.ENTRY_INDICATOR_OPACITY,
                line: { color: COLORS.ENTRY_INDICATOR, width: CHART_MATH.ENTRY_INDICATOR_WIDTH }
            }
        });
    }

    // Reset timer - clear existing and start new
    if (indicatorTimer) {
        clearTimeout(indicatorTimer);
    }
    indicatorTimer = setTimeout(() => {
        removeEntryDateIndicator();
    }, TIMING_MS.INDICATOR_TIMEOUT);
}

/**
 * Remove the entry date indicator line from the chart
 */
async function removeEntryDateIndicator() {
    // Clear timer if running
    if (indicatorTimer) {
        clearTimeout(indicatorTimer);
        indicatorTimer = null;
    }

    const chartDiv = getChartDiv();
    if (!chartDiv || !chartDiv.layout) return;

    await relayout(chartDiv, ENTRY_DATE_INDICATOR_NAME, true);
}

/**
 * Emit entry date change event based on current selected date.
 * Snaps the date to appropriate boundary based on chart type first.
 */
function emitEntryDateChange() {
    if (!selectedEntryDate) return;
    const snappedDate = snapToChartBoundary(selectedEntryDate);
    setEntryDate(snappedDate);
    eventBus.emit(EVENTS.COUNTER_ENTRY_DATE_CHANGED, { date: selectedEntryDate });
}

/**
 * Initialize subscriptions for this module
 * Called by main.js coordinator
 */
function init() {
    // Initialize dataTabActive based on current DOM state
    const dataTabContent = document.getElementById('data-content');
    dataTabActive = dataTabContent?.classList.contains('active') ?? false;

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

    // Regenerate inputs when chart is loaded from storage
    eventBus.subscribe(EVENTS.STORAGE_CHART_LOADED, () => {
        generateMiscInputs();
        updateTimingVisibility();
    }, true);

    // Generate initial misc inputs (may be empty if chart not yet loaded)
    generateMiscInputs();

    // Numeric-only filtering for the 5 static inputs (replaces inline oninput handlers)
    const numericFilter = (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); };
    ['corrects', 'incorrects', 'hours', 'minutes', 'seconds'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', numericFilter);
    });

    // Event delegation for dynamically generated misc series inputs
    document.getElementById('misc-inputs-container')?.addEventListener('input', (e) => {
        if (e.target.matches('input[inputmode="numeric"]')) {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        }
    });

    // ========================================================================
    // Entry date indicator subscriptions
    // ========================================================================

    // Track data tab state when counter overlay opens
    eventBus.subscribe(EVENTS.COUNTER_SHOW, () => {
        const dataTabContent = document.getElementById('data-content');
        dataTabActive = dataTabContent?.classList.contains('active') ?? false;
    });

    // Hide indicator when counter overlay closes
    eventBus.subscribe(EVENTS.COUNTER_HIDE, () => {
        removeEntryDateIndicator();
        dataTabActive = false;  // Disable click-to-set-date when menu closes
    });

    // Handle tab switching - track state and hide indicator when leaving data tab
    eventBus.subscribe(EVENTS.NAV_TAB_SWITCH, (data) => {
        dataTabActive = (data.tab === 'data');
        if (dataTabActive) {
            // Regenerate misc inputs when navigating to data tab
            generateMiscInputs();
        } else {
            removeEntryDateIndicator();
        }
    }, true);

    // Update indicator when entry date changes
    eventBus.subscribe(EVENTS.COUNTER_ENTRY_DATE_CHANGED, (data) => {
        updateEntryDateIndicator(data.date);
    }, true);

    // Track line edit mode to disable click-to-set-date
    eventBus.subscribe(EVENTS.NAV_LINE_CLICKABILITY_TOGGLE, (data) => {
        lineEditModeActive = data.enabled;
    }, true);

    // Handle chart clicks - update entry date when Data tab is active
    eventBus.subscribe(EVENTS.CHART_CLICKED, (data) => {
        if (!dataTabActive || !chartState.startDate || lineEditModeActive) return;

        // Convert x-position to date, snap to chart boundary
        const clickedDate = xPositionToDate(Math.round(data.x));
        const snappedDate = snapToChartBoundary(clickedDate);
        setEntryDate(snappedDate);
        eventBus.emit(EVENTS.COUNTER_ENTRY_DATE_CHANGED, { date: selectedEntryDate });
    }, true);

    // Listen for arrow button clicks - adjust date and update display
    document.querySelectorAll('[data-action="adjust-date"]').forEach(button => {
        button.addEventListener('click', () => {
            if (!selectedEntryDate) return;
            const offset = parseInt(button.dataset.offset);
            const newDate = adjustDateByChartUnit(selectedEntryDate, offset);
            setEntryDate(newDate);
            eventBus.emit(EVENTS.COUNTER_ENTRY_DATE_CHANGED, { date: selectedEntryDate });
        });
    });
}

/**
 * Get the currently selected entry date.
 * @returns {Date|null}
 */
function getEntryDate() {
    return selectedEntryDate;
}

export {
    submitEntry,
    setStartDate,
    setEntryDate,
    getEntryDate,
    generateMiscInputs,
    updateTimingVisibility,
    init
};
