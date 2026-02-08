/**
 * Start Date Modal + Chart Window control
 *
 * Modal: Start date controls (varies by chart type)
 * Settings tab: Chart window spinbox (applies immediately)
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { createToast } from './toaster.js';
import { CHART_TYPE_CONFIG } from '../config.js';
import {
    getMondaysInMonth,
    formatYearDisplay,
    parseYearInput,
    internalToUserDate,
    userToInternalDate
} from '../util/dates.js';

// Current values stored here for easy access
let currentValues = {
    monday: 1,
    month: 1,
    year: 2025,
    decade: 2020,
    availableMondays: []
};

// Modal elements
let modalOverlay = null;
let modalContent = null;

/**
 * Update the display for a spinbox element
 */
function updateDisplay(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.dataset.value = value;

        let displayValue = value;
        if (id === 'modal-start-year') {
            displayValue = formatYearDisplay(value);
        }

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

    if (!currentValues.availableMondays.includes(currentValues.monday)) {
        currentValues.monday = currentValues.availableMondays[0] || 1;
    }

    updateDisplay('modal-start-monday', currentValues.monday);
}

/**
 * Increment/decrement Monday
 */
function adjustMonday(delta) {
    const mondays = currentValues.availableMondays;
    if (mondays.length === 0) return;

    const currentIndex = mondays.indexOf(currentValues.monday);
    let newIndex = currentIndex + delta;

    if (newIndex < 0) newIndex = mondays.length - 1;
    if (newIndex >= mondays.length) newIndex = 0;

    currentValues.monday = mondays[newIndex];
    updateDisplay('modal-start-monday', currentValues.monday);
}

/**
 * Adjust month (1-12, wraps and adjusts year)
 */
function adjustMonth(delta) {
    let newMonth = currentValues.month + delta;

    if (newMonth < 1) {
        newMonth = 12;
        currentValues.year--;
        if (currentValues.year === 0) currentValues.year = -1;
        updateDisplay('modal-start-year', currentValues.year);
    } else if (newMonth > 12) {
        newMonth = 1;
        currentValues.year++;
        if (currentValues.year === 0) currentValues.year = 1;
        updateDisplay('modal-start-year', currentValues.year);
    }

    currentValues.month = newMonth;
    updateDisplay('modal-start-month', currentValues.month);

    if (chartState.chartType.toLowerCase() === 'daily') {
        updateMondayControl();
    }
}

/**
 * Adjust year
 */
function adjustYear(delta) {
    let newYear = currentValues.year + delta;

    if (newYear === 0) newYear = delta > 0 ? 1 : -1;
    if (newYear < -9999) newYear = -9999;
    if (newYear > 9999) newYear = 9999;

    currentValues.year = newYear;
    updateDisplay('modal-start-year', currentValues.year);

    if (chartState.chartType.toLowerCase() === 'daily') {
        updateMondayControl();
    }
}

/**
 * Adjust decade (1600-2300, step 10)
 */
function adjustDecade(delta) {
    let newDecade = currentValues.decade + (delta * 10);

    if (newDecade < 1600) newDecade = 1600;
    if (newDecade > 2300) newDecade = 2300;

    currentValues.decade = newDecade;
    updateDisplay('modal-start-decade', currentValues.decade);
}

/**
 * Handle save - emit events for changed values
 */
function handleSave() {
    // Check if start date changed
    const newDate = userToInternalDate(currentValues, chartState.chartType);
    const oldDate = chartState.startDate;
    const startDateChanged = newDate.getTime() !== oldDate.getTime();

    if (startDateChanged) {
        eventBus.emit(EVENTS.DATA_START_DATE_CHANGED, { date: newDate });
        createToast({
            message: 'Start date updated',
            duration: 2000,
            position: 'top-right'
        });
    }
}

/**
 * Handle direct year input change
 */
function handleYearInput(e) {
    let newYear = parseYearInput(e.target.value);

    if (newYear === null) return;

    if (newYear === 0) newYear = 1;
    if (newYear < -9999) newYear = -9999;
    if (newYear > 9999) newYear = 9999;

    currentValues.year = newYear;
    e.target.value = formatYearDisplay(newYear);

    if (chartState.chartType.toLowerCase() === 'daily') {
        updateMondayControl();
    }
}

/**
 * Handle direct decade input change
 */
function handleDecadeInput(e) {
    let newDecade = parseInt(e.target.value);

    if (isNaN(newDecade)) return;

    newDecade = Math.round(newDecade / 10) * 10;

    if (newDecade < 1600) newDecade = 1600;
    if (newDecade > 2300) newDecade = 2300;

    currentValues.decade = newDecade;
    e.target.value = newDecade;
}

/**
 * Set values from current chartState
 */
function setInputValues() {
    const values = internalToUserDate(chartState.startDate, chartState.chartType);
    const chartType = chartState.chartType.toLowerCase();

    // Set start date values
    if (chartType === 'daily') {
        currentValues.month = values.month;
        currentValues.year = values.year;
        currentValues.monday = values.monday;

        updateDisplay('modal-start-month', currentValues.month);
        updateDisplay('modal-start-year', currentValues.year);
        updateMondayControl();
    } else if (chartType === 'weekly') {
        currentValues.month = values.month;
        currentValues.year = values.year;

        updateDisplay('modal-start-month', currentValues.month);
        updateDisplay('modal-start-year', currentValues.year);
    } else if (chartType === 'monthly') {
        currentValues.year = values.year;
        updateDisplay('modal-start-year', currentValues.year);
    } else if (chartType === 'yearly') {
        currentValues.decade = values.decade;
        updateDisplay('modal-start-decade', currentValues.decade);
    }

}

/**
 * Get start date label based on chart type
 */
function getStartDateLabel() {
    const chartType = chartState.chartType.toLowerCase();

    switch (chartType) {
        case 'daily':
            return 'Start Date (Monday)';
        case 'weekly':
            return 'Start Date (Month)';
        case 'monthly':
            return 'Start Date (Year)';
        case 'yearly':
            return 'Start Date (Decade)';
        default:
            return 'Start Date';
    }
}

/**
 * Create arrow button SVG
 */
function createArrowSVG(direction) {
    const path = direction === 'left'
        ? 'M12 4L6 10L12 16'
        : 'M8 4L14 10L8 16';

    return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="${path}" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

/**
 * Create a spinbox row (button - value - button)
 */
function createSpinboxRow(id, labelText) {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-center gap-3';
    row.id = `${id}-row`;
    row.style.display = 'none';

    // Label
    const label = document.createElement('span');
    label.className = 'text-sm text-gray-500 w-16 text-right';
    label.textContent = labelText;

    // Left button
    const leftBtn = document.createElement('button');
    leftBtn.type = 'button';
    leftBtn.className = 'w-10 h-10 flex items-center justify-center border-2 border-gray-300 rounded hover:bg-gray-100 active:bg-gray-200 transition-colors';
    leftBtn.innerHTML = createArrowSVG('left');
    leftBtn.dataset.action = `${id}-dec`;

    // Value display
    const isInput = id === 'modal-start-year' || id === 'modal-start-decade';
    let valueEl;

    if (isInput) {
        valueEl = document.createElement('input');
        valueEl.type = 'text';
        valueEl.id = id;
        valueEl.className = 'w-24 h-10 text-center border-2 border-gray-300 rounded text-base font-medium bg-white focus:outline-none focus:border-[#6ad1e3] transition-colors';
        if (id === 'modal-start-decade') {
            valueEl.inputMode = 'numeric';
        }
    } else {
        valueEl = document.createElement('div');
        valueEl.id = id;
        valueEl.className = 'w-12 h-10 flex items-center justify-center border-2 border-gray-300 rounded text-base font-medium bg-white';
    }
    valueEl.dataset.value = '';

    // Right button
    const rightBtn = document.createElement('button');
    rightBtn.type = 'button';
    rightBtn.className = 'w-10 h-10 flex items-center justify-center border-2 border-gray-300 rounded hover:bg-gray-100 active:bg-gray-200 transition-colors';
    rightBtn.innerHTML = createArrowSVG('right');
    rightBtn.dataset.action = `${id}-inc`;

    row.appendChild(label);
    row.appendChild(leftBtn);
    row.appendChild(valueEl);
    row.appendChild(rightBtn);

    return row;
}

/**
 * Create the modal HTML structure
 */
function createModal() {
    // Overlay
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'start-date-modal-overlay';
    modalOverlay.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center';
    modalOverlay.style.display = 'none';

    // Modal content
    modalContent = document.createElement('div');
    modalContent.className = 'bg-white rounded-lg shadow-xl p-6 min-w-[300px] max-w-[90vw]';

    // Title
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold text-gray-700 mb-4 text-center';
    title.textContent = 'Start Date';

    // Start Date Section
    const startDateLabel = document.createElement('div');
    startDateLabel.id = 'start-date-section-label';
    startDateLabel.className = 'text-sm font-semibold text-gray-600 mb-2 text-center';
    startDateLabel.textContent = 'Start Date';

    // Start date controls container
    const startDateContainer = document.createElement('div');
    startDateContainer.className = 'flex flex-col gap-3 mb-4';

    // Create start date spinbox rows
    const mondayRow = createSpinboxRow('modal-start-monday', 'Monday');
    const monthRow = createSpinboxRow('modal-start-month', 'Month');
    const yearRow = createSpinboxRow('modal-start-year', 'Year');
    const decadeRow = createSpinboxRow('modal-start-decade', 'Decade');

    startDateContainer.appendChild(mondayRow);
    startDateContainer.appendChild(monthRow);
    startDateContainer.appendChild(yearRow);
    startDateContainer.appendChild(decadeRow);

    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'mt-4 flex gap-2';

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'flex-1 py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-medium transition-colors';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', hideModal);

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'flex-1 py-2 bg-[#6ad1e3] hover:bg-[#5bc1d3] rounded text-white font-medium transition-colors';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
        handleSave();
        hideModal();
    });

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(saveBtn);

    modalContent.appendChild(title);
    modalContent.appendChild(startDateLabel);
    modalContent.appendChild(startDateContainer);
    modalContent.appendChild(buttonContainer);
    modalOverlay.appendChild(modalContent);

    // Close on overlay click (but not modal content)
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            hideModal();
        }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay.style.display !== 'none') {
            hideModal();
        }
    });

    document.body.appendChild(modalOverlay);
}

/**
 * Set up event listeners for modal controls
 */
function setupModalEventListeners() {
    // Use event delegation on the modal content
    modalContent.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) return;

        switch (action) {
            case 'modal-start-monday-dec':
                adjustMonday(-1);
                break;
            case 'modal-start-monday-inc':
                adjustMonday(1);
                break;
            case 'modal-start-month-dec':
                adjustMonth(-1);
                break;
            case 'modal-start-month-inc':
                adjustMonth(1);
                break;
            case 'modal-start-year-dec':
                adjustYear(-1);
                break;
            case 'modal-start-year-inc':
                adjustYear(1);
                break;
            case 'modal-start-decade-dec':
                adjustDecade(-1);
                break;
            case 'modal-start-decade-inc':
                adjustDecade(1);
                break;
        }
    });

    // Year direct input
    const yearInput = document.getElementById('modal-start-year');
    if (yearInput) {
        yearInput.addEventListener('change', handleYearInput);
    }

    // Decade direct input
    const decadeInput = document.getElementById('modal-start-decade');
    if (decadeInput) {
        decadeInput.addEventListener('change', handleDecadeInput);
    }
}

/**
 * Show/hide rows based on chart type
 */
function updateRowVisibility() {
    const chartType = chartState.chartType.toLowerCase();

    const mondayRow = document.getElementById('modal-start-monday-row');
    const monthRow = document.getElementById('modal-start-month-row');
    const yearRow = document.getElementById('modal-start-year-row');
    const decadeRow = document.getElementById('modal-start-decade-row');

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
 * Show the modal
 */
export function showStartDateModal() {
    if (!modalOverlay) {
        createModal();
        setupModalEventListeners();
    }

    // Update start date section label
    const label = document.getElementById('start-date-section-label');
    if (label) {
        label.textContent = getStartDateLabel();
    }

    // Update visibility and values
    updateRowVisibility();
    setInputValues();

    modalOverlay.style.display = 'flex';
}

/**
 * Hide the modal
 */
export function hideModal() {
    if (modalOverlay) {
        modalOverlay.style.display = 'none';
    }
}

/**
 * Initialize - set up button listener
 */
export function initStartDateModal() {
    const btn = document.getElementById('start-date-btn');
    if (btn) {
        btn.addEventListener('click', showStartDateModal);
    }

    console.log('startDateModal.js initialized');
}

/**
 * Refresh the display (call when startDate changes externally)
 */
export function refreshStartDateDisplay() {
    if (modalOverlay && modalOverlay.style.display !== 'none') {
        setInputValues();
    }
}

/**
 * Chart Window control for settings tab (applies immediately)
 */
let chartWindowEl = null;

function updateChartWindowDisplay(value) {
    if (chartWindowEl) {
        chartWindowEl.textContent = value ?? chartState.chartWindow;
    }
}

function adjustSettingsChartWindow(delta) {
    const config = CHART_TYPE_CONFIG[chartState.chartType] || CHART_TYPE_CONFIG.Daily;
    const increment = config.snapTo || 14;
    const minWindow = config.minXmax || config.snapTo || 14;

    let newWindow = chartState.chartWindow + (delta * increment);

    if (newWindow < minWindow) newWindow = minWindow;
    if (newWindow > chartState.chartCapacity) newWindow = chartState.chartCapacity;

    if (newWindow !== chartState.chartWindow) {
        eventBus.emit(EVENTS.CHART_WINDOW_CHANGED, newWindow);
    }
}

export function initChartWindowControl() {
    chartWindowEl = document.getElementById('chart-window-value');
    const decBtn = document.getElementById('chart-window-dec');
    const incBtn = document.getElementById('chart-window-inc');

    if (chartWindowEl) updateChartWindowDisplay();
    if (decBtn) decBtn.addEventListener('click', () => adjustSettingsChartWindow(-1));
    if (incBtn) incBtn.addEventListener('click', () => adjustSettingsChartWindow(1));

    // Update display when chart window changes from any source
    eventBus.subscribe(EVENTS.CHART_WINDOW_CHANGED, (newValue) => {
        updateChartWindowDisplay(newValue);
    }, true);
}

/**
 * Chart Height control for settings tab (applies immediately via initializeChart)
 */
const HEIGHT_STEP = 50; // px per click
const MIN_HEIGHT = 300;
const MAX_HEIGHT = 2000;

let chartHeightEl = null;

function updateChartHeightDisplay(value) {
    if (chartHeightEl) {
        chartHeightEl.textContent = value ?? chartState.containerHeight ?? '';
    }
}

function adjustChartHeight(delta) {
    const current = chartState.containerHeight;
    if (current == null) return;

    let newHeight = current + (delta * HEIGHT_STEP);
    newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newHeight));

    if (newHeight !== current) {
        eventBus.emit(EVENTS.CHART_HEIGHT_CHANGED, newHeight);
    }
}

export function initChartHeightControl() {
    chartHeightEl = document.getElementById('chart-height-value');
    const decBtn = document.getElementById('chart-height-dec');
    const incBtn = document.getElementById('chart-height-inc');

    if (chartHeightEl) updateChartHeightDisplay();
    if (decBtn) decBtn.addEventListener('click', () => adjustChartHeight(-1));
    if (incBtn) incBtn.addEventListener('click', () => adjustChartHeight(1));

    eventBus.subscribe(EVENTS.CHART_HEIGHT_CHANGED, (newValue) => {
        updateChartHeightDisplay(newValue);
    }, true);
}

console.log('startDateModal.js loaded');
