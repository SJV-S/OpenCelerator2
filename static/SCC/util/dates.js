/**
 * Date Utilities - All date handling and conversion functions
 *
 * This module handles:
 * - Finding nearest Monday
 * - Calculating start dates
 * - Converting timestamps to x-positions
 * - Converting x-positions back to dates
 * - Date formatting and display
 * - Updating chart date labels
 * - Date change UI handling
 *
 * Emits events instead of calling peer modules directly.
 *
 * =============================================================================
 * DATE BOUNDARY POLICY
 * =============================================================================
 * All dates must snap to the FIRST of their respective period:
 *
 * - Daily:   The day itself (no snapping)
 * - Weekly:  Monday (first day of week per ISO 8601)
 * - Monthly: 1st of month
 * - Yearly:  January 1st
 *
 * This policy is enforced by snapToChartBoundary() which MUST be used:
 * - When initializing date inputs
 * - When adjusting dates via arrow buttons
 * - When user selects a date from calendar picker
 * - Anywhere else a date is set for chart purposes
 *
 * =============================================================================
 * DATA AGGREGATION / BINNING
 * =============================================================================
 * Data points are grouped into bins based on chart type. All entries within
 * the same period share the same X-position, enabling aggregation.
 *
 * Chart Type | Bin Size   | X-Position Calculation              | startDate Alignment
 * -----------|------------|-------------------------------------|---------------------
 * Daily      | 1 day      | daysDiff from startDate             | Previous Monday
 * Weekly     | 1 week     | 5-per-month (monthOff*5 + sunIdx)   | Monday <= 1st of prev month
 * Monthly    | 1 month    | monthsDiff from startDate           | Jan 1 of previous year
 * Yearly     | 1 year     | yearsDiff from startDate            | Jan 1 of decade start
 *
 * WEEKLY 5-PER-MONTH: Each calendar month gets exactly 5 x-slots. Positions
 * correspond to Mondays (matching Weekly.py get_mondays_for_months and the
 * date boundary policy). Months with 4 Mondays leave slot 4 as a dead zone
 * (no grid line, no valid data).
 *
 * CRITICAL: The startDate alignment ensures binning intervals align with the
 * date boundary policy. For Weekly charts, startDate is a Monday so that
 * bins correspond to actual calendar weeks (Mon-Sun, ISO 8601).
 *
 * Functions:
 * - parseLocalDate(): ALWAYS use this to parse dates from strings or clone Date objects
 * - alignStartDate(): Sets chart's anchor point (startDate) per chart type
 * - timestampsToXPositions(): Converts timestamps to X-positions with binning
 * - xPositionToDate(): Reverse conversion (X-position back to date)
 * - snapToChartBoundary(): Snaps user-selected dates to valid boundaries
 * - formatDateInputValue(): ALWAYS use this to format dates for input fields
 *
 * IMPORTANT: Never use `new Date(string)` directly - it causes timezone issues.
 * Always use parseLocalDate() for parsing and formatDateInputValue() for output.
 *
 * =============================================================================
 * TIMESTAMP STANDARD
 * =============================================================================
 * All stored timestamps (lastModified, _createdAt, updated_at, etc.) use
 * UNIX SECONDS — Math.floor(Date.now() / 1000).
 *
 * When you need a JS Date object from a stored timestamp:
 *   new Date(timestamp * 1000)
 *
 * When you need to store the current time:
 *   Math.floor(Date.now() / 1000)
 *
 * NO exceptions. Seconds in, seconds out. The * 1000 conversion belongs at
 * the point of consumption (e.g. display formatting), never in storage.
 *
 * Helper functions:
 * - nowUnixSeconds()      → current time as Unix seconds
 * - timestampToDate(ts)   → Unix seconds → Date object
 * - dateToTimestamp(date)  → Date object → Unix seconds
 * =============================================================================
 *
 * =============================================================================
 * DST-SAFE DAY ARITHMETIC
 * =============================================================================
 * All day-difference calculations use Date.UTC() normalization, NOT raw local
 * date subtraction. Local midnight-to-midnight spans 23 or 25 hours across DST
 * transitions, so Math.floor(localDiff / 86400000) silently loses or gains a
 * day. Date.UTC() strips timezone offset, making the division exact.
 * =============================================================================
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { createToast } from '../ui/toaster.js';
import { relayout } from './plotlyWrapper.js';

// =============================================================================
// WEEKLY 5-PER-MONTH HELPERS
// =============================================================================
// The Weekly chart allocates exactly 5 x-slots per calendar month, matching
// the Python template (Weekly.py get_mondays_for_months). Months with only
// 4 Mondays leave slot 4 as a dead zone — no grid line, no valid data.
//
// x = monthOffset * 5 + mondayIndex
//   monthOffset = months from the base month
//   mondayIndex = which Monday within that month (0-indexed)
//
// Base month = month of (startDate + 6 days), since startDate for Weekly
// is "Monday at or before 1st of [base month]".
// =============================================================================

/** 1st of the base month (month that label-0 represents). */
function getWeeklyBaseMonth(startDate) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 6);
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** First Monday in a given month (0-indexed). */
function getFirstMondayOfMonth(year, month) {
    const d = new Date(year, month, 1);
    const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
    if (dayOfWeek !== 1) {
        const daysToMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
        d.setDate(d.getDate() + daysToMonday);
    }
    return d;
}

/** Number of Mondays in a given month (4 or 5). */
function getMondayCountInMonth(year, month) {
    const first = getFirstMondayOfMonth(year, month);
    let count = 0;
    const d = new Date(first);
    while (d.getMonth() === month) {
        count++;
        d.setDate(d.getDate() + 7);
    }
    return count;
}

/** Valid Monday x-positions for a Weekly chart (skips dead zones). */
function getWeeklyMondayPositions(startDate, xmax) {
    const baseMonth = getWeeklyBaseMonth(startDate);
    const numMonths = Math.ceil((xmax + 5) / 5);
    const positions = [];
    for (let m = 0; m < numMonths; m++) {
        const d = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + m, 1);
        const count = getMondayCountInMonth(d.getFullYear(), d.getMonth());
        for (let i = 0; i < count; i++) {
            const pos = m * 5 + i;
            if (pos <= xmax) positions.push(pos);
        }
    }
    return positions;
}

/** Current time as Unix seconds. */
function nowUnixSeconds() {
    return Math.floor(Date.now() / 1000);
}

/** Unix seconds → Date object. */
function timestampToDate(ts) {
    return new Date(ts * 1000);
}

/** Date object → Unix seconds. */
function dateToTimestamp(date) {
    return Math.floor(date.getTime() / 1000);
}

/**
 * Find the nearest Monday before (or at) a given date.
 * @param {Date} date - Single Date object
 * @returns {Date} The Monday at or before the given date
 */
function findNearestMonday(date) {
    const d = parseLocalDate(date);
    const dayOfWeek = d.getDay();
    // getDay(): 0=Sun, 1=Mon, ..., 6=Sat
    // Days to subtract: Mon(1)->0, Tue(2)->1, ..., Sun(0)->6
    const daysToSubtract = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;

    if (daysToSubtract > 0) {
        d.setDate(d.getDate() - daysToSubtract);
    }

    return d;
}

/**
 * Align a date to the appropriate start boundary based on chart type.
 * - Daily: Previous Monday
 * - Weekly: Monday at or before 1st of previous month (ensures week binning aligns with calendar weeks)
 * - Monthly: January 1st of previous year
 * - Yearly: January 1st of decade start (year rounded down to nearest 10)
 *
 * @param {Date} date - Date to align
 * @param {string} chartType - Chart type (Daily, Weekly, Monthly, Yearly)
 * @returns {Date} Aligned date
 */
function alignStartDate(date, chartType) {
    const d = parseLocalDate(date);

    switch ((chartType || 'Daily').toLowerCase()) {
        case 'weekly':
            // First go to 1st of previous month
            d.setDate(1);
            d.setMonth(d.getMonth() - 1);
            // Then find Monday at or before that date (ISO 8601)
            const weekday = d.getDay();
            const daysToSubtract = (weekday === 0) ? 6 : weekday - 1;
            if (daysToSubtract > 0) {
                d.setDate(d.getDate() - daysToSubtract);
            }
            return d;

        case 'monthly':
            // January 1st of previous year
            d.setFullYear(d.getFullYear() - 1);
            d.setMonth(0);
            d.setDate(1);
            return d;

        case 'yearly':
            // January 1st of decade start
            const decadeStart = d.getFullYear() - (d.getFullYear() % 10);
            d.setFullYear(decadeStart);
            d.setMonth(0);
            d.setDate(1);
            return d;

        case 'daily':
        default:
            // Previous Monday (ISO 8601)
            const dayOfWeekDaily = d.getDay();
            const daysToMonday = (dayOfWeekDaily === 0) ? 6 : dayOfWeekDaily - 1;
            d.setDate(d.getDate() - daysToMonday);
            return d;
    }
}

/**
 * Format a date as month-year (e.g., "Jan 2025")
 * @param {Date} date - Date to format
 * @returns {string} Formatted month-year string
 */
function formatMonthYear(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = date.getFullYear().toString().slice(-2);
    return `${months[date.getMonth()]}<br>${year}`;
}

/**
 * Parse a date safely as local date, handling Date objects, YYYY-MM-DD, and DD-Mon-YYYY strings.
 * Avoids timezone issues by using local date components.
 *
 * @param {Date|string} date - Date object, YYYY-MM-DD string, or DD-Mon-YYYY string
 * @returns {Date} Local date at midnight
 */
function parseLocalDate(date) {
    if (date instanceof Date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [year, month, day] = date.split('-').map(Number);
        const d = new Date(2000, month - 1, day);
        d.setFullYear(year);
        return d;
    }
    // DD-Mon-YYYY format (e.g., "18-Feb-2026")
    if (typeof date === 'string') {
        const monthNames = {Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
                           Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11};
        const match = date.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
        if (match) {
            const day = Number(match[1]);
            const month = monthNames[match[2]];
            const year = Number(match[3]);
            if (month !== undefined) {
                const d = new Date(2000, month, day);
                d.setFullYear(year);
                return d;
            }
        }
    }
    // Fallback - parse and normalize to local midnight
    // BUG INVESTIGATION: ISO strings with time component can shift dates across timezone boundaries
    const d = new Date(date);
    const result = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return result;
}

/**
 * Snap a date to the appropriate boundary based on chart type.
 * POLICY: Always use FIRST of the period.
 * - Daily: the day itself (no change)
 * - Weekly: Monday (first day of week per ISO 8601)
 * - Monthly: 1st of month
 * - Yearly: January 1st
 *
 * @param {Date|string} date - Date object or YYYY-MM-DD string
 * @returns {Date} Snapped date
 */
function snapToChartBoundary(date) {
    const d = parseLocalDate(date);
    const chartType = (chartState.chartType || 'Daily').toLowerCase();

    switch (chartType) {
        case 'weekly':
            // First day of week = Monday (ISO 8601)
            // getDay() returns 0=Sun, 1=Mon, ..., 6=Sat
            // We want to go back to Monday: if Mon(1)->0, Tue(2)->1, ..., Sun(0)->6
            const dayOfWeek = d.getDay();
            const daysToSubtract = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
            if (daysToSubtract > 0) {
                d.setDate(d.getDate() - daysToSubtract);
            }
            break;
        case 'monthly':
            // First day of month
            d.setDate(1);
            break;
        case 'yearly':
            // First day of year = January 1st
            d.setMonth(0);
            d.setDate(1);
            break;
        case 'daily':
        default:
            // No change needed
            break;
    }

    return d;
}

/**
 * Calculate and set the start date based on the earliest date in the provided array.
 * Uses chart-type-specific alignment via alignStartDate().
 * @param {Array<Date>} dates - Array of Date objects
 */
function calculateStartDate(dates) {
    const earliestDate = new Date(Math.min(...dates));
    const chartType = chartState.chartType || 'Daily';
    chartState.startDate = alignStartDate(earliestDate, chartType);
    return chartState.startDate;
}

/**
 * Convert x-values to x-position coordinates for chart rendering.
 * - If chartState.hasTimestamps is true: converts timestamps to positions based on chart type
 * - If chartState.hasTimestamps is false: returns x-positions as-is
 *
 * BINNING BEHAVIOR:
 * This function also handles binning by chart type. Multiple data entries that fall
 * within the same time unit will have the same X position, enabling proper aggregation.
 * - Daily: X = day offset from startDate (no binning, each day unique)
 * - Weekly: X = week offset (days / 7, floored) - entries in same week share X
 * - Monthly: X = month offset from startDate - entries in same month share X
 * - Yearly: X = year offset from startDate - entries in same year share X
 *
 * @param {Array<number>} xValues - Array of Unix timestamps (seconds) or direct x-positions
 * @returns {Array<number>} Array of x-position coordinates
 */
function timestampsToXPositions(xValues) {
    if (!xValues || xValues.length === 0) {
        return [];
    }

    // If not using timestamps, return x-positions as-is
    if (!chartState.hasTimestamps) {
        return [...xValues];
    }

    // Convert timestamps to dates
    const dates = xValues.map(timestamp => {
        const dt = new Date(timestamp * 1000);
        return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    });

    if (!chartState.startDate) {
        calculateStartDate(dates);
    }

    return dates.map(date => dateToXPosition(date));
}

/**
 * Convert a single x-position coordinate back to a date.
 * Reverses the binning done by timestampsToXPositions.
 * - Daily: X = day offset, returns that day
 * - Weekly: X = 5-per-month slot, returns that Monday (null if dead zone)
 * - Monthly: X = month offset, returns first day of that month
 * - Yearly: X = year offset, returns first day of that year
 *
 * @param {number} xPosition - X-position coordinate
 * @returns {Date|null} Date object corresponding to the x-position (null for Weekly dead zones)
 */
function xPositionToDate(xPosition) {
    const chartType = (chartState.chartType || 'Daily').toLowerCase();
    // Use parseLocalDate to get a clean local date without timezone issues
    const startDate = parseLocalDate(chartState.startDate);

    switch (chartType) {
        case 'weekly': {
            // 5-per-month: find the Monday at this slot directly
            const baseMonth = getWeeklyBaseMonth(startDate);
            const monthOffset = Math.floor(xPosition / 5);
            const mondayIndex = Math.round(xPosition - monthOffset * 5);
            const targetDate = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + monthOffset, 1);
            const firstMonday = getFirstMondayOfMonth(targetDate.getFullYear(), targetDate.getMonth());
            const monday = new Date(firstMonday);
            monday.setDate(firstMonday.getDate() + mondayIndex * 7);
            // Dead zone: Monday fell into the next month
            if (monday.getMonth() !== targetDate.getMonth()) return null;
            return monday;
        }
        case 'monthly': {
            // Use first of month to avoid timezone boundary issues
            const resultDate = new Date(startDate.getFullYear(), startDate.getMonth() + xPosition, 1);
            return resultDate;
        }
        case 'yearly': {
            // Use January 1 to avoid timezone boundary issues (Dec 31 23:00 UTC becomes Jan 1 in UTC+1)
            const resultDate = new Date(startDate.getFullYear() + xPosition, 0, 1);
            return resultDate;
        }
        case 'daily':
        default: {
            const resultDate = new Date(startDate);
            resultDate.setDate(startDate.getDate() + xPosition);
            return resultDate;
        }
    }
}

/**
 * Convert a Date object to an x-position on the chart (inverse of xPositionToDate).
 * Uses chart-type-specific calculations matching timestampsToXPositions:
 * - Daily: X = day offset from startDate
 * - Weekly: X = 5-per-month slot (monthOffset*5 + sundayIndex)
 * - Monthly: X = month offset from startDate
 * - Yearly: X = year offset from startDate
 *
 * @param {Date|string} date - Date object or ISO string to convert
 * @returns {number} X-position for the chart
 */
function dateToXPosition(date) {
    if (!chartState.startDate) return 0;

    const chartType = (chartState.chartType || 'Daily').toLowerCase();
    const inputDate = parseLocalDate(date);
    const startDate = parseLocalDate(chartState.startDate);

    switch (chartType) {
        case 'yearly':
            return inputDate.getFullYear() - startDate.getFullYear();
        case 'monthly':
            return (inputDate.getFullYear() - startDate.getFullYear()) * 12 +
                   (inputDate.getMonth() - startDate.getMonth());
        case 'weekly': {
            // 5-per-month: data is Monday-snapped, find its slot directly
            const monday = findNearestMonday(inputDate);
            const baseMonth = getWeeklyBaseMonth(startDate);
            const monthOffset = (monday.getFullYear() - baseMonth.getFullYear()) * 12
                              + (monday.getMonth() - baseMonth.getMonth());
            const firstMonday = getFirstMondayOfMonth(monday.getFullYear(), monday.getMonth());
            const mondayIndex = Math.round(
                (Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate())
               - Date.UTC(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate()))
                / (7 * 24 * 60 * 60 * 1000)
            );
            return monthOffset * 5 + mondayIndex;
        }
        case 'daily':
        default: {
            // DST-safe day arithmetic via Date.UTC normalization
            const utcInput = Date.UTC(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate());
            const utcStart = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            return Math.round((utcInput - utcStart) / (1000 * 60 * 60 * 24));
        }
    }
}

/**
 * Update date annotations in chart with formatted dates based on startDate.
 * Handles different annotation types for different chart types:
 * - Daily: date-text-* annotations, 28-day intervals
 * - Weekly: month-label-* annotations, monthly intervals
 * - Monthly: year-label-* annotations, yearly intervals
 * - Yearly: year-label-* annotations, decade intervals
 *
 * @param {HTMLElement} chartElement - Plotly chart element
 * @param {Date} startDate - The start date to use for formatting
 */
function updateChartDateLabels(chartElement, startDate) {
    if (!chartElement?.layout?.annotations) {
        return;
    }

    const chartType = (chartState.chartType || 'Daily').toLowerCase();

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function formatDate(date) {
        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }

    chartElement.layout.annotations.forEach(annotation => {
        if (!annotation.name) return;

        let idx, currentDate, formattedDate;

        if (annotation.name.startsWith('date-text-')) {
            // Daily: 28-day (4-week) intervals
            idx = parseInt(annotation.name.replace('date-text-', ''));
            currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + (idx * 28));
            formattedDate = formatDate(currentDate);
            annotation.text = `<u>${formattedDate}</u>`;

        } else if (annotation.name.startsWith('month-label-')) {
            // Weekly 5-per-month: label N is centered in month N's 5-slot block.
            // Use month index directly from the base month.
            idx = parseInt(annotation.name.replace('month-label-', ''));
            const baseDate = new Date(startDate);
            baseDate.setDate(baseDate.getDate() + 6); // land in base month
            currentDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + idx, 1);
            formattedDate = formatMonthYear(currentDate);
            annotation.text = formattedDate;

        } else if (annotation.name.startsWith('year-label-')) {
            idx = parseInt(annotation.name.replace('year-label-', ''));
            currentDate = new Date(startDate);

            if (chartType === 'yearly') {
                // Yearly: decade (10-year) intervals
                currentDate.setFullYear(startDate.getFullYear() + (idx * 10));
            } else {
                // Monthly: yearly intervals
                currentDate.setFullYear(startDate.getFullYear() + idx);
            }
            formattedDate = currentDate.getFullYear().toString();
            annotation.text = formattedDate;
        }
    });

    relayout(chartElement, {
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
 * Handle date change in other tab - align to appropriate boundary based on chart type
 * Emits: DATA_START_DATE_CHANGED
 */
function handleOtherDateChange() {
    const otherDateInput = document.getElementById('other-date');
    const selectedDate = parseLocalDate(otherDateInput.value);
    const chartType = chartState.chartType || 'Daily';
    const alignedDate = alignStartDate(selectedDate, chartType);

    // Update input to show aligned date
    otherDateInput.value = formatDateInputValue(alignedDate);
    updateDateDisplay(alignedDate);

    // Emit event instead of calling setStartDate directly
    eventBus.emit(EVENTS.DATA_START_DATE_CHANGED, { date: alignedDate });

    // Show appropriate toast based on chart type
    const alignmentMessages = {
        daily: 'Adjusted to nearest Monday',
        weekly: 'Adjusted to first of previous month',
        monthly: 'Adjusted to January 1 of previous year',
        yearly: 'Adjusted to start of decade'
    };

    createToast({
        message: alignmentMessages[chartType.toLowerCase()] || 'Start date updated',
        duration: 2000,
        position: 'top-right'
    });

}

/**
 * Adjust a date input field by the appropriate interval based on chart type.
 * Snaps to chart boundary first, then adjusts, then snaps result.
 * - Daily: adjusts by days
 * - Weekly: adjusts by weeks (7 days)
 * - Monthly: adjusts by months
 * - Yearly: adjusts by years
 *
 * @param {string} inputId - ID of the date input element
 * @param {number} offset - Number of units to adjust (positive or negative)
 */
function adjustDateByChartUnit(date, offset) {
    const currentDate = snapToChartBoundary(date);
    const chartType = (chartState.chartType || 'Daily').toLowerCase();

    switch (chartType) {
        case 'weekly':
            currentDate.setDate(currentDate.getDate() + (offset * 7));
            break;
        case 'monthly':
            currentDate.setMonth(currentDate.getMonth() + offset);
            break;
        case 'yearly':
            currentDate.setFullYear(currentDate.getFullYear() + offset);
            break;
        case 'daily':
        default:
            currentDate.setDate(currentDate.getDate() + offset);
            break;
    }

    return currentDate;
}

/**
 * Format a Date object as DD-Mon-YYYY string for display in input fields.
 * @param {Date} date - Date to format
 * @returns {string} Date string in DD-Mon-YYYY format (e.g., "18-Feb-2026")
 */
function formatDateInputValue(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

/**
 * Format a Date object as YYYY-MM-DD string for storage/metadata.
 * @param {Date} date - Date to format
 * @returns {string} Date string in YYYY-MM-DD format
 */
function formatDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Get today's date snapped to the appropriate chart boundary.
 * @returns {Date} Today's date snapped to chart boundary
 */
function getSnappedToday() {
    return snapToChartBoundary(new Date());
}

/**
 * Update the "Plot Date" label text based on chart type.
 * - Daily: "Plot Date"
 * - Weekly: "Plot Week"
 * - Monthly: "Plot Month"
 * - Yearly: "Plot Year"
 */
function updatePlotDateLabel() {
    const label = document.querySelector('label[for="entry-date"]');
    if (!label) return;

    const chartType = (chartState.chartType || 'Daily').toLowerCase();
    const labelText = {
        daily: 'Plot Date',
        weekly: 'Plot Week',
        monthly: 'Plot Month',
        yearly: 'Plot Year'
    };

    label.textContent = labelText[chartType] || 'Plot Date';
}

/**
 * Get all Mondays in a given month/year.
 * @param {number} year - Full year (e.g., 2025)
 * @param {number} month - Month 1-12
 * @returns {number[]} Array of day numbers that are Mondays (e.g., [6, 13, 20, 27])
 */
function getMondaysInMonth(year, month) {
    const mondays = [];
    const tempDate = new Date(2000, month, 0);
    tempDate.setFullYear(year);
    const lastDay = tempDate.getDate();

    for (let day = 1; day <= lastDay; day++) {
        const date = new Date(2000, month - 1, day);
        date.setFullYear(year);
        if (date.getDay() === 1) {
            mondays.push(day);
        }
    }

    return mondays;
}

/**
 * Format year for display with BC/AD suffix.
 * Internal: 1 = 1 AD, 0 = 1 BC, -1 = 2 BC
 * @param {number} internalYear - Internal year number
 * @returns {string} Formatted year string (e.g., "2025 AD", "44 BC")
 */
function formatYearDisplay(internalYear) {
    if (internalYear >= 1) {
        return `${internalYear} AD`;
    } else {
        return `${1 - internalYear} BC`;
    }
}

/**
 * Parse year input that may contain BC/AD.
 * @param {string|number} input - Year string (e.g., "44 BC", "2025 AD", "2025")
 * @returns {number|null} Internal year number, or null if invalid
 */
function parseYearInput(input) {
    const str = input.toString().trim().toUpperCase();
    const bcMatch = str.match(/^(\d+)\s*BC$/);
    const adMatch = str.match(/^(\d+)\s*AD$/);

    if (bcMatch) {
        return 1 - parseInt(bcMatch[1]);
    } else if (adMatch) {
        return parseInt(adMatch[1]);
    } else {
        const num = parseInt(str);
        return isNaN(num) ? null : num;
    }
}

/**
 * Create a Date object with correct year handling.
 * JavaScript Date treats years 0-99 as 1900-1999, so we use setFullYear.
 * @param {number} year - Full year
 * @param {number} month - Month (0-indexed)
 * @param {number} day - Day of month
 * @returns {Date} Date object
 */
function createDate(year, month, day) {
    const date = new Date(2000, month, day);
    date.setFullYear(year);
    return date;
}

/**
 * Convert internal startDate to user-visible date components.
 * @param {Date} startDate - The internal start date
 * @param {string} chartType - Chart type (e.g., "Daily", "Weekly")
 * @returns {Object} User-visible components (monday, month, year, decade depending on chart type)
 */
function internalToUserDate(startDate, chartType) {
    const type = chartType.toLowerCase();

    if (type === 'daily') {
        const dayOfWeek = startDate.getDay();
        const mondayDate = new Date(startDate);
        const daysToSubtract = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
        if (daysToSubtract > 0) {
            mondayDate.setDate(startDate.getDate() - daysToSubtract);
        }

        return {
            monday: mondayDate.getDate(),
            month: mondayDate.getMonth() + 1,
            year: mondayDate.getFullYear()
        };
    } else if (type === 'weekly') {
        const targetDate = new Date(startDate);
        targetDate.setDate(startDate.getDate() + 6);
        return {
            month: targetDate.getMonth() + 1,
            year: targetDate.getFullYear()
        };
    } else if (type === 'monthly') {
        return {
            year: startDate.getFullYear()
        };
    } else if (type === 'yearly') {
        const year = startDate.getFullYear();
        return {
            decade: year - (year % 10)
        };
    }

    return {};
}

/**
 * Convert user-selected values back to internal date.
 * @param {Object} values - User values (monday, month, year, decade)
 * @param {string} chartType - Chart type (e.g., "Daily", "Weekly")
 * @returns {Date} Internal date
 */
function userToInternalDate(values, chartType) {
    const type = chartType.toLowerCase();

    if (type === 'daily') {
        return createDate(values.year, values.month - 1, values.monday);
    } else if (type === 'weekly') {
        const d = createDate(values.year, values.month - 1, 1);
        const weekday = d.getDay();
        const daysToSubtract = (weekday === 0) ? 6 : weekday - 1;
        if (daysToSubtract > 0) {
            d.setDate(d.getDate() - daysToSubtract);
        }
        return d;
    } else if (type === 'monthly') {
        return createDate(values.year, 0, 1);
    } else if (type === 'yearly') {
        return createDate(values.decade, 0, 1);
    }

    return new Date();
}

/** Convert a Date to an ISO string for storage */
function serializeDate(date) {
    if (date instanceof Date) return date.toISOString();
    return date; // already a string or null
}

/** Restore a Date from stored format (ISO string) */
function deserializeDate(value) {
    if (value instanceof Date) return value;
    if (typeof value === 'string') return new Date(value);
    return value; // null
}

export {
    nowUnixSeconds,
    timestampToDate,
    dateToTimestamp,
    findNearestMonday,
    alignStartDate,
    calculateStartDate,
    parseLocalDate,
    snapToChartBoundary,
    timestampsToXPositions,
    getWeeklyMondayPositions,
    xPositionToDate,
    dateToXPosition,
    updateChartDateLabels,
    formatDateDisplay,
    formatDateInputValue,
    formatDateISO,
    formatMonthYear,
    updateDateDisplay,
    handleOtherDateChange,
    adjustDateByChartUnit,
    getSnappedToday,
    updatePlotDateLabel,
    getMondaysInMonth,
    formatYearDisplay,
    parseYearInput,
    createDate,
    internalToUserDate,
    userToInternalDate,
    serializeDate,
    deserializeDate
};
