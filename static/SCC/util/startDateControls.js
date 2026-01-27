/**
 * Start Date Controls - Custom spinbox UI for setting chart start date
 *
 * Shows different inputs based on chartState.chartType:
 * - Daily: Sunday dropdown + Month spinbox + Year spinbox
 * - Weekly: Month spinbox + Year spinbox
 * - Monthly: Year spinbox only
 * - Yearly: Decade spinbox (step 10)
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { createToast } from './toaster.js';

// Current values stored here for easy access
let currentValues = {
    sunday: 1,
    month: 1,
    year: 2025,
    decade: 2020,
    availableSundays: []
};

/**
 * Get all Sundays in a given month/year
 * @param {number} year - Full year (e.g., 2025)
 * @param {number} month - Month 1-12
 * @returns {number[]} Array of day numbers that are Sundays (e.g., [5, 12, 19, 26])
 */
function getSundaysInMonth(year, month) {
    const sundays = [];
    const lastDay = new Date(year, month, 0).getDate();

    for (let day = 1; day <= lastDay; day++) {
        const date = new Date(year, month - 1, day);
        if (date.getDay() === 0) {
            sundays.push(day);
        }
    }

    return sundays;
}

/**
 * Update the display for a spinbox
 */
function updateDisplay(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.dataset.value = value;
        el.textContent = value;
    }
}

/**
 * Update Sunday display and available sundays list
 */
function updateSundayControl() {
    currentValues.availableSundays = getSundaysInMonth(currentValues.year, currentValues.month);

    // Ensure current sunday is valid for this month
    if (!currentValues.availableSundays.includes(currentValues.sunday)) {
        currentValues.sunday = currentValues.availableSundays[0] || 1;
    }

    updateDisplay('start-sunday', currentValues.sunday);
}

/**
 * Increment/decrement Sunday (cycles through available Sundays)
 */
function adjustSunday(delta) {
    const sundays = currentValues.availableSundays;
    if (sundays.length === 0) return;

    const currentIndex = sundays.indexOf(currentValues.sunday);
    let newIndex = currentIndex + delta;

    // Wrap around
    if (newIndex < 0) newIndex = sundays.length - 1;
    if (newIndex >= sundays.length) newIndex = 0;

    currentValues.sunday = sundays[newIndex];
    updateDisplay('start-sunday', currentValues.sunday);
    handleStartDateChange();
}

/**
 * Adjust month (1-12, wraps and adjusts year)
 */
function adjustMonth(delta) {
    let newMonth = currentValues.month + delta;

    if (newMonth < 1) {
        newMonth = 12;
        currentValues.year--;
        updateDisplay('start-year', currentValues.year);
    } else if (newMonth > 12) {
        newMonth = 1;
        currentValues.year++;
        updateDisplay('start-year', currentValues.year);
    }

    currentValues.month = newMonth;
    updateDisplay('start-month', currentValues.month);

    // Update available Sundays for Daily charts
    if (chartState.chartType.toLowerCase() === 'daily') {
        updateSundayControl();
    }

    handleStartDateChange();
}

/**
 * Adjust year (1679-2261)
 */
function adjustYear(delta) {
    let newYear = currentValues.year + delta;

    if (newYear < 1679) newYear = 1679;
    if (newYear > 2261) newYear = 2261;

    currentValues.year = newYear;
    updateDisplay('start-year', currentValues.year);

    // Update available Sundays for Daily charts
    if (chartState.chartType.toLowerCase() === 'daily') {
        updateSundayControl();
    }

    handleStartDateChange();
}

/**
 * Adjust decade (1600-2300, step 10)
 */
function adjustDecade(delta) {
    let newDecade = currentValues.decade + (delta * 10);

    if (newDecade < 1600) newDecade = 1600;
    if (newDecade > 2300) newDecade = 2300;

    currentValues.decade = newDecade;
    updateDisplay('start-decade', currentValues.decade);
    handleStartDateChange();
}

/**
 * Convert internal startDate to user-visible date components
 */
function internalToUserDate() {
    const internalDate = chartState.startDate;
    const chartType = chartState.chartType.toLowerCase();

    if (chartType === 'daily') {
        // Find the previous Sunday from internal date
        const dayOfWeek = internalDate.getDay();
        const sundayDate = new Date(internalDate);
        if (dayOfWeek !== 0) {
            sundayDate.setDate(internalDate.getDate() - dayOfWeek);
        }

        return {
            sunday: sundayDate.getDate(),
            month: sundayDate.getMonth() + 1,
            year: sundayDate.getFullYear()
        };
    } else if (chartType === 'weekly') {
        const prevMonth = new Date(internalDate);
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        prevMonth.setDate(1);

        return {
            month: prevMonth.getMonth() + 1,
            year: prevMonth.getFullYear()
        };
    } else if (chartType === 'monthly') {
        return {
            year: internalDate.getFullYear() - 1
        };
    } else if (chartType === 'yearly') {
        const year = internalDate.getFullYear();
        return {
            decade: year - (year % 10)
        };
    }

    return {};
}

/**
 * Convert user-selected values back to internal date
 */
function userToInternalDate() {
    const chartType = chartState.chartType.toLowerCase();

    if (chartType === 'daily') {
        // Selected Sunday + 1 day = Monday
        const sundayDate = new Date(currentValues.year, currentValues.month - 1, currentValues.sunday);
        const mondayDate = new Date(sundayDate);
        mondayDate.setDate(sundayDate.getDate() + 1);
        return mondayDate;
    } else if (chartType === 'weekly') {
        // First day of following month
        return new Date(currentValues.year, currentValues.month, 1);
    } else if (chartType === 'monthly') {
        // January 1st of following year
        return new Date(currentValues.year + 1, 0, 1);
    } else if (chartType === 'yearly') {
        // January 1st of decade + 9
        return new Date(currentValues.decade + 9, 0, 1);
    }

    return new Date();
}

/**
 * Handle any start date change
 */
function handleStartDateChange() {
    const newDate = userToInternalDate();
    eventBus.emit(EVENTS.DATA_START_DATE_CHANGED, { date: newDate });

    createToast({
        message: 'Start date updated',
        duration: 2000,
        position: 'top-right'
    });
}

/**
 * Update the label text based on chart type
 */
function updateLabel() {
    const label = document.getElementById('start-date-label');
    if (!label) return;

    const chartType = chartState.chartType.toLowerCase();

    switch (chartType) {
        case 'daily':
            label.textContent = 'Start Date (Sunday)';
            break;
        case 'weekly':
            label.textContent = 'Start Date (Month)';
            break;
        case 'monthly':
            label.textContent = 'Start Date (Year)';
            break;
        case 'yearly':
            label.textContent = 'Start Date (Decade)';
            break;
        default:
            label.textContent = 'Start Date';
    }
}

/**
 * Show/hide input rows based on chart type
 */
function updateVisibility() {
    const chartType = chartState.chartType.toLowerCase();

    const sundayRow = document.getElementById('start-sunday-row');
    const monthRow = document.getElementById('start-month-row');
    const yearRow = document.getElementById('start-year-row');
    const decadeRow = document.getElementById('start-decade-row');

    // Hide all first
    [sundayRow, monthRow, yearRow, decadeRow].forEach(row => {
        if (row) row.style.display = 'none';
    });

    // Show based on chart type
    switch (chartType) {
        case 'daily':
            if (sundayRow) sundayRow.style.display = 'flex';
            if (monthRow) monthRow.style.display = 'flex';
            if (yearRow) yearRow.style.display = 'flex';
            break;
        case 'weekly':
            if (monthRow) monthRow.style.display = 'flex';
            if (yearRow) yearRow.style.display = 'flex';
            break;
        case 'monthly':
            if (yearRow) yearRow.style.display = 'flex';
            break;
        case 'yearly':
            if (decadeRow) decadeRow.style.display = 'flex';
            break;
    }
}

/**
 * Set values from current chartState.startDate
 */
function setInputValues() {
    const values = internalToUserDate();
    const chartType = chartState.chartType.toLowerCase();

    if (chartType === 'daily') {
        currentValues.month = values.month;
        currentValues.year = values.year;
        currentValues.sunday = values.sunday;

        updateDisplay('start-month', currentValues.month);
        updateDisplay('start-year', currentValues.year);
        updateSundayControl();
    } else if (chartType === 'weekly') {
        currentValues.month = values.month;
        currentValues.year = values.year;

        updateDisplay('start-month', currentValues.month);
        updateDisplay('start-year', currentValues.year);
    } else if (chartType === 'monthly') {
        currentValues.year = values.year;
        updateDisplay('start-year', currentValues.year);
    } else if (chartType === 'yearly') {
        currentValues.decade = values.decade;
        updateDisplay('start-decade', currentValues.decade);
    }
}

/**
 * Set up event listeners for arrow buttons
 */
function setupEventListeners() {
    // Sunday arrows
    document.querySelector('[data-action="start-sunday-dec"]')?.addEventListener('click', () => adjustSunday(-1));
    document.querySelector('[data-action="start-sunday-inc"]')?.addEventListener('click', () => adjustSunday(1));

    // Month arrows
    document.querySelector('[data-action="start-month-dec"]')?.addEventListener('click', () => adjustMonth(-1));
    document.querySelector('[data-action="start-month-inc"]')?.addEventListener('click', () => adjustMonth(1));

    // Year arrows
    document.querySelector('[data-action="start-year-dec"]')?.addEventListener('click', () => adjustYear(-1));
    document.querySelector('[data-action="start-year-inc"]')?.addEventListener('click', () => adjustYear(1));

    // Decade arrows
    document.querySelector('[data-action="start-decade-dec"]')?.addEventListener('click', () => adjustDecade(-1));
    document.querySelector('[data-action="start-decade-inc"]')?.addEventListener('click', () => adjustDecade(1));
}

/**
 * Initialize start date controls
 */
export function initStartDateControls() {
    updateLabel();
    updateVisibility();
    setInputValues();
    setupEventListeners();

    console.log('startDateControls.js initialized for chart type:', chartState.chartType);
}

/**
 * Refresh the display (call when startDate changes externally)
 */
export function refreshStartDateDisplay() {
    setInputValues();
}

export { getSundaysInMonth };

console.log('startDateControls.js loaded');
