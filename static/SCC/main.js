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
    updateTimingVisibility,
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
    removeAggregationBlock,
    updateButtonVisibility
} from './series/traceStyles.js';
import { addMiscSeries, canAddMiscSeries } from './series/miscSeries.js';
import { createToast } from './util/toaster.js';
import { refreshChart, init as replotInit } from './series/replot.js';
import { updateChartDateLabels, updateDateDisplay, adjustDateInput, initializeDateInput } from './util/dates.js';
import { initStartDateControls } from './util/startDateControls.js';
import { renderCredits, init as creditInit } from './misc/credit.js';
import { loadDataForDate, adjustTimestamp, updateCurrentEntry, deleteCurrentEntry, init as dataUpdateInit } from './series/dataUpdate.js';
import {
    showCounter,
    hideCounter,
    switchTab,
    switchDataSubtab,
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
import { injectCelerationFan, initFanDrag, regenerateFan, init as celerationFanInit } from './misc/celerationFan.js';
import { toggleLegend, renderCustomLegend, init as customLegendInit } from './misc/customLegend.js';
import { setupPanConstraints } from './util/panning_controls.js';
import { resizeChartByHeight, CHART_CONFIG } from './util/resize_chart/resize-chart.js';
import { showInitialMenuHint } from './util/tooltip.js';
import { icons } from './util/icons.js';
import { initializeShareTab } from './misc/share.js';
import { init as crosshairInit } from './util/crosshair.js';
import { initStorage } from './storage/chartStorage.js';
import './util/jsonBackwardsCompatibility.js';

// ============================================================================
// CHART INITIALIZATION
// ============================================================================

/**
 * Initialize the chart with server-rendered data
 * @param {Object} plotData - Plot data from Jinja template
 * @param {number} maxWindowWidth - Max window width from template
 */
export function initializeChart(plotData, maxWindowWidth) {
    // Update UI based on chartState.minuteChart (already set in chartState.js)
    updateTimingVisibility();

    const chartDiv = document.getElementById('chart');

    // Get container height: use #chart-container on desktop, window.innerHeight on mobile
    const chartContainer = document.getElementById('chart-container');
    const containerHeight = chartContainer ? chartContainer.clientHeight : window.innerHeight;

    // Resize chart based on chart type
    plotData = resizeChartByHeight(plotData, containerHeight, chartState.chartType);

    // Inject celeration fan into plotData BEFORE initial render (avoids clipping)
    plotData = injectCelerationFan(plotData, chartState.minuteChart, chartState.chartType);

    // Create chart
    Plotly.newPlot(chartDiv, plotData.data, plotData.layout, {
        displayModeBar: false,
        scrollZoom: false,
        doubleClick: false
    });

    setupPanConstraints(chartDiv, maxWindowWidth, chartState.chartType);

    // Initialize draggable fan
    initFanDrag();

    // Observe container for resize (fullscreen, viewport changes)
    if (chartContainer) {
        let resizeTimeout;
        const resizeObserver = new ResizeObserver((entries) => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const newHeight = entries[0].contentRect.height * 0.98;
                const config = CHART_CONFIG[chartState.chartType];
                const margin = chartDiv.layout.margin;
                const xmax = Math.round(chartDiv.layout.xaxis.range[1]);
                const deg = 34;
                const yaxis_px = newHeight - (margin.t + margin.b);
                const y_axis = Math.log10(config.yMax) - Math.log10(config.yMin);
                const delta_y = Math.log10(2 ** (xmax / config.unit));
                const delta_y_px = (delta_y / y_axis) * yaxis_px;
                const xaxis_px = delta_y_px / Math.tan((deg * Math.PI) / 180);
                const newWidth = xaxis_px + (margin.l + margin.r);

                Plotly.relayout(chartDiv, { height: newHeight, width: newWidth }).then(() => {
                    regenerateFan();
                    renderCredits();
                    renderCustomLegend();
                });
            }, 100);
        });
        resizeObserver.observe(chartContainer);
    }

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
    // Entry date input with today's date (shared between New and Previous sub-tabs)
    initializeDateInput('entry-date');

    // Initialize start date controls in Chart tab
    initStartDateControls();
}

/**
 * Adjust the entry date by a number of days
 * @param {number} days - Number of days to adjust (positive or negative)
 */
export function adjustDate(days) {
    adjustDateInput('entry-date', days);
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
    crosshairInit();
    celerationFanInit();
    console.log('Main.js: Event bus subscriptions initialized');

    // Initialize IndexedDB storage
    initStorage().then(success => {
        if (success) {
            console.log('Main.js: Storage initialized');
        } else {
            console.warn('Main.js: Storage initialization failed');
        }
    });

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

    // Initialize button visibility for core series
    ['correct', 'incorrect', 'timing'].forEach(updateButtonVisibility);

    console.log('Main.js: Application initialized');
});

// ============================================================================
// EVENT LISTENERS
// ============================================================================

export function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('[data-tab]').forEach(button => {
        button.addEventListener('click', (e) => {
            const tabName = e.currentTarget.dataset.tab;
            switchTab(tabName);
        });
    });

    // Series subtabs
    document.querySelectorAll('.series-subtab[data-series-tab]').forEach(button => {
        button.addEventListener('click', (e) => {
            const seriesName = e.currentTarget.dataset.seriesTab;
            switchSeriesTab(seriesName);
        });
    });

    // Add misc series button
    const addMiscSeriesBtn = document.querySelector('[data-action="add-misc-series"]');
    if (addMiscSeriesBtn) {
        addMiscSeriesBtn.addEventListener('click', () => {
            if (!canAddMiscSeries()) {
                createToast({ message: 'Maximum of 10 misc series reached.', duration: 3000 });
                return;
            }
            addMiscSeries();
        });
    }

    // Add aggregation block buttons (inside each series panel)
    document.querySelectorAll('.add-block-btn[data-series]').forEach(button => {
        button.addEventListener('click', (e) => {
            const seriesName = e.currentTarget.dataset.series;
            addAggregationBlock(seriesName);
        });
    });

    // Remove aggregation block buttons
    document.querySelectorAll('.remove-block-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const block = e.target.closest('.agg-config-block');
            if (block) {
                removeAggregationBlock(block);
            }
        });
    });

    // Data sub-tabs (New / Previous)
    document.querySelectorAll('[data-subtab]').forEach(button => {
        button.addEventListener('click', (e) => {
            const subtab = e.currentTarget.dataset.subtab;
            switchDataSubtab(subtab);
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

    // Apply and Reset buttons for each series
    const traceActions = {
        'apply-correct-trace': () => applyTraceConfig('correct'),
        'apply-incorrect-trace': () => applyTraceConfig('incorrect'),
        'apply-timing-trace': () => applyTraceConfig('timing'),
        'reset-trace-correct': () => resetTraceConfig('correct'),
        'reset-trace-incorrect': () => resetTraceConfig('incorrect'),
        'reset-trace-timing': () => resetTraceConfig('timing')
    };

    Object.entries(traceActions).forEach(([action, handler]) => {
        const element = document.querySelector(`[data-action="${action}"]`);
        if (element) {
            element.addEventListener('click', handler);
        }
    });

    // Show line toggle checkboxes - now handled in initializeLineWidthToggles() in chartReplot.js

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

    // Celeration fan toggle
    const fanToggle = document.getElementById('fan-toggle');
    if (fanToggle) {
        // Initialize checkbox state from chartState
        fanToggle.checked = chartState.fanVisible;

        fanToggle.addEventListener('change', (e) => {
            eventBus.emit(EVENTS.FAN_VISIBILITY_CHANGED, { visible: e.target.checked });
            // Blur the checkbox so spacebar can be used for navigation
            e.target.blur();
        });
    }

    // Chart name input
    const chartNameInput = document.getElementById('chart-name');
    if (chartNameInput) {
        // Initialize input from chartState
        chartNameInput.value = chartState.chartName !== 'Unnamed' ? chartState.chartName : '';

        chartNameInput.addEventListener('input', (e) => {
            chartState.chartName = e.target.value.trim() || 'Unnamed';
            eventBus.emit(EVENTS.CHART_NAME_CHANGED, { name: chartState.chartName });
        });
    }

    // Chart capacity input
    const chartCapacityInput = document.getElementById('chart-capacity');
    if (chartCapacityInput) {
        chartCapacityInput.value = chartState.chartCapacity;

        chartCapacityInput.addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            if (value > 0) {
                chartState.chartCapacity = value;
                // Ensure window doesn't exceed capacity
                if (chartState.chartWindow > value) {
                    chartState.chartWindow = value;
                    const windowInput = document.getElementById('chart-window');
                    if (windowInput) windowInput.value = value;
                }
                // Disable panning if capacity equals window
                eventBus.emit(EVENTS.CHART_PANNING_ENABLED_CHANGED, chartState.chartCapacity !== chartState.chartWindow);
            }
        });
    }

    // Chart window input
    const chartWindowInput = document.getElementById('chart-window');
    if (chartWindowInput) {
        chartWindowInput.value = chartState.chartWindow;

        chartWindowInput.addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            if (value > 0 && value <= chartState.chartCapacity) {
                chartState.chartWindow = value;
            } else if (value > chartState.chartCapacity) {
                // Cap at capacity
                chartState.chartWindow = chartState.chartCapacity;
                e.target.value = chartState.chartCapacity;
            }
            // Disable panning if capacity equals window
            eventBus.emit(EVENTS.CHART_PANNING_ENABLED_CHANGED, chartState.chartCapacity !== chartState.chartWindow);
        });
    }

    console.log('Event listeners set up');
}

console.log('Main.js loaded');
