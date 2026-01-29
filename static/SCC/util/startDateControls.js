/**
 * Start Date Controls - Custom spinbox UI for setting chart start date
 *
 * Shows different inputs based on chartState.chartType:
 * - Daily: Monday dropdown + Month spinbox + Year spinbox
 * - Weekly: Month spinbox + Year spinbox
 * - Monthly: Year spinbox only
 * - Yearly: Decade spinbox (step 10)
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { createToast } from './toaster.js';

// Current values stored here for easy access
let currentValues = {
    monday: 1,
    month: 1,
    year: 2025,
    decade: 2020,
    availableMondays: []
};

/**
 * Get all Mondays in a given month/year
 * @param {number} year - Full year (e.g., 2025)
 * @param {number} month - Month 1-12
 * @returns {number[]} Array of day numbers that are Mondays (e.g., [6, 13, 20, 27])
 */
function getMondaysInMonth(year, month) {
    const mondays = [];
    // Get last day of month using a temp date
    const tempDate = new Date(2000, month, 0);
    tempDate.setFullYear(year);
    const lastDay = tempDate.getDate();

    for (let day = 1; day <= lastDay; day++) {
        const date = new Date(2000, month - 1, day);
        date.setFullYear(year);
        if (date.getDay() === 1) { // 1 = Monday
            mondays.push(day);
        }
    }

    return mondays;
}

/**
 * Format year for display with BC/AD
 * Internal: 1 = 1 AD, 0 = 1 BC, -1 = 2 BC
 */
function formatYearDisplay(internalYear) {
    if (internalYear >= 1) {
        return `${internalYear} AD`;
    } else {
        return `${1 - internalYear} BC`;
    }
}

/**
 * Parse year input that may contain BC/AD
 * Returns internal year number
 */
function parseYearInput(input) {
    const str = input.toString().trim().toUpperCase();
    const bcMatch = str.match(/^(\d+)\s*BC$/);
    const adMatch = str.match(/^(\d+)\s*AD$/);

    if (bcMatch) {
        // "X BC" → internal = 1 - X
        return 1 - parseInt(bcMatch[1]);
    } else if (adMatch) {
        // "X AD" → internal = X
        return parseInt(adMatch[1]);
    } else {
        // Plain number - treat as AD if positive
        const num = parseInt(str);
        return isNaN(num) ? null : num;
    }
}

/**
 * Update the display for a spinbox (works with both div and input elements)
 */
function updateDisplay(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.dataset.value = value;

        // Format year with BC/AD
        let displayValue = value;
        if (id === 'start-year') {
            displayValue = formatYearDisplay(value);
        }

        // Handle both input elements and div elements
        if (el.tagName === 'INPUT') {
            el.value = displayValue;
        } else {
            el.textContent = displayValue;
        }
    }
}

/**
 * Update Monday display and available mondays list
 */
function updateMondayControl() {
    currentValues.availableMondays = getMondaysInMonth(currentValues.year, currentValues.month);

    // Ensure current monday is valid for this month
    if (!currentValues.availableMondays.includes(currentValues.monday)) {
        currentValues.monday = currentValues.availableMondays[0] || 1;
    }

    updateDisplay('start-monday', currentValues.monday);
}

/**
 * Increment/decrement Monday (cycles through available Mondays)
 */
function adjustMonday(delta) {
    const mondays = currentValues.availableMondays;
    if (mondays.length === 0) return;

    const currentIndex = mondays.indexOf(currentValues.monday);
    let newIndex = currentIndex + delta;

    // Wrap around
    if (newIndex < 0) newIndex = mondays.length - 1;
    if (newIndex >= mondays.length) newIndex = 0;

    currentValues.monday = mondays[newIndex];
    updateDisplay('start-monday', currentValues.monday);
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
        // Skip year 0 (doesn't exist in historical calendar)
        if (currentValues.year === 0) currentValues.year = -1;
        updateDisplay('start-year', currentValues.year);
    } else if (newMonth > 12) {
        newMonth = 1;
        currentValues.year++;
        // Skip year 0 (doesn't exist in historical calendar)
        if (currentValues.year === 0) currentValues.year = 1;
        updateDisplay('start-year', currentValues.year);
    }

    currentValues.month = newMonth;
    updateDisplay('start-month', currentValues.month);

    // Update available Mondays for Daily charts
    if (chartState.chartType.toLowerCase() === 'daily') {
        updateMondayControl();
    }

    handleStartDateChange();
}

/**
 * Adjust year
 */
function adjustYear(delta) {
    let newYear = currentValues.year + delta;

    // Skip year 0 (doesn't exist in historical calendar)
    if (newYear === 0) newYear = delta > 0 ? 1 : -1;

    if (newYear < -9999) newYear = -9999;
    if (newYear > 9999) newYear = 9999;

    currentValues.year = newYear;
    updateDisplay('start-year', currentValues.year);

    // Update available Mondays for Daily charts
    if (chartState.chartType.toLowerCase() === 'daily') {
        updateMondayControl();
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
        // Find the previous Monday from internal date (ISO 8601)
        const dayOfWeek = internalDate.getDay();
        const mondayDate = new Date(internalDate);
        // getDay(): 0=Sun, 1=Mon, ..., 6=Sat
        // Days to subtract: Mon(1)->0, Tue(2)->1, ..., Sun(0)->6
        const daysToSubtract = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
        if (daysToSubtract > 0) {
            mondayDate.setDate(internalDate.getDate() - daysToSubtract);
        }

        return {
            monday: mondayDate.getDate(),
            month: mondayDate.getMonth() + 1,
            year: mondayDate.getFullYear()
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
 * Create a Date object with correct year handling
 * (JavaScript Date treats years 0-99 as 1900-1999, so we use setFullYear)
 */
function createDate(year, month, day) {
    const date = new Date(2000, month, day);
    date.setFullYear(year);
    return date;
}

/**
 * Convert user-selected values back to internal date
 */
function userToInternalDate() {
    const chartType = chartState.chartType.toLowerCase();

    if (chartType === 'daily') {
        // Selected Monday is the start date
        return createDate(currentValues.year, currentValues.month - 1, currentValues.monday);
    } else if (chartType === 'weekly') {
        // First day of following month
        return createDate(currentValues.year, currentValues.month, 1);
    } else if (chartType === 'monthly') {
        // January 1st of following year
        return createDate(currentValues.year + 1, 0, 1);
    } else if (chartType === 'yearly') {
        // January 1st of decade + 9
        return createDate(currentValues.decade + 9, 0, 1);
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
            label.textContent = 'Start Date (Monday)';
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

    const mondayRow = document.getElementById('start-monday-row');
    const monthRow = document.getElementById('start-month-row');
    const yearRow = document.getElementById('start-year-row');
    const decadeRow = document.getElementById('start-decade-row');

    // Hide all first
    [mondayRow, monthRow, yearRow, decadeRow].forEach(row => {
        if (row) row.style.display = 'none';
    });

    // Show based on chart type
    switch (chartType) {
        case 'daily':
            if (mondayRow) mondayRow.style.display = 'flex';
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
        currentValues.monday = values.monday;

        updateDisplay('start-month', currentValues.month);
        updateDisplay('start-year', currentValues.year);
        updateMondayControl();
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
 * Handle direct year input change
 */
function handleYearInput(e) {
    let newYear = parseYearInput(e.target.value);

    if (newYear === null) return;

    // Skip year 0 (doesn't exist in historical calendar)
    if (newYear === 0) newYear = 1;

    // Clamp to valid range
    if (newYear < -9999) newYear = -9999;
    if (newYear > 9999) newYear = 9999;

    currentValues.year = newYear;
    e.target.value = formatYearDisplay(newYear);

    // Update available Mondays for Daily charts
    if (chartState.chartType.toLowerCase() === 'daily') {
        updateMondayControl();
    }

    handleStartDateChange();
}

/**
 * Handle direct decade input change
 */
function handleDecadeInput(e) {
    let newDecade = parseInt(e.target.value);

    if (isNaN(newDecade)) return;

    // Round to nearest decade
    newDecade = Math.round(newDecade / 10) * 10;

    // Clamp to valid range
    if (newDecade < 1600) newDecade = 1600;
    if (newDecade > 2300) newDecade = 2300;

    currentValues.decade = newDecade;
    e.target.value = newDecade;

    handleStartDateChange();
}

/**
 * Set up event listeners for arrow buttons and direct input
 */
function setupEventListeners() {
    // Monday arrows
    document.querySelector('[data-action="start-monday-dec"]')?.addEventListener('click', () => adjustMonday(-1));
    document.querySelector('[data-action="start-monday-inc"]')?.addEventListener('click', () => adjustMonday(1));

    // Month arrows
    document.querySelector('[data-action="start-month-dec"]')?.addEventListener('click', () => adjustMonth(-1));
    document.querySelector('[data-action="start-month-inc"]')?.addEventListener('click', () => adjustMonth(1));

    // Year arrows
    document.querySelector('[data-action="start-year-dec"]')?.addEventListener('click', () => adjustYear(-1));
    document.querySelector('[data-action="start-year-inc"]')?.addEventListener('click', () => adjustYear(1));

    // Year direct input
    const yearInput = document.getElementById('start-year');
    if (yearInput) {
        yearInput.addEventListener('change', handleYearInput);
    }

    // Decade arrows
    document.querySelector('[data-action="start-decade-dec"]')?.addEventListener('click', () => adjustDecade(-1));
    document.querySelector('[data-action="start-decade-inc"]')?.addEventListener('click', () => adjustDecade(1));

    // Decade direct input
    const decadeInput = document.getElementById('start-decade');
    if (decadeInput) {
        decadeInput.addEventListener('change', handleDecadeInput);
    }
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

export { getMondaysInMonth };

console.log('startDateControls.js loaded');
