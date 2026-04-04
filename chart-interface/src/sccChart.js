/**
 * sccChart.js — Public entry point for the SCC chart plugin.
 *
 * Usage:
 *   import { SCCChart } from './scc-chart.js';
 *
 *   const chart = new SCCChart(containerElement, {
 *     chartType: 'Daily',
 *     minuteChart: true,
 *     initialData: savedChartJSON,   // optional — null for blank chart
 *     onStateChanged: (snapshot) => { myDB.save(snapshot); }
 *   });
 *
 * Requires Plotly 2.35 loaded as a global <script> tag before this module.
 */

import { chartState } from './SCC/chartState.js';
import { eventBus, EVENTS, EVENT_CATEGORIES } from './SCC/eventBus.js';
import { migrateChart, CURRENT_SCHEMA_VERSION } from './SCC/import/jsonBackwardsCompatibility.js';
import { serializeDate, deserializeDate } from './SCC/util/dates.js';
import PLUGIN_UI_HTML from '../html/plugin-ui.html';
import {
    runModuleInits,
    injectIcons,
    runUIInits,
    setupEventListeners,
    initializeChart
} from './main.js';

let _instanceCount = 0;

export class SCCChart {
    /**
     * @param {HTMLElement} container - The DOM element to render the chart into.
     * @param {object} options
     * @param {string}   [options.chartType='Daily']   - 'Daily' | 'Weekly' | 'Monthly' | 'Yearly'
     * @param {boolean}  [options.minuteChart=true]    - true = minute chart, false = count chart
     * @param {object}   [options.initialData=null]    - Serialized chartState (from JSON export or getState())
     * @param {Function} [options.onStateChanged=null] - Called with a state snapshot on every mutation
     */
    constructor(container, options = {}) {
        _instanceCount++;
        if (_instanceCount > 1) {
            console.warn('[SCCChart] Multiple instances detected. Only single-chart-per-page is supported.');
        }

        const {
            chartType = 'Daily',
            minuteChart = true,
            initialData = null,
            onStateChanged = null,
        } = options;

        this._container = container;
        this._onStateChanged = onStateChanged;

        // 1. Inject plugin HTML into container and scope its layout
        container.style.position = 'relative';
        container.style.overflow = 'hidden';
        container.innerHTML = PLUGIN_UI_HTML;

        // 2. Merge initialData into chartState, or apply constructor options
        if (initialData) {
            const data = { ...initialData };
            migrateChart(data);
            Object.assign(chartState, data);
            // Deserialize startDate if stored as ISO string
            if (typeof chartState.startDate === 'string') {
                chartState.startDate = deserializeDate(chartState.startDate);
            }
        } else {
            chartState.chartType = chartType;
            chartState.minuteChart = minuteChart;
        }

        // 3. Run module init sequence (event bus subscriptions)
        runModuleInits();

        // 4. Inject SVG icons into [data-icon] elements
        injectIcons(container);

        // 5. Wire host callback to STATE_MUTATING and PRESENTATION events
        if (onStateChanged) {
            const notify = () => onStateChanged(this.getState());
            eventBus.subscribeToCategory(EVENT_CATEGORIES.STATE_MUTATING, notify);
            eventBus.subscribeToCategory(EVENT_CATEGORIES.PRESENTATION, notify);
        }

        // 6. Initialize UI modules (share tab, line settings modal, etc.)
        runUIInits();

        // 7. Wire up DOM event listeners and render
        setupEventListeners();
        initializeChart();
    }

    /**
     * Returns a plain serializable snapshot of the current chart state.
     * Pass this to onStateChanged or persist it yourself at any time.
     * @returns {object}
     */
    getState() {
        return {
            ...chartState,
            startDate: serializeDate(chartState.startDate),
            _schemaVersion: CURRENT_SCHEMA_VERSION,
        };
    }

    /**
     * Load a saved chart into the plugin.
     * Accepts any object shaped like a TC2 chart export (same format as getState()).
     * Runs schema migration, merges into chartState, and replots.
     * @param {object} data
     */
    loadData(data) {
        const migrated = { ...data };
        migrateChart(migrated);
        const prevChartType = chartState.chartType;
        const prevMinuteChart = chartState.minuteChart;
        Object.assign(chartState, migrated);
        if (typeof chartState.startDate === 'string') {
            chartState.startDate = deserializeDate(chartState.startDate);
        }

        const templateChanged = chartState.chartType !== prevChartType ||
                                chartState.minuteChart !== prevMinuteChart;

        if (templateChanged) {
            // Full re-init required: DATA_CHART_REFRESH only replots data traces
            // on the existing template. A different chart type needs a new template.
            // initializeChart() calls newPlot with the correct template and emits
            // DATA_CHART_REFRESH internally.
            initializeChart();
            // Sync the chart-type selector to the newly loaded type.
            const chartTypeSelect = this._container.querySelector('#chart-type-select');
            if (chartTypeSelect) chartTypeSelect.value = chartState.chartType;
        } else {
            eventBus.emit(EVENTS.DATA_CHART_REFRESH);
            // Sync the chart-type selector (handles same-type deck switches too,
            // in case the selector was left on a stale value from a previous deck).
            const chartTypeSelect = this._container.querySelector('#chart-type-select');
            if (chartTypeSelect) chartTypeSelect.value = chartState.chartType;
        }

        // DATA_CHART_REFRESH updates data traces but not the x-axis range.
        // Emit CHART_WINDOW_CHANGED so applyChartWindow() syncs the rendered
        // chart window to chartState.chartWindow (which was just set above).
        // Without this, switching decks leaves the previous deck's window on screen.
        eventBus.emit(EVENTS.CHART_WINDOW_CHANGED, chartState.chartWindow);
    }

    /**
     * Tear down the chart and clear the container.
     * Note: event bus subscriptions are not unregistered (singleton constraint).
     * Do not instantiate a new SCCChart after calling destroy().
     */
    destroy() {
        this._container.innerHTML = '';
        _instanceCount--;
    }
}

// Expose on window for non-module (script tag) consumers
if (typeof window !== 'undefined') {
    window.SCCChart = SCCChart;
}
