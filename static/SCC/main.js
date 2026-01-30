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
import { CORRECTS, ERRORS, TIMING } from './config.js';
import './debug.js';
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
import { alignStartDate, updateChartDateLabels, updateDateDisplay, adjustDateInput, initializeDateInput, updatePlotDateLabel } from './util/dates.js';
import { initStartDateControls } from './util/startDateControls.js';
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
import { initGridToggle, toggleDateLines, toggleCountLines, toggleMinorGrid } from './misc/grid.js';
import { injectCelerationFan, initFanDrag, regenerateFan, init as celerationFanInit } from './misc/celerationFan.js';
import { injectCredits, initCreditClick, regenerateCredits, init as creditInit } from './misc/credit.js';
import { toggleLegend, renderCustomLegend, init as customLegendInit } from './misc/customLegend.js';
import { setupPanConstraints } from './util/panning_controls.js';
import { resizeChartByHeight, CHART_CONFIG } from './util/resize_chart/resize-chart.js';
import { getTemplate } from './util/chartLayouts.js';
import { showInitialMenuHint } from './util/tooltip.js';
import { icons } from './util/icons.js';
import { initializeShareTab } from './misc/share.js';
import { init as crosshairInit } from './util/crosshair.js';
import { initStorage } from './storage/chartStorage.js';
import { initImportUI } from './util/importUI.js';

// ============================================================================
// CHART INITIALIZATION
// ============================================================================

/**
 * Initialize the chart using client-side templates
 * Template is loaded based on chartState.chartType and chartState.minuteChart
 */
export function initializeChart() {
    // Update UI based on chartState.minuteChart (already set in chartState.js)
    updateTimingVisibility();

    // Get template from client-side module
    let plotData = getTemplate(chartState.chartType, chartState.minuteChart);
    if (!plotData) {
        console.error('Failed to load template for:', chartState.chartType, chartState.minuteChart);
        return;
    }

    // Get maxWindowWidth from config
    const maxWindowWidth = (CHART_CONFIG[chartState.chartType]?.maxWindow || 140) + 0.4;

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

    // Inject credit line annotations (margin already handled by resize)
    plotData = injectCredits(plotData);

    // DEBUG: Log grid traces before render
    console.log('=== GRID DEBUG ===');
    console.log('Chart type:', chartState.chartType);
    plotData.data.forEach((trace, i) => {
        if (trace.name && trace.name.includes('horizontal')) {
            console.log(`Trace ${i}: ${trace.name}`);
            console.log(`  x first 6: ${trace.x?.slice(0, 6).join(', ')}`);
            console.log(`  y first 6: ${trace.y?.slice(0, 6).join(', ')}`);
            console.log(`  line:`, trace.line);
            console.log(`  mode:`, trace.mode);
        }
    });
    console.log('X-axis range:', plotData.layout.xaxis.range);
    console.log('Y-axis type:', plotData.layout.yaxis.type);
    console.log('Y-axis range:', plotData.layout.yaxis.range);
    console.log('Y-axis2 tickvals:', plotData.layout.yaxis2?.tickvals?.slice(0, 5));
    console.log('=================');

    // Disable mouse panning (use Pan Chart buttons instead)
    plotData.layout.xaxis.fixedrange = true;

    // Create chart
    Plotly.newPlot(chartDiv, plotData.data, plotData.layout, {
        displayModeBar: false,
        scrollZoom: false,
        doubleClick: false
    });

    // Initialize chartState capacity and window from config and actual range
    const chartConfig = CHART_CONFIG[chartState.chartType];
    chartState.chartCapacity = chartConfig?.capacity || 280;
    chartState.chartWindow = Math.round(chartDiv.layout.xaxis.range[1]);

    // Update display elements (setupEventListeners ran before initializeChart)
    const windowDisplay = document.getElementById('chart-window');
    if (windowDisplay) windowDisplay.textContent = chartState.chartWindow;

    setupPanConstraints(chartDiv, maxWindowWidth, chartState.chartType);

    // Initialize draggable fan
    initFanDrag();

    // Initialize credit click handler
    initCreditClick();

    // Observe container for resize (fullscreen, viewport changes)
    if (chartContainer) {
        const MOBILE_BREAKPOINT = 768;
        const MIN_DESKTOP_WIDTH = 900;
        const MIN_DESKTOP_HEIGHT = 500;

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

                const newHeight = entries[0].contentRect.height * 0.98;
                const config = CHART_CONFIG[chartState.chartType];
                // Use the current chart margins (already expanded for fan/credits)
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
                    regenerateCredits();
                    renderCustomLegend();
                });
            }, 100);
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

    // Update the "Plot Date" label based on chart type
    updatePlotDateLabel();

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

    // Initialize import tab UI
    initImportUI();

    // Initialize series input controls
    initializeAllSeriesInputs();
    initializeLineWidthToggles();

    // Initialize button visibility for core series
    [CORRECTS, ERRORS, TIMING].forEach(updateButtonVisibility);

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
        'apply-corrects-trace': () => applyTraceConfig(CORRECTS),
        'apply-errors-trace': () => applyTraceConfig(ERRORS),
        'apply-timing-trace': () => applyTraceConfig(TIMING),
        'reset-trace-corrects': () => resetTraceConfig(CORRECTS),
        'reset-trace-errors': () => resetTraceConfig(ERRORS),
        'reset-trace-timing': () => resetTraceConfig(TIMING)
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

    // Chart window controls (chevron buttons with debouncing)
    const chartWindowDisplay = document.getElementById('chart-window');
    if (chartWindowDisplay) {
        chartWindowDisplay.textContent = chartState.chartWindow;

        let windowDebounceTimer = null;
        const DEBOUNCE_DELAY = 150; // ms
        const chartDiv = document.getElementById('chart');

        const updateChartWindow = (newValue) => {
            const config = CHART_CONFIG[chartState.chartType];
            const minWindow = config?.minXmax || config?.snapTo || 14;

            // Clamp value between min and capacity
            if (newValue < minWindow) newValue = minWindow;
            if (newValue > chartState.chartCapacity) newValue = chartState.chartCapacity;

            chartState.chartWindow = newValue;
            chartWindowDisplay.textContent = newValue;

            // Debounce the relayout for fast clicking
            clearTimeout(windowDebounceTimer);
            windowDebounceTimer = setTimeout(() => {
                // Recalculate width to maintain 34° diagonal (same as ResizeObserver)
                const margin = chartDiv.layout.margin;
                const height = chartDiv.layout.height;
                const deg = 34;
                const yaxis_px = height - (margin.t + margin.b);
                const y_axis = Math.log10(config.yMax) - Math.log10(config.yMin);
                const delta_y = Math.log10(2 ** (newValue / config.unit));
                const delta_y_px = (delta_y / y_axis) * yaxis_px;
                const xaxis_px = delta_y_px / Math.tan((deg * Math.PI) / 180);
                const newWidth = xaxis_px + (margin.l + margin.r);

                Plotly.relayout(chartDiv, {
                    'xaxis.range': [-0.2, newValue + 0.2],
                    width: newWidth
                }).then(() => {
                    regenerateFan();
                    regenerateCredits();
                    renderCustomLegend();
                });
            }, DEBOUNCE_DELAY);
        };

        document.querySelector('[data-action="chart-window-dec"]')?.addEventListener('click', () => {
            const increment = CHART_CONFIG[chartState.chartType]?.snapTo || 14;
            updateChartWindow(chartState.chartWindow - increment);
        });

        document.querySelector('[data-action="chart-window-inc"]')?.addEventListener('click', () => {
            const increment = CHART_CONFIG[chartState.chartType]?.snapTo || 14;
            updateChartWindow(chartState.chartWindow + increment);
        });
    }

    // Pan Chart controls - uses Plotly's native panning mechanism
    const chartDiv = document.getElementById('chart');
    const panDisplay = document.getElementById('chart-pan-position');
    const panIncrement = () => CHART_CONFIG[chartState.chartType]?.snapTo || 14;

    const updatePanDisplay = () => {
        if (panDisplay) {
            // Show start position (range[0] + margin offset, rounded)
            panDisplay.textContent = Math.round(chartDiv.layout.xaxis.range[0] + 0.2);
        }
    };

    document.querySelector('[data-action="chart-pan-left"]')?.addEventListener('click', () => {
        const currentRange = chartDiv.layout.xaxis.range;
        const shift = panIncrement();
        Plotly.relayout(chartDiv, {
            'xaxis.range[0]': currentRange[0] - shift,
            'xaxis.range[1]': currentRange[1] - shift
        }).then(updatePanDisplay);
    });

    document.querySelector('[data-action="chart-pan-right"]')?.addEventListener('click', () => {
        const currentRange = chartDiv.layout.xaxis.range;
        const shift = panIncrement();
        Plotly.relayout(chartDiv, {
            'xaxis.range[0]': currentRange[0] + shift,
            'xaxis.range[1]': currentRange[1] + shift
        }).then(updatePanDisplay);
    });

    console.log('Event listeners set up');
}

console.log('Main.js loaded');
