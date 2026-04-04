/**
 * Main entry point for the SCC chart plugin.
 *
 * Stripped of: data entry, data update, import UI, credit editing,
 * storage (chartStorage), sync (syncClient), and debug.
 */

import { chartState } from './SCC/chartState.js';
import { CORRECTS, ERRORS, TIMING, TIMING_MS, CHART_MATH, LAYOUT, CHART_TYPE_CONFIG } from './SCC/config.js';
import { eventBus, EVENTS } from './SCC/eventBus.js';
import { getChartDiv } from './SCC/util/dom.js';
import { newPlot, relayout } from './SCC/util/plotlyWrapper.js';
import { initializeSeriesNav } from './SCC/series/traceStyles.js';
import { createToast, createConfirmToast } from './SCC/ui/toaster.js';
import { init as replotInit } from './SCC/series/replot.js';
import { alignStartDate, updateChartDateLabels, updatePlotDateLabel } from './SCC/util/dates.js';
import { initStartDateModal, initChartWindowControl, initChartHeightControl } from './SCC/ui/startDateModal.js';
import { initLineSettingsModal } from './SCC/ui/lineSettingsModal.js';
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
    toggleLineCategoryEdit,
    isLineCategoryEditEnabled,
    disableAllLineEditing,
    initGestureNavigation,
    init as navigationInit
} from './SCC/navigation.js';
import { setupClickHandler, init as lineClickHandlerInit } from './SCC/lines/lineClickHandler.js';
import { init as phaseLinesInit } from './SCC/lines/phaseLines.js';
import { init as aimLinesInit } from './SCC/lines/aimLines.js';
import { init as cutLinesInit } from './SCC/lines/cutLines.js';
import { init as celLineInit } from './SCC/lines/celLine.js';
import { init as lineHoverInit } from './SCC/lines/lineHover.js';
import { initGridToggle } from './SCC/series/grid.js';
import { injectCelerationFan, initFanDrag, toggleCelerationFan, init as celerationFanInit } from './SCC/ui/celerationFan.js';
import { injectCredits, initCreditClick, regenerateCredits } from './SCC/ui/credit.js';
import { toggleLegend, init as customLegendInit } from './SCC/ui/customLegend.js';
import { setupPanConstraints } from './SCC/util/panning_controls.js';
import { resizeChartByHeight, emitFanReposition, rescaleChartElements } from './SCC/util/resize-chart.js';
import { getTemplate } from './SCC/util/chartLayouts.js';
import { showInitialMenuHint } from './SCC/ui/tooltip.js';
import { icons } from './SCC/ui/icons.js';
import { initializeShareTab } from './SCC/ui/share.js';
import { init as crosshairInit } from './SCC/ui/crosshair.js';
import { init as panSliderInit, setupChartListener as panSliderSetupChart } from './SCC/ui/panSlider.js';
import { initResetSettings } from './SCC/ui/resetSettings.js';

/**
 * Initialize the chart using client-side templates.
 */
export function initializeChart() {
    let plotData = getTemplate(chartState.chartType, chartState.minuteChart);
    if (!plotData) {
        console.error('Failed to load template for:', chartState.chartType, chartState.minuteChart);
        return;
    }

    const chartDiv = getChartDiv();

    const chartContainer = document.getElementById('chart-container');
    if (chartState.containerHeight != null) {
        chartContainer.style.height = `${chartState.containerHeight}px`;
    }
    const containerWidth = chartContainer ? chartContainer.clientWidth : window.innerWidth;
    const containerHeight = chartContainer ? chartContainer.clientHeight : window.innerHeight;
    chartState.containerHeight = containerHeight;

    plotData = resizeChartByHeight(plotData, containerWidth, containerHeight, chartState.chartType, {
        fanVisible: true,
        isMinuteChart: chartState.minuteChart
    });

    plotData = injectCelerationFan(plotData, chartState.minuteChart, chartState.chartType);
    plotData = injectCredits(plotData);

    plotData.layout.xaxis.fixedrange = true;
    plotData.layout.hovermode = 'closest';

    newPlot(chartDiv, plotData.data, plotData.layout, {
        displayModeBar: false,
        scrollZoom: false,
        doubleClick: false
    });

    chartDiv.on('plotly_afterplot', syncVisibilityState);

    const chartConfig = CHART_TYPE_CONFIG[chartState.chartType];
    chartState.chartCapacity = chartConfig?.capacity || 280;
    if (!chartState.id) {
        chartState.chartWindow = chartState.chartCapacity / 2;
    }

    const windowDisplay = document.getElementById('chart-window');
    if (windowDisplay) windowDisplay.textContent = chartState.chartWindow;

    setupPanConstraints(chartDiv, chartState.chartType);

    initFanDrag();
    initCreditClick();

    if (!chartState.startDate) {
        const now = new Date();
        chartState.startDate = alignStartDate(now, chartState.chartType);
        updateChartDateLabels(chartDiv, chartState.startDate);
    }

    setupClickHandler();
    initGridToggle();

    setTimeout(showInitialMenuHint, TIMING_MS.MENU_HINT_DELAY);

    initializeDateInputs();

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);

    panSliderSetupChart(chartDiv);
}

function syncVisibilityState() {
    if (!chartState.fanVisible) {
        toggleCelerationFan(false);
    }
}

function initializeDateInputs() {
    updatePlotDateLabel();
    initStartDateModal();
    initChartWindowControl();
    initChartHeightControl();
}

export function runModuleInits() {
    lineClickHandlerInit();
    replotInit();
    navigationInit();
    phaseLinesInit();
    aimLinesInit();
    cutLinesInit();
    celLineInit();
    lineHoverInit();
    customLegendInit();
    crosshairInit();
    celerationFanInit();
    panSliderInit();
}

export function injectIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(button => {
        const iconName = button.dataset.icon;
        if (icons[iconName]) {
            button.innerHTML = icons[iconName]();
        }
    });
}

export function runUIInits() {
    initGestureNavigation();
    initLineSettingsModal();
    initializeShareTab();
    initResetSettings();
    initializeSeriesNav();
}

export function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('[data-tab]').forEach(button => {
        button.addEventListener('click', (e) => {
            const tabName = e.currentTarget.dataset.tab;
            switchTab(tabName);
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
            element.addEventListener('click', () => {
                disableAllLineEditing();
                handler();
            });
        }
    });

    // Per-category line edit toggles
    document.querySelectorAll('[data-edit-category]').forEach(checkbox => {
        const category = checkbox.dataset.editCategory;
        checkbox.checked = isLineCategoryEditEnabled(category);
        checkbox.addEventListener('change', (e) => {
            toggleLineCategoryEdit(category, e.target.checked);
            e.target.blur();
        });
    });

    eventBus.subscribe(EVENTS.NAV_LINE_CLICKABILITY_TOGGLE, ({ category, enabled }) => {
        const checkbox = document.querySelector(`[data-edit-category="${category}"]`);
        if (checkbox) {
            checkbox.checked = enabled;
        }
    }, true);

    // Legend toggle
    const legendToggle = document.getElementById('legend-toggle');
    if (legendToggle) {
        legendToggle.checked = chartState.legend.show;
        legendToggle.addEventListener('change', (e) => {
            toggleLegend(e.target.checked);
            e.target.blur();
        });
    }

    // Legend position dropdown
    const legendPosition = document.getElementById('legend-position');
    if (legendPosition) {
        legendPosition.value = chartState.legend.position;
        legendPosition.disabled = !chartState.legend.show;
        legendPosition.addEventListener('change', (e) => {
            chartState.legend.position = e.target.value;
            eventBus.emit(EVENTS.UI_LEGEND_RENDER);
        });
    }

    // Celeration fan toggle
    const fanToggle = document.getElementById('fan-toggle');
    if (fanToggle) {
        fanToggle.checked = chartState.fanVisible;
        fanToggle.addEventListener('change', (e) => {
            eventBus.emit(EVENTS.FAN_VISIBILITY_CHANGED, { visible: e.target.checked });
            e.target.blur();
        });
    }

    // Place zeros below floor toggle
    const placeZerosToggle = document.getElementById('place-zeros-below-floor-toggle');
    if (placeZerosToggle) {
        placeZerosToggle.checked = chartState.placeZerosBelowFloor;
        placeZerosToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            chartState.placeZerosBelowFloor = enabled;
            e.target.blur();
            setTimeout(() => {
                eventBus.emit(EVENTS.CHART_ZEROS_CHANGED, { enabled });
                eventBus.emit(EVENTS.DATA_CHART_REFRESH);
            }, 0);
        });
    }

    // Grid toggles
    const isAnyGridOn = () => {
        const g = chartState.lineVisibility.grid;
        return g.dateLines || g.countLines || g.minorGrid;
    };

    const gridDateLinesToggle = document.getElementById('grid-date-lines-toggle');
    if (gridDateLinesToggle) {
        gridDateLinesToggle.checked = chartState.lineVisibility.grid.dateLines;
        gridDateLinesToggle.addEventListener('change', (e) => {
            chartState.lineVisibility.grid.dateLines = e.target.checked;
            e.target.blur();
            setTimeout(() => eventBus.emit(EVENTS.CHART_GRID_VISIBILITY_CHANGED, { visible: isAnyGridOn() }), 0);
        });
    }

    const gridCountLinesToggle = document.getElementById('grid-count-lines-toggle');
    if (gridCountLinesToggle) {
        gridCountLinesToggle.checked = chartState.lineVisibility.grid.countLines;
        gridCountLinesToggle.addEventListener('change', (e) => {
            chartState.lineVisibility.grid.countLines = e.target.checked;
            e.target.blur();
            setTimeout(() => eventBus.emit(EVENTS.CHART_GRID_VISIBILITY_CHANGED, { visible: isAnyGridOn() }), 0);
        });
    }

    const gridMinorToggle = document.getElementById('grid-minor-toggle');
    if (gridMinorToggle) {
        gridMinorToggle.checked = chartState.lineVisibility.grid.minorGrid;
        gridMinorToggle.addEventListener('change', (e) => {
            chartState.lineVisibility.grid.minorGrid = e.target.checked;
            e.target.blur();
            setTimeout(() => eventBus.emit(EVENTS.CHART_GRID_VISIBILITY_CHANGED, { visible: isAnyGridOn() }), 0);
        });
    }

    eventBus.subscribe(EVENTS.CHART_GRID_VISIBILITY_CHANGED, () => {
        const g = chartState.lineVisibility.grid;
        if (gridDateLinesToggle) gridDateLinesToggle.checked = g.dateLines;
        if (gridCountLinesToggle) gridCountLinesToggle.checked = g.countLines;
        if (gridMinorToggle) gridMinorToggle.checked = g.minorGrid;
    }, true);

    // Chart name input
    const chartNameInput = document.getElementById('chart-name');
    if (chartNameInput) {
        chartNameInput.value = chartState.chartName !== 'Unnamed' ? chartState.chartName : '';
        chartNameInput.addEventListener('input', (e) => {
            chartState.chartName = e.target.value.trim() || 'Unnamed';
            eventBus.emit(EVENTS.CHART_NAME_CHANGED, { name: chartState.chartName });
        });
    }

    // Chart type switcher — no reload, re-init in place
    const chartTypeSelect = document.getElementById('chart-type-select');
    if (chartTypeSelect) {
        chartTypeSelect.value = chartState.chartType;

        if (chartState.chartType === 'FrequencyCollections') {
            document.getElementById('chart-type-section').style.display = 'none';
        }

        chartTypeSelect.addEventListener('change', (e) => {
            const newType = e.target.value;
            if (newType === chartState.chartType) return;

            createConfirmToast({
                message: `Switch to ${newType} chart?`,
                yesLabel: 'Switch',
                noLabel: 'Cancel',
                onYes: () => {
                    chartState.chartType = newType;
                    const config = CHART_TYPE_CONFIG[newType];
                    chartState.chartCapacity = config?.capacity || 280;
                    chartState.chartWindow = chartState.chartCapacity / 2;
                    // Re-init chart in place (no page reload in plugin context)
                    initializeChart();
                    eventBus.emit(EVENTS.CHART_TYPE_CHANGED, { chartType: newType });
                },
                onNo: () => {
                    chartTypeSelect.value = chartState.chartType;
                }
            });
        });
    }

    // Fullscreen toggle
    const fullscreenBtn = document.getElementById('fullscreen-toggle');

    function toggleFullscreen() {
        if (!fullscreenBtn) return;
        const isFullscreen = document.body.classList.toggle('fullscreen-mode');
        fullscreenBtn.innerHTML = isFullscreen
            ? icons.fullscreenCompress()
            : icons.fullscreenExpand();
        setTimeout(() => {
            chartState.containerHeight = null;
            initializeChart();
        }, 0);
    }

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    eventBus.subscribe(EVENTS.FULLSCREEN_TOGGLE, toggleFullscreen);

    // Chart window change handler
    const chartDiv = getChartDiv();

    const applyChartWindow = (newValue) => {
        const config = CHART_TYPE_CONFIG[chartState.chartType];
        const minWindow = config?.minXmax || config?.snapTo || 14;

        if (newValue < minWindow) newValue = minWindow;
        if (newValue > chartState.chartCapacity) newValue = chartState.chartCapacity;

        chartState.chartWindow = newValue;

        const margin = chartDiv.layout.margin;
        const height = chartDiv.layout.height;
        const deg = CHART_MATH.ANGLE_DEGREES;
        const yaxis_px = height - (margin.t + margin.b);
        const y_axis = Math.log10(config.yMax) - Math.log10(config.yMin);
        const delta_y = Math.log10(2 ** (newValue / config.unit));
        const delta_y_px = (delta_y / y_axis) * yaxis_px;
        const xaxis_px = delta_y_px / Math.tan((deg * Math.PI) / 180);
        const newWidth = xaxis_px + (margin.l + margin.r);

        relayout(chartDiv, {
            'xaxis.range': [-LAYOUT.X_AXIS_MARGIN_OFFSET, newValue + LAYOUT.X_AXIS_MARGIN_OFFSET],
            width: newWidth
        }).then(async () => {
            emitFanReposition();
            await rescaleChartElements(chartDiv);
            regenerateCredits();
            eventBus.emit(EVENTS.UI_LEGEND_RENDER, { save: false });
        });
    };

    eventBus.subscribe(EVENTS.CHART_WINDOW_CHANGED, (newValue) => {
        applyChartWindow(newValue);
    }, true);

    eventBus.subscribe(EVENTS.CHART_HEIGHT_CHANGED, (newHeight) => {
        chartState.containerHeight = newHeight;
        initializeChart();
    }, true);
}
