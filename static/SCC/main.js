/**
 * Main entry point for the application
 *
 * This module:
 * - Imports all necessary functions from other modules
 * - Initializes the application and sets up event listeners
 * - Uses ES6 module standard with event delegation
 */

// Import state and functions from modules
import { chartState } from './chartState.js';
import { eventBus, EVENTS } from './eventBus.js';
import {
    submitEntry,
    setStartDate,
    init as dataEntryInit
} from './series/dataEntry.js';
import {
    initializeAllSeriesInputs,
    applyTraceConfig,
    resetTraceConfig,
    switchSeriesTab,
    toggleLineWidth,
    initializeLineWidthToggles,
    addAggregationBlock,
    updateButtonVisibility,
    removeAggregationBlock
} from './series/traceStyles.js';
import { refreshChart, init as replotInit } from './series/replot.js';
import { updateChartDateLabels, handleOtherDateChange, updateDateDisplay, adjustDateInput, initializeDateInput } from './util/dates.js';
import { submitCredit, loadCreditData, init as creditInit } from './misc/credit.js';
import { loadDataForDate, adjustTimestamp, updateCurrentEntry, deleteCurrentEntry, init as dataUpdateInit } from './series/dataUpdate.js';
import {
    showCounter,
    hideCounter,
    switchTab,
    phaseTextTop,
    phaseTextBottom,
    aimDiagonal,
    aimHorizontal,
    otherScissors,
    otherCeleration,
    toggleLineClickability,
    initGestureNavigation,
    initFormKeyboardShortcuts,
    init as navigationInit
} from './navigation.js';
import { setupClickHandler, init as lineClickHandlerInit } from './lines/lineClickHandler.js';
import { init as phaseLinesInit } from './lines/phaseLines.js';
import { init as aimLinesInit } from './lines/aimLines.js';
import { init as cutLinesInit } from './lines/cutLines.js';
import { init as celLineInit } from './lines/celLine.js';
import { initGridToggle } from './misc/grid.js';
import { toggleLegend, renderCustomLegend, init as customLegendInit } from './misc/customLegend.js';
import { setupPanConstraints } from './util/panning_controls.js';
import { resizeChartByHeight } from './util/resize_chart/resize-daily.js';
import { resizeWeeklyChartByHeight } from './util/resize_chart/resize-weekly.js';
import { resizeMonthlyChartByHeight } from './util/resize_chart/resize-monthly.js';
import { resizeYearlyChartByHeight } from './util/resize_chart/resize-yearly.js';
import { resizeFrequencyCollectionsChartByHeight } from './util/resize_chart/resize-frequency-collections.js';
import { showInitialMenuHint } from './util/tooltip.js';
import { icons } from './util/icons.js';
import { initializeShareTab } from './misc/share.js';

// ============================================================================
// CHART INITIALIZATION
// ============================================================================

/**
 * Initialize the chart with server-rendered data
 * @param {Object} plotData - Plot data from Jinja template
 * @param {number} maxWindowWidth - Max window width from template
 * @param {string} chartType - Chart type selected by user
 */
export function initializeChart(plotData, maxWindowWidth, chartType) {
    // Set chart type from URL parameter
    chartState.chartType = chartType;

    // Determine minute chart from template y-axis title
    const yAxisTitle = plotData.layout?.yaxis?.title?.text || '';
    chartState.minuteChart = yAxisTitle.toUpperCase().includes('MINUTE');
    const chartDiv = document.getElementById('chart');

    // Resize chart based on chart type
    if (chartType === 'Weekly') {
        plotData = resizeWeeklyChartByHeight(plotData, window.innerHeight);
    } else if (chartType === 'Monthly') {
        plotData = resizeMonthlyChartByHeight(plotData, window.innerHeight);
    } else if (chartType === 'Yearly') {
        plotData = resizeYearlyChartByHeight(plotData, window.innerHeight);
    } else if (chartType === 'FrequencyCollections') {
        plotData = resizeFrequencyCollectionsChartByHeight(plotData, window.innerHeight);
    } else {
        plotData = resizeChartByHeight(plotData, window.innerHeight);
    }

    // Create chart
    Plotly.newPlot(chartDiv, plotData.data, plotData.layout, {
        displayModeBar: false,
        scrollZoom: false,
        doubleClick: false
    });

    setupPanConstraints(chartDiv, maxWindowWidth, chartType);

    // Initialize startDate to the most recent Sunday at midnight
    if (!chartState.startDate) {
        const now = new Date();
        const daysSinceSunday = now.getDay() || 7;
        chartState.startDate = new Date(now);
        chartState.startDate.setDate(now.getDate() - daysSinceSunday);
        chartState.startDate.setHours(0, 0, 0, 0);

        updateChartDateLabels(chartDiv, chartState.startDate);
    }

    // Initialize click handler
    setupClickHandler();

    // Initialize grid toggle
    initGridToggle();

    // Show initial menu hint
    setTimeout(showInitialMenuHint, 500);

    // Initialize date inputs
    initializeDateInputs();

    // Trigger chart refresh to render data from chartState.series
    refreshChart();
    renderCustomLegend();
}

/**
 * Initialize date input fields
 */
function initializeDateInputs() {
    // Entry date input with today's date
    initializeDateInput('entry-date');

    // Data tab date input with today's date
    initializeDateInput('data-entry-date');

    // Other tab date input with startDate
    const otherDateInput = document.getElementById('other-date');
    if (otherDateInput && chartState.startDate) {
        otherDateInput.value = chartState.startDate.toISOString().split('T')[0];
        updateDateDisplay(chartState.startDate);
    }
}

/**
 * Adjust the entry date by a number of days
 * @param {number} days - Number of days to adjust (positive or negative)
 */
export function adjustDate(days) {
    adjustDateInput('entry-date', days);
}

/**
 * Adjust the data tab date by a number of days
 * @param {number} days - Number of days to adjust (positive or negative)
 */
export function adjustDataDate(days) {
    adjustDateInput('data-entry-date', days);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('Main.js: Initializing application');

    // Initialize event bus subscriptions for all modules
    // Order matters: subscribers must register before events are emitted
    lineClickHandlerInit();
    dataEntryInit();
    replotInit();
    creditInit();
    dataUpdateInit();
    navigationInit();
    phaseLinesInit();
    aimLinesInit();
    cutLinesInit();
    celLineInit();
    customLegendInit();
    console.log('Main.js: Event bus subscriptions initialized');

    // Initialize icons in buttons with data-icon attributes
    document.querySelectorAll('[data-icon]').forEach(button => {
        const iconName = button.dataset.icon;
        if (icons[iconName]) {
            button.innerHTML = icons[iconName]();
        }
    });

    // Initialize gesture navigation (swipe, keyboard shortcuts, long press)
    initGestureNavigation();

    // Initialize form keyboard shortcuts (Enter key to submit)
    initFormKeyboardShortcuts();

    // Initialize share tab icons
    initializeShareTab();

    // Initialize series input controls
    initializeAllSeriesInputs();
    initializeLineWidthToggles();

    // Initialize button visibility for all series
    ['correct', 'incorrect', 'timing', 'misc1', 'misc2'].forEach(seriesName => {
        updateButtonVisibility(seriesName);
    });

    setupEventListeners();

    console.log('Main.js: Application initialized');
});

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('[data-tab]').forEach(button => {
        button.addEventListener('click', (e) => {
            const tabName = e.currentTarget.dataset.tab;
            switchTab(tabName);
        });
    });

    // Series subtabs
    document.querySelectorAll('[data-series-tab]').forEach(button => {
        button.addEventListener('click', (e) => {
            const seriesName = e.currentTarget.dataset.seriesTab;
            switchSeriesTab(seriesName);
        });
    });

    // Line drawing actions
    const lineActions = {
        'phase-text-top': phaseTextTop,
        'phase-text-bottom': phaseTextBottom,
        'aim-diagonal': aimDiagonal,
        'aim-horizontal': aimHorizontal,
        'other-scissors': otherScissors,
        'other-celeration': otherCeleration
    };

    Object.entries(lineActions).forEach(([action, handler]) => {
        const element = document.querySelector(`[data-action="${action}"]`);
        if (element) {
            element.addEventListener('click', handler);
        }
    });


    // Data entry
    const submitEntryBtn = document.querySelector('[data-action="submit-entry"]');
    if (submitEntryBtn) {
        submitEntryBtn.addEventListener('click', submitEntry);
    }

    // Date adjustment buttons
    document.querySelectorAll('[data-action="adjust-date"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const offset = parseInt(e.currentTarget.dataset.offset);
            adjustDate(offset);
        });
    });

    // Data tab date adjustment buttons
    document.querySelectorAll('[data-action="adjust-data-date"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const offset = parseInt(e.currentTarget.dataset.offset);
            adjustDataDate(offset);
            loadDataForDate();
        });
    });

    // Data tab date input change
    const dataDateInput = document.getElementById('data-entry-date');
    if (dataDateInput) {
        dataDateInput.addEventListener('change', loadDataForDate);
    }

    // Data tab timestamp adjustment buttons
    document.querySelectorAll('[data-action="adjust-timestamp"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const offset = parseInt(e.currentTarget.dataset.offset);
            adjustTimestamp(offset);
        });
    });

    // Data tab update button
    const updateDataBtn = document.querySelector('[data-action="update-data"]');
    if (updateDataBtn) {
        updateDataBtn.addEventListener('click', updateCurrentEntry);
    }

    // Data tab delete button
    const deleteDataBtn = document.querySelector('[data-action="delete-data"]');
    if (deleteDataBtn) {
        deleteDataBtn.addEventListener('click', deleteCurrentEntry);
    }

    // Credit
    const submitCreditBtn = document.querySelector('[data-action="submit-credit"]');
    if (submitCreditBtn) {
        submitCreditBtn.addEventListener('click', submitCredit);
    }

    // Series trace config apply buttons
    const traceApplyActions = {
        'apply-correct-trace': () => applyTraceConfig('correct'),
        'apply-incorrect-trace': () => applyTraceConfig('incorrect'),
        'apply-timing-trace': () => applyTraceConfig('timing'),
        'apply-misc1-trace': () => applyTraceConfig('misc1'),
        'apply-misc2-trace': () => applyTraceConfig('misc2')
    };

    Object.entries(traceApplyActions).forEach(([action, handler]) => {
        const element = document.querySelector(`[data-action="${action}"]`);
        if (element) {
            element.addEventListener('click', handler);
        }
    });

    // Series trace config reset buttons
    document.querySelectorAll('[data-action^="reset-trace-"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const seriesName = e.currentTarget.dataset.action.replace('reset-trace-', '');
            resetTraceConfig(seriesName);
        });
    });

    // Show line toggle checkboxes - now handled in initializeLineWidthToggles() in chartReplot.js

    // Other date change handler
    const otherDateInput = document.getElementById('other-date');
    if (otherDateInput) {
        otherDateInput.addEventListener('change', handleOtherDateChange);
    }

    // Legend toggle
    const legendToggle = document.getElementById('legend-toggle');
    if (legendToggle) {
        // Initialize checkbox state from chartState
        legendToggle.checked = chartState.legend.show;

        legendToggle.addEventListener('change', (e) => {
            toggleLegend(e.target.checked);
            // Blur the checkbox so spacebar can be used for navigation
            e.target.blur();
        });
    }

    // Legend position dropdown
    const legendPosition = document.getElementById('legend-position');
    if (legendPosition) {
        // Initialize dropdown from chartState
        legendPosition.value = chartState.legend.position;

        // Initialize disabled state based on legend visibility
        legendPosition.disabled = !chartState.legend.show;

        legendPosition.addEventListener('change', (e) => {
            chartState.legend.position = e.target.value;
            eventBus.emit(EVENTS.UI_LEGEND_RENDER);
        });
    }

    // Add block buttons - handle adding new aggregation blocks
    document.querySelectorAll('.add-block-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const seriesName = e.currentTarget.dataset.series;
            addAggregationBlock(seriesName);
        });
    });

    // Remove block buttons - use event delegation since blocks are dynamic
    document.addEventListener('click', (e) => {
        if (e.target.closest('.remove-block-btn')) {
            const block = e.target.closest('.agg-config-block');
            removeAggregationBlock(block);
        }
    });

    console.log('Event listeners set up');
}

console.log('Main.js loaded');
