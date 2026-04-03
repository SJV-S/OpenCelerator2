/**
 * Reset Settings — restores all visual/layout settings to defaults.
 * Chart name and start date are excluded.
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { CHART_TYPE_CONFIG } from '../config.js';
import { toggleLegend } from './customLegend.js';
import { createConfirmToast, createToast } from './toaster.js';

export function initResetSettings() {
    const btn = document.getElementById('reset-settings-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        createConfirmToast({
            message: 'Reset all visual settings to defaults?',
            yesLabel: 'Reset',
            noLabel: 'Cancel',
            onYes: applyDefaults
        });
    });
}

function applyDefaults() {
    const config = CHART_TYPE_CONFIG[chartState.chartType];

    // Chart window → half capacity
    const defaultWindow = config.capacity / 2;
    eventBus.emit(EVENTS.CHART_WINDOW_CHANGED, defaultWindow);

    // Chart height → clear custom height, re-init
    const container = document.getElementById('chart-container');
    if (container) container.style.height = '';
    chartState.containerHeight = null;
    eventBus.emit(EVENTS.CHART_HEIGHT_CHANGED, null);

    // Grid toggles → all off
    chartState.lineVisibility.grid.dateLines = false;
    chartState.lineVisibility.grid.countLines = false;
    chartState.lineVisibility.grid.minorGrid = false;
    eventBus.emit(EVENTS.CHART_GRID_VISIBILITY_CHANGED, { visible: false });

    // Celeration fan → on
    const fanToggle = document.getElementById('fan-toggle');
    if (fanToggle) fanToggle.checked = true;
    eventBus.emit(EVENTS.FAN_VISIBILITY_CHANGED, { visible: true });

    // Zeros below floor → on
    chartState.placeZerosBelowFloor = true;
    const zerosToggle = document.getElementById('place-zeros-below-floor-toggle');
    if (zerosToggle) zerosToggle.checked = true;
    eventBus.emit(EVENTS.CHART_ZEROS_CHANGED, { enabled: true });
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);

    // Legend → on, top-right
    toggleLegend(true);
    chartState.legend.position = 'top-right';
    const legendPos = document.getElementById('legend-position');
    if (legendPos) legendPos.value = 'top-right';
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);

    // Update chart height display to show the new default pixel height
    // (initializeChart() sets chartState.containerHeight to the flex default)
    const heightDisplay = document.getElementById('chart-height-value');
    if (heightDisplay) heightDisplay.textContent = chartState.containerHeight ?? '';

    createToast({ message: 'Visual settings reset to defaults.', duration: 2000 });
}
