/**
 * Trace Styles Configuration
 *
 * This module handles:
 * - Hierarchical series navigation (series -> aggregations)
 * - Single aggregation config panel
 * - Adding/removing aggregation methods per series
 */

import { chartState, defaultCorrectTraceConfig, defaultErrorTraceConfig, defaultTimingTraceConfig, createMiscTraceConfig } from '../chartState.js';
import { CORRECTS, ERRORS, TIMING, LIMITS, LINE_DEFAULTS } from '../config.js';
import { getMiscSeriesIds } from './miscSeries.js';
import { createToast, createConfirmToast } from '../ui/toaster.js';
import { eventBus, EVENTS } from '../eventBus.js';

// ============================================================================
// STATE
// ============================================================================

// Currently selected series and aggregation
let currentSeries = CORRECTS;
let currentAggType = 'raw';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const MAX_TAB_NAME_LENGTH = LIMITS.MAX_TAB_NAME_LENGTH;

function truncateTabName(name) {
    if (!name || name.length <= MAX_TAB_NAME_LENGTH) {
        return name;
    }
    return name.slice(0, MAX_TAB_NAME_LENGTH) + '...';
}

function getAvailableAggTypes() {
    const baseAggs = ['raw', 'mean', 'median', 'min', 'max', 'first', 'last'];
    if (!chartState.minuteChart) {
        baseAggs.push('sum');
    }
    return baseAggs;
}

function isMiscSeries(seriesName) {
    return seriesName.startsWith('misc');
}

function getSeriesConfigs(seriesName) {
    return isMiscSeries(seriesName)
        ? chartState.traceStyles.misc[seriesName]
        : chartState.traceStyles[seriesName];
}

function setSeriesConfigs(seriesName, configs) {
    if (isMiscSeries(seriesName)) {
        chartState.traceStyles.misc[seriesName] = configs;
    } else {
        chartState.traceStyles[seriesName] = configs;
    }
}

function getConfig(seriesName, aggType) {
    const configs = getSeriesConfigs(seriesName);
    return configs ? configs[aggType] : null;
}

function setConfig(seriesName, aggType, config) {
    const configs = getSeriesConfigs(seriesName) || {};
    configs[aggType] = config;
    setSeriesConfigs(seriesName, configs);
}

function deleteConfig(seriesName, aggType) {
    const configs = getSeriesConfigs(seriesName);
    if (configs && configs[aggType]) {
        delete configs[aggType];
    }
}

function getFirstConfig(seriesName, isMisc = false) {
    const configs = isMisc
        ? chartState.traceStyles.misc[seriesName]
        : chartState.traceStyles[seriesName];
    if (!configs) return null;
    const firstAggType = Object.keys(configs)[0];
    return firstAggType ? configs[firstAggType] : null;
}

function getAggCount(seriesName) {
    const configs = getSeriesConfigs(seriesName);
    return configs ? Object.keys(configs).length : 0;
}

function getAggTypes(seriesName) {
    const configs = getSeriesConfigs(seriesName);
    return configs ? Object.keys(configs) : [];
}

// ============================================================================
// LEFT NAV RENDERING
// ============================================================================

function renderSeriesNav() {
    const fixedSeries = [CORRECTS, ERRORS, TIMING];
    const miscIds = getMiscSeriesIds();

    // Render fixed series
    fixedSeries.forEach(seriesName => {
        renderSeriesItem(seriesName);
    });

    // Render misc series
    const miscContainer = document.getElementById('misc-series-container');
    if (miscContainer) {
        miscContainer.innerHTML = '';
        miscIds.forEach(id => {
            const item = createMiscSeriesItem(id);
            miscContainer.appendChild(item);
        });
    }

    // Update timing visibility
    updateTimingSeriesVisibility();
}

function renderSeriesItem(seriesName) {
    const item = document.querySelector(`.series-item[data-series="${seriesName}"]`);
    if (!item) return;

    const aggCount = getAggCount(seriesName);
    const aggTypes = getAggTypes(seriesName);
    const config = getFirstConfig(seriesName, isMiscSeries(seriesName));

    // Update series name display
    const nameSpan = item.querySelector('.series-name');
    if (nameSpan && config?.seriesName) {
        nameSpan.textContent = truncateTabName(config.seriesName);
    }

    // Update icon visibility based on aggregation count
    item.classList.remove('single-agg', 'multi-agg');
    if (aggCount > 1) {
        item.classList.add('multi-agg');
    } else {
        item.classList.add('single-agg');
    }

    // Render aggregation list
    renderAggList(item, seriesName, aggTypes);
}

function renderAggList(item, seriesName, aggTypes) {
    const listContainer = item.querySelector('.series-agg-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    // Add aggregation items
    aggTypes.forEach(aggType => {
        const aggBtn = document.createElement('button');
        aggBtn.className = 'agg-item';
        aggBtn.dataset.series = seriesName;
        aggBtn.dataset.agg = aggType;
        aggBtn.textContent = aggType.charAt(0).toUpperCase() + aggType.slice(1);

        if (seriesName === currentSeries && aggType === currentAggType) {
            aggBtn.classList.add('active');
        }

        aggBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAggregation(seriesName, aggType);
        });

        listContainer.appendChild(aggBtn);
    });

    // Add "+" button if more aggregation types available
    const usedAggs = aggTypes;
    const availableAggs = getAvailableAggTypes();
    const unusedAggs = availableAggs.filter(a => !usedAggs.includes(a));

    if (unusedAggs.length > 0) {
        const addBtn = document.createElement('button');
        addBtn.className = 'add-agg-btn';
        addBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add`;
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addAggregation(seriesName);
        });
        listContainer.appendChild(addBtn);
    }
}

function createMiscSeriesItem(id) {
    const template = document.getElementById('misc-series-item-template');
    const item = template.content.firstElementChild.cloneNode(true);

    item.dataset.series = id;
    const row = item.querySelector('.series-row');
    row.dataset.seriesTab = id;

    const config = getFirstConfig(id, true);
    const nameSpan = item.querySelector('.series-name');
    nameSpan.textContent = truncateTabName(config?.seriesName || id);

    const aggCount = getAggCount(id);
    const aggTypes = getAggTypes(id);

    item.classList.add(aggCount > 1 ? 'multi-agg' : 'single-agg');

    // Set up click handler
    row.addEventListener('click', () => handleSeriesClick(id));

    // Render aggregation list
    renderAggList(item, id, aggTypes);

    return item;
}

// ============================================================================
// INTERACTION HANDLERS
// ============================================================================

function handleSeriesClick(seriesName) {
    const item = document.querySelector(`.series-item[data-series="${seriesName}"]`);
    if (!item) return;

    const aggCount = getAggCount(seriesName);

    if (aggCount === 1) {
        // Single aggregation - select it directly
        const aggTypes = getAggTypes(seriesName);
        selectAggregation(seriesName, aggTypes[0]);
    } else {
        // Multiple aggregations - toggle expansion
        toggleExpand(seriesName);
    }
}

function toggleExpand(seriesName) {
    const item = document.querySelector(`.series-item[data-series="${seriesName}"]`);
    if (!item) return;

    const wasExpanded = item.classList.contains('expanded');

    // Collapse all other expanded items
    document.querySelectorAll('.series-item.expanded').forEach(i => {
        i.classList.remove('expanded');
    });

    // Toggle this item
    if (!wasExpanded) {
        item.classList.add('expanded');
    }
}

function selectAggregation(seriesName, aggType) {
    currentSeries = seriesName;
    currentAggType = aggType;

    // Update active states in nav
    document.querySelectorAll('.series-row').forEach(row => {
        row.classList.remove('active');
    });
    document.querySelectorAll('.agg-item').forEach(item => {
        item.classList.remove('active');
    });

    const aggCount = getAggCount(seriesName);

    if (aggCount === 1) {
        // Highlight the series row
        const row = document.querySelector(`.series-item[data-series="${seriesName}"] .series-row`);
        if (row) row.classList.add('active');
    } else {
        // Highlight the aggregation item
        const aggItem = document.querySelector(`.agg-item[data-series="${seriesName}"][data-agg="${aggType}"]`);
        if (aggItem) aggItem.classList.add('active');
    }

    // Load config into panel
    loadConfigPanel(seriesName, aggType);
}

// ============================================================================
// CONFIG PANEL
// ============================================================================

function loadConfigPanel(seriesName, aggType) {
    const config = getConfig(seriesName, aggType);
    if (!config) return;

    const isMisc = isMiscSeries(seriesName);

    // Show/hide marker symbol row (only for misc series)
    const symbolRow = document.getElementById('marker-symbol-row');
    if (symbolRow) {
        symbolRow.style.display = isMisc ? '' : 'none';
    }

    // Show/hide marker edge color row (only for corrects and misc)
    const edgeColorRow = document.getElementById('marker-edge-color-row');
    if (edgeColorRow) {
        edgeColorRow.style.display = (seriesName === CORRECTS || isMisc) ? '' : 'none';
    }

    // Show/hide panel header for misc series
    const panelHeader = document.getElementById('panel-header');
    const deleteBtn = document.getElementById('delete-series-btn');
    if (panelHeader && deleteBtn) {
        if (isMisc) {
            panelHeader.classList.remove('hidden');
            deleteBtn.classList.remove('hidden');
            document.getElementById('panel-title').textContent = config.seriesName || seriesName;
        } else {
            panelHeader.classList.add('hidden');
            deleteBtn.classList.add('hidden');
        }
    }

    // Show/hide remove aggregation button
    const removeAggBtn = document.getElementById('remove-agg-btn');
    if (removeAggBtn) {
        const aggCount = getAggCount(seriesName);
        removeAggBtn.classList.toggle('hidden', aggCount <= 1);
    }

    // Populate form fields
    document.getElementById('config-series-name').value = config.seriesName || '';
    document.getElementById('config-agg-type').value = aggType;
    document.getElementById('config-marker-size').value = config.markerSize || 8;
    document.getElementById('config-line-width').value = config.lineWidth || 0.7;
    document.getElementById('config-show-line').checked = config.showLine ?? true;
    document.getElementById('config-line-color').value = config.lineColor || '#000000';
    document.getElementById('config-marker-color').value = config.markerColor || '#000000';
    document.getElementById('config-marker-edge-color').value = config.markerEdgeColor || '#000000';
    document.getElementById('config-marker-symbol').value = config.markerSymbol || 'circle';

    // Update sum option visibility
    updateSumOptionVisibility();
}

function applyConfig() {
    const seriesName = currentSeries;
    const oldAggType = currentAggType;
    const newAggType = document.getElementById('config-agg-type').value;

    const config = {
        seriesName: document.getElementById('config-series-name').value || seriesName,
        showLine: document.getElementById('config-show-line').checked,
        lineWidth: parseFloat(document.getElementById('config-line-width').value) || LINE_DEFAULTS.TRACE_LINE_WIDTH,
        lineColor: document.getElementById('config-line-color').value || '#000000',
        markerSize: parseInt(document.getElementById('config-marker-size').value) || 8,
        markerColor: document.getElementById('config-marker-color').value || '#000000',
        markerEdgeColor: document.getElementById('config-marker-edge-color').value || '#000000',
        markerSymbol: document.getElementById('config-marker-symbol').value || 'circle'
    };

    // If aggregation type changed, delete old and create new
    if (oldAggType !== newAggType) {
        deleteConfig(seriesName, oldAggType);
        currentAggType = newAggType;
    }

    setConfig(seriesName, newAggType, config);

    // Re-render nav and refresh
    renderSeriesItem(seriesName);
    if (isMiscSeries(seriesName)) {
        // Re-render misc item in container
        const miscContainer = document.getElementById('misc-series-container');
        const oldItem = miscContainer.querySelector(`[data-series="${seriesName}"]`);
        if (oldItem) {
            const newItem = createMiscSeriesItem(seriesName);
            oldItem.replaceWith(newItem);
            // Re-expand if was expanded
            if (getAggCount(seriesName) > 1) {
                newItem.classList.add('expanded');
            }
        }
    }

    updateCounterLabels();
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
    eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);
    createToast({ message: `${config.seriesName} updated.`, duration: 2000 });

    // Re-select to update active states
    selectAggregation(seriesName, newAggType);
}

function resetConfig() {
    const seriesName = currentSeries;
    const isMisc = isMiscSeries(seriesName);

    const defaultsMap = {
        [CORRECTS]: defaultCorrectTraceConfig,
        [ERRORS]: defaultErrorTraceConfig,
        [TIMING]: defaultTimingTraceConfig
    };

    if (isMisc) {
        const num = parseInt(seriesName.slice(4));
        const index = num - 1;
        setSeriesConfigs(seriesName, { raw: createMiscTraceConfig(index) });
    } else {
        setSeriesConfigs(seriesName, { raw: { ...defaultsMap[seriesName] } });
    }

    currentAggType = 'raw';

    // Re-render and select
    renderSeriesItem(seriesName);
    if (isMisc) {
        const miscContainer = document.getElementById('misc-series-container');
        const oldItem = miscContainer.querySelector(`[data-series="${seriesName}"]`);
        if (oldItem) {
            const newItem = createMiscSeriesItem(seriesName);
            oldItem.replaceWith(newItem);
        }
    }

    selectAggregation(seriesName, 'raw');
    updateCounterLabels();

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
    eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);
    createToast({ message: `Reset to defaults.`, duration: 2000 });
}

// ============================================================================
// AGGREGATION MANAGEMENT
// ============================================================================

function addAggregation(seriesName) {
    const usedAggs = getAggTypes(seriesName);
    const availableAggs = getAvailableAggTypes();
    const unusedAgg = availableAggs.find(a => !usedAggs.includes(a));

    if (!unusedAgg) return;

    // Get base config from first aggregation
    const firstConfig = getFirstConfig(seriesName, isMiscSeries(seriesName));
    const newConfig = { ...firstConfig };

    setConfig(seriesName, unusedAgg, newConfig);

    // Re-render and select the new aggregation
    renderSeriesItem(seriesName);
    if (isMiscSeries(seriesName)) {
        const miscContainer = document.getElementById('misc-series-container');
        const oldItem = miscContainer.querySelector(`[data-series="${seriesName}"]`);
        if (oldItem) {
            const newItem = createMiscSeriesItem(seriesName);
            newItem.classList.add('expanded');
            oldItem.replaceWith(newItem);
        }
    } else {
        // Ensure expanded
        const item = document.querySelector(`.series-item[data-series="${seriesName}"]`);
        if (item) item.classList.add('expanded');
    }

    selectAggregation(seriesName, unusedAgg);

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
}

function removeAggregation() {
    const seriesName = currentSeries;
    const aggType = currentAggType;
    const aggCount = getAggCount(seriesName);

    if (aggCount <= 1) return;

    deleteConfig(seriesName, aggType);

    // Select first remaining aggregation
    const remainingAggs = getAggTypes(seriesName);
    currentAggType = remainingAggs[0];

    // Re-render
    renderSeriesItem(seriesName);
    if (isMiscSeries(seriesName)) {
        const miscContainer = document.getElementById('misc-series-container');
        const oldItem = miscContainer.querySelector(`[data-series="${seriesName}"]`);
        if (oldItem) {
            const newItem = createMiscSeriesItem(seriesName);
            if (remainingAggs.length > 1) {
                newItem.classList.add('expanded');
            }
            oldItem.replaceWith(newItem);
        }
    }

    selectAggregation(seriesName, currentAggType);

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
    eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);
}

// ============================================================================
// MISC SERIES MANAGEMENT
// ============================================================================

function deleteMiscSeries() {
    const seriesName = currentSeries;
    if (!isMiscSeries(seriesName)) return;

    const config = getFirstConfig(seriesName, true);
    const displayName = config?.seriesName || seriesName;

    createConfirmToast({
        message: `Delete "${displayName}" series?`,
        onYes: () => {
            import('./miscSeries.js').then(({ removeMiscSeries }) => {
                removeMiscSeries(seriesName);
            });
        },
        onNo: () => {},
        yesLabel: 'Delete',
        noLabel: 'Cancel',
        primaryColor: '#ef4444'
    });
}

// ============================================================================
// VISIBILITY FUNCTIONS
// ============================================================================

function updateSumOptionVisibility() {
    const sumOption = document.querySelector('#config-agg-type .sum-option');
    if (sumOption) {
        sumOption.style.display = chartState.minuteChart ? 'none' : '';
    }
}

function updateTimingSeriesVisibility() {
    const shouldShow = chartState.minuteChart;
    const timingItem = document.querySelector('.series-item[data-series="timing"]');

    if (timingItem) {
        timingItem.style.display = shouldShow ? '' : 'none';
    }

    // If timing was selected and now hidden, switch to corrects
    if (!shouldShow && currentSeries === TIMING) {
        selectAggregation(CORRECTS, 'raw');
    }
}

function updateCounterLabels() {
    const labels = [
        { id: 'corrects-series-label', series: CORRECTS },
        { id: 'errors-series-label', series: ERRORS },
        { id: 'timing-series-label', series: TIMING }
    ];

    labels.forEach(({ id, series }) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = getFirstConfig(series)?.seriesName || series;
        }
    });

    getMiscSeriesIds().forEach(miscId => {
        const label = document.getElementById(`${miscId}-series-label`);
        const config = getFirstConfig(miscId, true);
        if (label && config) {
            label.textContent = config.seriesName;
        }
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeSeriesNav() {
    // Set up click handlers for fixed series rows
    document.querySelectorAll('.series-item[data-series] .series-row').forEach(row => {
        const seriesName = row.closest('.series-item').dataset.series;
        row.addEventListener('click', () => handleSeriesClick(seriesName));
    });

    // Set up add misc series button
    const addSeriesBtn = document.querySelector('[data-action="add-misc-series"]');
    if (addSeriesBtn) {
        addSeriesBtn.addEventListener('click', () => {
            import('./miscSeries.js').then(({ addMiscSeries, canAddMiscSeries }) => {
                if (!canAddMiscSeries()) {
                    createToast({ message: 'Maximum of 10 misc series reached.', duration: 3000 });
                    return;
                }
                addMiscSeries();
            });
        });
    }

    // Set up config panel buttons
    document.getElementById('apply-config-btn')?.addEventListener('click', applyConfig);
    document.getElementById('reset-config-btn')?.addEventListener('click', resetConfig);
    document.getElementById('remove-agg-btn')?.addEventListener('click', removeAggregation);
    document.getElementById('delete-series-btn')?.addEventListener('click', deleteMiscSeries);

    // Set up plus icon click for single-agg series (adds new aggregation)
    document.querySelectorAll('.series-item .plus-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const seriesName = e.target.closest('.series-item').dataset.series;
            addAggregation(seriesName);
        });
    });

    // Initial render
    renderSeriesNav();

    // Select corrects/raw by default
    selectAggregation(CORRECTS, 'raw');
}

function initializeAllSeriesInputs() {
    renderSeriesNav();
    updateSumOptionVisibility();

    // Re-select current if valid, otherwise default to corrects/raw
    const configs = getSeriesConfigs(currentSeries);
    if (configs && configs[currentAggType]) {
        selectAggregation(currentSeries, currentAggType);
    } else {
        selectAggregation(CORRECTS, 'raw');
    }
}

// ============================================================================
// EVENT SUBSCRIPTIONS
// ============================================================================

eventBus.subscribe(EVENTS.MISC_SERIES_ADDED, ({ id }) => {
    renderSeriesNav();
    selectAggregation(id, 'raw');
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
}, true);

eventBus.subscribe(EVENTS.MISC_SERIES_REMOVED, ({ id }) => {
    renderSeriesNav();
    if (currentSeries === id) {
        selectAggregation(CORRECTS, 'raw');
    }
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
}, true);

eventBus.subscribe(EVENTS.STORAGE_CHART_LOADED, () => {
    initializeAllSeriesInputs();
}, true);

eventBus.subscribe(EVENTS.DATA_IMPORT_COMPLETED, () => {
    initializeAllSeriesInputs();
}, true);

// ============================================================================
// EXPORTS
// ============================================================================

export {
    initializeSeriesNav,
    initializeAllSeriesInputs,
    getAvailableAggTypes,
    updateSumOptionVisibility,
    updateTimingSeriesVisibility,
    getFirstConfig
};

console.log('traceStyles.js loaded');
