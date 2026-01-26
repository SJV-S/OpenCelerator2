/**
 * Date Utilities - All date handling and conversion functions
 *
 * This module handles:
 * - Finding nearest Sunday
 * - Calculating start dates
 * - Converting timestamps to x-positions
 * - Converting x-positions back to dates
 * - Date formatting and display
 * - Updating chart date labels
 * - Date change UI handling
 *
 * Emits events instead of calling peer modules directly.
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { createToast } from './toaster.js';

/**
 * Find the nearest Sunday before (or at) a given date.
 * @param {Date} date - Single Date object
 * @returns {Date} The Sunday at or before the given date
 */
function findNearestSunday(date) {
    const daysSinceSunday = date.getDay();

    if (daysSinceSunday === 0) {
        return new Date(date);
    }

    const sundayDate = new Date(date);
    sundayDate.setDate(date.getDate() - daysSinceSunday);

    return sundayDate;
}

/**
 * Calculate and set the start date based on the earliest date in the provided array.
 * @param {Array<Date>} dates - Array of Date objects
 */
function calculateStartDate(dates) {
    const earliestDate = new Date(Math.min(...dates));

    let daysSinceSunday = earliestDate.getDay();
    if (daysSinceSunday === 0) {
        daysSinceSunday = 7;
    }

    chartState.startDate = new Date(earliestDate);
    chartState.startDate.setDate(earliestDate.getDate() - daysSinceSunday);

    return chartState.startDate;
}

/**
 * Convert timestamps to x-position coordinates based on days from start_date.
 * @param {Array<number>} timestamps - Array of Unix timestamps in seconds
 * @returns {Array<number>} Array of x-position coordinates (days from start_date)
 */
function timestampsToXPositions(timestamps) {
    if (!timestamps || timestamps.length === 0) {
        return [];
    }

    const dates = timestamps.map(timestamp => {
        const dt = new Date(timestamp * 1000);
        return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    });

    if (!chartState.startDate) {
        calculateStartDate(dates);
    }

    const xPositions = dates.map(date => {
        const daysDiff = Math.floor((date - chartState.startDate) / (1000 * 60 * 60 * 24));
        return daysDiff;
    });

    return xPositions;
}

/**
 * Convert a single x-position coordinate back to a date.
 * @param {number} xPosition - X-position coordinate (days from start_date)
 * @returns {Date} Date object corresponding to the x-position
 */
function xPositionToDate(xPosition) {
    const resultDate = new Date(chartState.startDate);
    resultDate.setDate(chartState.startDate.getDate() + xPosition);
    resultDate.setHours(0, 0, 0, 0);
    return resultDate;
}

/**
 * Update date annotations in chart with formatted dates based on startDate.
 * @param {HTMLElement} chartElement - Plotly chart element
 * @param {Date} startDate - The start date to use for formatting
 */
function updateChartDateLabels(chartElement, startDate) {
    if (!chartElement || !chartElement.layout || !chartElement.layout.annotations) {
        return;
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function formatDate(date) {
        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }

    chartElement.layout.annotations.forEach(annotation => {
        if (annotation.name && annotation.name.startsWith('date-text-')) {
            const idx = parseInt(annotation.name.replace('date-text-', ''));
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + (idx * 28));
            const formattedDate = formatDate(currentDate);
            annotation.text = `<u>${formattedDate}</u>`;
        }
    });

    Plotly.relayout(chartElement, {
        'annotations': chartElement.layout.annotations
    });
}

/**
 * Format a date as day-month(name)-year
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string (e.g., "15-Nov-2024")
 */
function formatDateDisplay(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * Update the visible date display element
 * @param {Date} date - Date to display
 */
function updateDateDisplay(date) {
    const displayElement = document.getElementById('other-date-display');
    if (displayElement) {
        displayElement.textContent = formatDateDisplay(date);
    }
}

/**
 * Handle date change in other tab - snap to nearest Sunday and emit event
 * Emits: DATA_START_DATE_CHANGED
 */
function handleOtherDateChange() {
    const otherDateInput = document.getElementById('other-date');
    const selectedDate = new Date(otherDateInput.value);
    const nearestSunday = findNearestSunday(selectedDate);
    const wasAdjusted = selectedDate.getDay() !== 0;
    otherDateInput.value = nearestSunday.toISOString().split('T')[0];

    updateDateDisplay(nearestSunday);

    // Emit event instead of calling setStartDate directly
    eventBus.emit(EVENTS.DATA_START_DATE_CHANGED, { date: nearestSunday });

    if (wasAdjusted) {
        createToast({
            message: 'Adjusted to nearest Sunday',
            duration: 2000,
            position: 'top-right'
        });
    } else {
        createToast({
            message: 'Start date updated successfully',
            duration: 2000,
            position: 'top-right'
        });
    }

    console.log('Start date updated to:', otherDateInput.value);
}

/**
 * Adjust a date input field by a number of days
 * @param {string} inputId - ID of the date input element
 * @param {number} days - Number of days to adjust
 */
function adjustDateInput(inputId, days) {
    const dateInput = document.getElementById(inputId);
    if (!dateInput) return;

    const currentDate = new Date(dateInput.value);
    currentDate.setDate(currentDate.getDate() + days);
    dateInput.value = currentDate.toISOString().split('T')[0];
}

/**
 * Initialize a date input field to today's date
 * @param {string} inputId - ID of the date input element
 */
function initializeDateInput(inputId) {
    const dateInput = document.getElementById(inputId);
    if (!dateInput) return;

    const today = new Date();
    dateInput.value = today.toISOString().split('T')[0];
}

export {
    findNearestSunday,
    calculateStartDate,
    timestampsToXPositions,
    xPositionToDate,
    updateChartDateLabels,
    formatDateDisplay,
    updateDateDisplay,
    handleOtherDateChange,
    adjustDateInput,
    initializeDateInput
};

console.log('dates.js loaded');
