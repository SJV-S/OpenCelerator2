/**
 * Pan Slider UI Module
 *
 * Slider positions are integers from 0 to maxPositions.
 * Each position corresponds to panning by (position * snapTo).
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { LAYOUT, CHART_TYPE_CONFIG } from '../config.js';

/**
 * Initialize slider when chart is ready
 */
function initSlider() {
    const panSlider = document.getElementById('pan-slider');
    if (!panSlider) return;

    const config = CHART_TYPE_CONFIG[chartState.chartType];
    if (!config) return;

    const snapTo = config.snapTo;
    const capacity = config.capacity;
    const maxPan = capacity - chartState.chartWindow;
    const maxPositions = maxPan / snapTo;

    panSlider.min = 0;
    panSlider.max = maxPositions;
    panSlider.step = 1;
    panSlider.value = 0;

    // Attach input handler once
    if (!panSlider.dataset.initialized) {
        panSlider.addEventListener('input', onSliderInput);

        const container = document.getElementById('pan-slider-container');
        panSlider.addEventListener('mousedown', () => container?.classList.add('active'));
        panSlider.addEventListener('touchstart', () => container?.classList.add('active'));
        document.addEventListener('mouseup', () => container?.classList.remove('active'));
        document.addEventListener('touchend', () => container?.classList.remove('active'));

        panSlider.dataset.initialized = 'true';
    }
}

/**
 * Handle slider input - pan chart by (position * snapTo)
 */
function onSliderInput(e) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout?.xaxis?.range) return;

    const config = CHART_TYPE_CONFIG[chartState.chartType];
    if (!config) return;

    const position = parseInt(e.target.value);
    const panPosition = position * config.snapTo;
    const rangeWidth = chartDiv.layout.xaxis.range[1] - chartDiv.layout.xaxis.range[0];

    Plotly.relayout(chartDiv, {
        'xaxis.range[0]': panPosition - LAYOUT.X_AXIS_MARGIN_OFFSET,
        'xaxis.range[1]': panPosition - LAYOUT.X_AXIS_MARGIN_OFFSET + rangeWidth
    });
}

/**
 * Sync slider from chart position
 */
function syncFromChart() {
    const panSlider = document.getElementById('pan-slider');
    if (!panSlider) return;

    const chartDiv = document.getElementById('chart');
    const config = CHART_TYPE_CONFIG[chartState.chartType];
    if (!chartDiv?.layout?.xaxis?.range || !config) return;

    const panPosition = chartDiv.layout.xaxis.range[0] + LAYOUT.X_AXIS_MARGIN_OFFSET;
    const sliderPosition = Math.round(panPosition / config.snapTo);
    panSlider.value = Math.max(0, Math.min(sliderPosition, parseInt(panSlider.max)));
}

/**
 * Update slider max when chart window changes
 * @param {number} newWindow - The new chart window value from the event
 */
function onWindowChanged(newWindow) {
    const panSlider = document.getElementById('pan-slider');
    if (!panSlider) return;

    const config = CHART_TYPE_CONFIG[chartState.chartType];
    if (!config) return;

    const maxPan = config.capacity - newWindow;
    const maxPositions = maxPan / config.snapTo;
    panSlider.max = maxPositions;

    if (parseInt(panSlider.value) > maxPositions) {
        panSlider.value = maxPositions;
    }
}

/**
 * Set up plotly_relayout listener (call after Plotly.newPlot)
 */
export function setupChartListener(chartDiv) {
    // Initialize slider now that chart exists
    initSlider();

    chartDiv.on('plotly_relayout', (eventData) => {
        if (eventData['xaxis.range[0]'] !== undefined || eventData['xaxis.range'] !== undefined) {
            syncFromChart();
        }
    });
}

/**
 * Initialize module
 */
export function init() {
    eventBus.subscribe(EVENTS.DATA_CHART_REFRESH, initSlider, false);
    eventBus.subscribe(EVENTS.DATA_START_DATE_CHANGED, () => {
        const s = document.getElementById('pan-slider');
        if (s) s.value = 0;
    }, false);
    eventBus.subscribe(EVENTS.CHART_WINDOW_CHANGED, onWindowChanged, true);
}
