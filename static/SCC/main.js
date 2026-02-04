/**
 * Main entry point for the application
 *
 * This module:
 * - Imports all necessary functions from other modules
 * - Initializes the application and sets up event listeners
 * - Uses ES6 module standard with event delegation
 */

// Debug logger must be imported first to capture all logs

// Import state and functions from modules
import { chartState } from './chartState.js';
import { CORRECTS, ERRORS, TIMING, MOBILE_BREAKPOINT, MIN_DESKTOP_WIDTH, MIN_DESKTOP_HEIGHT, TIMING_MS, CHART_MATH, LAYOUT } from './config.js';
import './debug.js';
import { eventBus, EVENTS } from './eventBus.js';
import {
    submitEntry,
    setStartDate,
    updateTimingVisibility,
    init as dataEntryInit
} from './series/dataEntry.js';
import { initializeSeriesNav } from './series/traceStyles.js';
import { createToast } from './ui/toaster.js';
import { refreshChart, init as replotInit } from './series/replot.js';
import { alignStartDate, updateChartDateLabels, updateDateDisplay, adjustDateInput, initializeDateInput, updatePlotDateLabel } from './util/dates.js';
import { initStartDateModal } from './ui/startDateModal.js';
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
    isLineEditingEnabled,
    initGestureNavigation,
    initFormKeyboardShortcuts,
    init as navigationInit
} from './navigation.js';
import { setupClickHandler, init as lineClickHandlerInit } from './lines/lineClickHandler.js';
import { init as phaseLinesInit } from './lines/phaseLines.js';
import { init as aimLinesInit } from './lines/aimLines.js';
import { init as cutLinesInit } from './lines/cutLines.js';
import { init as celLineInit } from './lines/celLine.js';
import { initGridToggle, toggleDateLines, toggleCountLines, toggleMinorGrid } from './misc/grid.js';
import { injectCelerationFan, initFanDrag, toggleCelerationFan, init as celerationFanInit } from './misc/celerationFan.js';
import { injectCredits, initCreditClick, regenerateCredits, init as creditInit } from './misc/credit.js';
import { toggleLegend, renderCustomLegend, init as customLegendInit } from './misc/customLegend.js';
import { setupPanConstraints } from './util/panning_controls.js';
import { resizeChartByHeight, CHART_CONFIG, emitFanReposition } from './util/resize-chart.js';
import { getTemplate } from './util/chartLayouts.js';
import { showInitialMenuHint } from './ui/tooltip.js';
import { icons } from './ui/icons.js';
import { initializeShareTab } from './misc/share.js';
import { init as crosshairInit } from './ui/crosshair.js';
import { init as panSliderInit, setupChartListener as panSliderSetupChart } from './ui/panSlider.js';
import { initStorage } from './storage/chartStorage.js';
import { initImportUI } from './import/importUI.js';
import { initServerSync } from '../Server/init.js';

/**
 * Initialize the chart using client-side templates
 */
export function initializeChart() {
    updateTimingVisibility();

    let plotData = getTemplate(chartState.chartType, chartState.minuteChart);
    if (!plotData) {
        console.error('Failed to load template for:', chartState.chartType, chartState.minuteChart);
        return;
    }

    const chartDiv = document.getElementById('chart');

    // Get container dimensions: use #chart-container on desktop, window dimensions on mobile
    const chartContainer = document.getElementById('chart-container');
    const containerWidth = chartContainer ? chartContainer.clientWidth : window.innerWidth;
    const containerHeight = chartContainer ? chartContainer.clientHeight : window.innerHeight;

    // Resize chart based on chart type (includes peeling and margin expansion for fan)
    plotData = resizeChartByHeight(plotData, containerWidth, containerHeight, chartState.chartType, {
        fanVisible: true,
        isMinuteChart: chartState.minuteChart
    });

    // Inject celeration fan shapes/annotations (margins already handled by resize)
    plotData = injectCelerationFan(plotData, chartState.minuteChart, chartState.chartType);

    plotData = injectCredits(plotData);

    plotData.layout.xaxis.fixedrange = true;

    Plotly.newPlot(chartDiv, plotData.data, plotData.layout, {
        displayModeBar: false,
        scrollZoom: false,
        doubleClick: false
    });

    chartDiv.on('plotly_afterplot', syncVisibilityState);

    // Initialize chartState capacity from config
    const chartConfig = CHART_CONFIG[chartState.chartType];
    chartState.chartCapacity = chartConfig?.capacity || 280;
    if (!chartState.id) {
        chartState.chartWindow = chartConfig?.maxWindow || 140;
    }

    // Update display elements (setupEventListeners ran before initializeChart)
    const windowDisplay = document.getElementById('chart-window');
    if (windowDisplay) windowDisplay.textContent = chartState.chartWindow;

    setupPanConstraints(chartDiv, chartState.chartType);

    // Initialize draggable fan
    initFanDrag();

    // Initialize credit click handler
    initCreditClick();

    // Observe container for resize (fullscreen, viewport changes)
    if (chartContainer) {
        let resizeTimeout;
        const resizeObserver = new ResizeObserver((entries) => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                // On non-mobile screens, hide chart if viewport too small
                if (viewportWidth >= MOBILE_BREAKPOINT) {
                    if (viewportWidth < MIN_DESKTOP_WIDTH || viewportHeight < MIN_DESKTOP_HEIGHT) {
                        chartDiv.style.visibility = 'hidden';
                        return;
                    }
                }
                chartDiv.style.visibility = 'visible';

                const newHeight = entries[0].contentRect.height * LAYOUT.CHART_HEIGHT_MULTIPLIER;
                const config = CHART_CONFIG[chartState.chartType];
                // Use the current chart margins (already expanded for fan/credits)
                const margin = chartDiv.layout.margin;
                // Use chartState.chartWindow - the authoritative window width
                const xmax = chartState.chartWindow;
                const deg = CHART_MATH.ANGLE_DEGREES;
                const yaxis_px = newHeight - (margin.t + margin.b);
                const y_axis = Math.log10(config.yMax) - Math.log10(config.yMin);
                const delta_y = Math.log10(2 ** (xmax / config.unit));
                const delta_y_px = (delta_y / y_axis) * yaxis_px;
                const xaxis_px = delta_y_px / Math.tan((deg * Math.PI) / 180);
                const newWidth = xaxis_px + (margin.l + margin.r);

                // Preserve the current x-axis range to prevent stretching after pan
                const currentRange = chartDiv.layout.xaxis.range;

                Plotly.relayout(chartDiv, {
                    height: newHeight,
                    width: newWidth,
                    'xaxis.range': [currentRange[0], currentRange[1]]
                }).then(() => {
                    emitFanReposition();
                    regenerateCredits();
                    renderCustomLegend();
                });
            }, TIMING_MS.RESIZE_DEBOUNCE);
        });
        resizeObserver.observe(chartContainer);
    }

    // Initialize startDate using chart-type-specific alignment
    if (!chartState.startDate) {
        const now = new Date();
        chartState.startDate = alignStartDate(now, chartState.chartType);

        updateChartDateLabels(chartDiv, chartState.startDate);
    }

    // Initialize click handler
    setupClickHandler();

    // Initialize grid toggle
    initGridToggle();

    // Show initial menu hint
    setTimeout(showInitialMenuHint, TIMING_MS.MENU_HINT_DELAY);

    // Initialize date inputs
    initializeDateInputs();

    // Trigger chart refresh to render data from chartState.series
    refreshChart();
    renderCustomLegend();

    // Set up pan slider last, after everything is initialized
    panSliderSetupChart(chartDiv);
}

/**
 * Sync visual visibility with chartState bools
 * Called after every Plotly render to re-apply CSS visibility states
 * (Plotly regenerates SVG elements, overwriting CSS changes)
 */
function syncVisibilityState() {
    if (!chartState.fanVisible) {
        toggleCelerationFan(false);
    }
    // Future: add other visibility syncs here (grid, etc.)
}

/**
 * Initialize date input fields
 */
function initializeDateInputs() {
    // Entry date input with today's date (shared between New and Previous sub-tabs)
    initializeDateInput('entry-date');

    // Update the "Plot Date" label based on chart type
    updatePlotDateLabel();

    // Initialize start date modal
    initStartDateModal();
}

/**
 * Adjust the entry date by a number of days
 * @param {number} days - Number of days to adjust (positive or negative)
 */
export function adjustDate(days) {
    adjustDateInput('entry-date', days);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Main.js: Initializing application');

    // Initialize event bus subscriptions for all modules
    // Order matters: subscribers must register before events are emitted
    lineClickHandlerInit();
    dataEntryInit();
    replotInit();
    dataUpdateInit();
    navigationInit();
    phaseLinesInit();
    aimLinesInit();
    cutLinesInit();
    celLineInit();
    customLegendInit();
    crosshairInit();
    celerationFanInit();
    creditInit();
    panSliderInit();
    console.log('Main.js: Event bus subscriptions initialized');

    // Initialize IndexedDB storage
    initStorage().then(success => {
        if (success) {
            console.log('Main.js: Storage initialized');
        } else {
            console.warn('Main.js: Storage initialization failed');
        }
    });

    // Initialize server sync (generates passphrase if needed)
    initServerSync().catch(err => console.warn('Main.js: Server sync init failed:', err));

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

    // Initialize import tab UI
    initImportUI();

    // Initialize series navigation and config panel
    initializeSeriesNav();

    console.log('Main.js: Application initialized');
});

export function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('[data-tab]').forEach(button => {
        button.addEventListener('click', (e) => {
            const tabName = e.currentTarget.dataset.tab;
            switchTab(tabName);
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

    // Line edit toggle
    const lineEditToggle = document.getElementById('line-edit-toggle');
    if (lineEditToggle) {
        // Initialize checkbox state
        lineEditToggle.checked = isLineEditingEnabled();

        lineEditToggle.addEventListener('change', (e) => {
            // Only toggle if the state differs from checkbox
            if (e.target.checked !== isLineEditingEnabled()) {
                toggleLineClickability();
            }
            e.target.blur();
        });

        // Keep toggle in sync when edit mode changes programmatically
        eventBus.subscribe(EVENTS.NAV_LINE_CLICKABILITY_TOGGLE, ({ enabled }) => {
            lineEditToggle.checked = enabled;
        }, true);
    }

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

    // Place zeros below floor toggle
    const placeZerosToggle = document.getElementById('place-zeros-below-floor-toggle');
    if (placeZerosToggle) {
        // Initialize checkbox state from chartState
        placeZerosToggle.checked = chartState.placeZerosBelowFloor;

        placeZerosToggle.addEventListener('change', (e) => {
            chartState.placeZerosBelowFloor = e.target.checked;
            // Trigger chart refresh to apply the change
            eventBus.emit(EVENTS.DATA_CHART_REFRESH);
            e.target.blur();
        });
    }

    // Grid toggles
    const gridDateLinesToggle = document.getElementById('grid-date-lines-toggle');
    if (gridDateLinesToggle) {
        gridDateLinesToggle.addEventListener('change', (e) => {
            toggleDateLines(e.target.checked);
            e.target.blur();
        });
    }

    const gridCountLinesToggle = document.getElementById('grid-count-lines-toggle');
    if (gridCountLinesToggle) {
        gridCountLinesToggle.addEventListener('change', (e) => {
            toggleCountLines(e.target.checked);
            e.target.blur();
        });
    }

    const gridMinorToggle = document.getElementById('grid-minor-toggle');
    if (gridMinorToggle) {
        gridMinorToggle.addEventListener('change', (e) => {
            toggleMinorGrid(e.target.checked);
            e.target.blur();
        });
    }

    // Sync grid toggles when legend toggles entire grid
    eventBus.subscribe(EVENTS.CHART_GRID_VISIBILITY_CHANGED, ({ visible }) => {
        if (gridDateLinesToggle) gridDateLinesToggle.checked = visible;
        if (gridCountLinesToggle) gridCountLinesToggle.checked = visible;
        if (gridMinorToggle) gridMinorToggle.checked = visible;
    }, true);

    // Trend fit method dropdown
    const fitMethodSelect = document.getElementById('fit-method');
    if (fitMethodSelect) {
        // Initialize from chartState
        const settings = chartState.CelLines.settings || {};
        fitMethodSelect.value = settings.fitMethod || 'Theil-Sen';

        fitMethodSelect.addEventListener('change', (e) => {
            if (!chartState.CelLines.settings) {
                chartState.CelLines.settings = {};
            }
            chartState.CelLines.settings.fitMethod = e.target.value;
            e.target.blur();
        });
    }

    // Bounce envelope dropdown
    const bounceEnvelopeSelect = document.getElementById('bounce-envelope');
    if (bounceEnvelopeSelect) {
        // Initialize from chartState
        const settings = chartState.CelLines.settings || {};
        bounceEnvelopeSelect.value = settings.bounceEnvelope || 'None';

        bounceEnvelopeSelect.addEventListener('change', (e) => {
            if (!chartState.CelLines.settings) {
                chartState.CelLines.settings = {};
            }
            chartState.CelLines.settings.bounceEnvelope = e.target.value;
            e.target.blur();
        });
    }

    // Trend forecast input
    const trendForecastInput = document.getElementById('trend-forecast');
    if (trendForecastInput) {
        // Initialize from chartState
        const settings = chartState.CelLines.settings || {};
        trendForecastInput.value = settings.forecast || 0;

        trendForecastInput.addEventListener('change', (e) => {
            if (!chartState.CelLines.settings) {
                chartState.CelLines.settings = {};
            }
            const value = parseInt(e.target.value) || 0;
            chartState.CelLines.settings.forecast = Math.max(0, value);
            e.target.value = chartState.CelLines.settings.forecast;
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

    // Chart window update handler - subscribes to CHART_WINDOW_CHANGED event
    const chartDiv = document.getElementById('chart');

    const applyChartWindow = (newValue) => {
        const config = CHART_CONFIG[chartState.chartType];
        const minWindow = config?.minXmax || config?.snapTo || 14;

        // Clamp value between min and capacity
        if (newValue < minWindow) newValue = minWindow;
        if (newValue > chartState.chartCapacity) newValue = chartState.chartCapacity;

        chartState.chartWindow = newValue;

        // Recalculate width to maintain correct diagonal (same as ResizeObserver)
        const margin = chartDiv.layout.margin;
        const height = chartDiv.layout.height;
        const deg = CHART_MATH.ANGLE_DEGREES;
        const yaxis_px = height - (margin.t + margin.b);
        const y_axis = Math.log10(config.yMax) - Math.log10(config.yMin);
        const delta_y = Math.log10(2 ** (newValue / config.unit));
        const delta_y_px = (delta_y / y_axis) * yaxis_px;
        const xaxis_px = delta_y_px / Math.tan((deg * Math.PI) / 180);
        const newWidth = xaxis_px + (margin.l + margin.r);

        Plotly.relayout(chartDiv, {
            'xaxis.range': [-LAYOUT.X_AXIS_MARGIN_OFFSET, newValue + LAYOUT.X_AXIS_MARGIN_OFFSET],
            width: newWidth
        }).then(() => {
            emitFanReposition();
            regenerateCredits();
            renderCustomLegend();
            // Slider updates automatically via plotly_relayout event
        });
    };

    // Subscribe to chart window change events (from navigation modal)
    eventBus.subscribe(EVENTS.CHART_WINDOW_CHANGED, (newValue) => {
        applyChartWindow(newValue);
    }, true);

    console.log('Event listeners set up');
}

console.log('Main.js loaded');
