/**
 * Trace Styles Configuration
 *
 * This module handles:
 * - Flat series navigation (one row per series+aggregation combo)
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
    const flatList = document.getElementById('series-flat-list');
    if (!flatList) return;

    flatList.innerHTML = '';

    const fixedSeries = [CORRECTS, ERRORS, TIMING];
    const miscIds = getMiscSeriesIds();
    const allSeries = [...fixedSeries, ...miscIds];

    allSeries.forEach(seriesName => {
        const aggTypes = getAggTypes(seriesName);
        const isMisc = isMiscSeries(seriesName);
        const config = getFirstConfig(seriesName, isMisc);
        const displayName = config?.seriesName || seriesName;

        // Non-clickable heading for the series group
        const heading = document.createElement('div');
        heading.className = 'series-heading';
        heading.textContent = truncateTabName(displayName);
        if (seriesName === TIMING) {
            heading.dataset.seriesType = 'timing';
            heading.style.display = chartState.minuteChart ? '' : 'none';
        }
        flatList.appendChild(heading);

        // Indented clickable rows for each aggregation
        aggTypes.forEach(aggType => {
            const label = aggType === 'raw'
                ? `${displayName} (Raw)`
                : `${displayName} (${aggType.charAt(0).toUpperCase() + aggType.slice(1)})`;

            const btn = document.createElement('button');
            btn.className = 'series-row series-agg-row';
            btn.dataset.series = seriesName;
            btn.dataset.agg = aggType;

            if (seriesName === TIMING) {
                btn.dataset.seriesType = 'timing';
                btn.style.display = chartState.minuteChart ? '' : 'none';
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'series-name';
            nameSpan.textContent = truncateTabName(label);
            btn.appendChild(nameSpan);

            if (seriesName === currentSeries && aggType === currentAggType) {
                btn.classList.add('active');
            }

            btn.addEventListener('click', () => selectAggregation(seriesName, aggType));
            flatList.appendChild(btn);
        });
    });
}

// ============================================================================
// INTERACTION HANDLERS
// ============================================================================

function selectAggregation(seriesName, aggType) {
    currentSeries = seriesName;
    currentAggType = aggType;

    // Update active state - highlight only the matching flat row
    document.querySelectorAll('#series-flat-list .series-row').forEach(row => {
        row.classList.remove('active');
        if (row.dataset.series === seriesName && row.dataset.agg === aggType) {
            row.classList.add('active');
        }
    });

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

    // Show/hide Remove button
    const removeBtn = document.getElementById('remove-series-btn');
    if (removeBtn) {
        const isDefaultRaw = !isMisc && aggType === 'raw';
        removeBtn.style.display = isDefaultRaw ? 'none' : '';
    }

    // Populate form fields
    document.getElementById('config-series-name').value = config.seriesName || '';
    document.getElementById('config-marker-size').value = config.markerSize || 8;
    document.getElementById('config-line-width').value = config.lineWidth || 0.7;
    document.getElementById('config-show-line').checked = config.showLine ?? true;
    document.getElementById('config-line-color').value = config.lineColor || '#000000';
    document.getElementById('config-marker-color').value = config.markerColor || '#000000';
    document.getElementById('config-marker-edge-color').value = config.markerEdgeColor || '#000000';
    document.getElementById('config-marker-symbol').value = config.markerSymbol || 'circle';
    document.getElementById('config-line-dash').value = config.lineDash || 'solid';
}

function applyConfig() {
    const seriesName = currentSeries;
    const aggType = currentAggType;

    const config = {
        seriesName: document.getElementById('config-series-name').value || seriesName,
        showLine: document.getElementById('config-show-line').checked,
        lineDash: document.getElementById('config-line-dash').value || 'solid',
        lineWidth: parseFloat(document.getElementById('config-line-width').value) || LINE_DEFAULTS.TRACE_LINE_WIDTH,
        lineColor: document.getElementById('config-line-color').value || '#000000',
        markerSize: parseInt(document.getElementById('config-marker-size').value) || 8,
        markerColor: document.getElementById('config-marker-color').value || '#000000',
        markerEdgeColor: document.getElementById('config-marker-edge-color').value || '#000000',
        markerSymbol: document.getElementById('config-marker-symbol').value || 'circle'
    };

    setConfig(seriesName, aggType, config);

    // Re-render flat nav and refresh
    renderSeriesNav();
    updateCounterLabels();
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
    eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);
    createToast({ message: `${config.seriesName} updated.`, duration: 2000 });

    // Re-select to update active states
    selectAggregation(seriesName, aggType);
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

    // Re-render flat nav and select
    renderSeriesNav();
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

function getSeriesWithUnusedAggs() {
    const fixedSeries = [CORRECTS, ERRORS];
    if (chartState.minuteChart) fixedSeries.push(TIMING);
    const miscIds = getMiscSeriesIds();
    const allSeries = [...fixedSeries, ...miscIds];
    const availableAggs = getAvailableAggTypes();

    return allSeries.filter(seriesName => {
        const usedAggs = getAggTypes(seriesName);
        return availableAggs.some(a => !usedAggs.includes(a));
    });
}

function getUnusedAggs(seriesName) {
    const usedAggs = getAggTypes(seriesName);
    return getAvailableAggTypes().filter(a => !usedAggs.includes(a));
}

function getSeriesDisplayName(seriesName) {
    const isMisc = isMiscSeries(seriesName);
    const config = getFirstConfig(seriesName, isMisc);
    return config?.seriesName || seriesName;
}

function showAddSeriesModal() {
    // Remove any existing modal
    document.getElementById('add-series-modal')?.remove();

    const eligibleSeries = getSeriesWithUnusedAggs();
    const hasAggOption = eligibleSeries.length > 0;

    const overlay = document.createElement('div');
    overlay.id = 'add-series-modal';
    overlay.className = 'fixed inset-0 bg-black/50 flex justify-center items-center z-[10000]';

    // Step 1: two choices only
    overlay.innerHTML = `
        <div class="bg-white p-5 rounded-lg shadow-xl w-[280px] max-w-[90vw]">
            <h3 class="m-0 mb-4 text-sm font-bold text-gray-800">Add to Chart</h3>
            <div class="flex flex-col gap-2">
                <button id="modal-new-series-btn"
                    class="w-full py-2 px-3 bg-[#6ad1e3] hover:bg-[#5bc1d3] rounded text-white font-medium text-sm transition-colors cursor-pointer">
                    New Series
                </button>
                ${hasAggOption ? `
                <button id="modal-add-agg-btn"
                    class="w-full py-2 px-3 bg-gray-700 hover:bg-gray-800 rounded text-white font-medium text-sm transition-colors cursor-pointer">
                    Add Aggregation
                </button>
                ` : ''}
            </div>
            <button id="modal-cancel-btn"
                class="w-full mt-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 text-xs font-medium transition-colors cursor-pointer">
                Cancel
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    const onKeydown = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', onKeydown);
        }
    };
    document.addEventListener('keydown', onKeydown);

    const observer = new MutationObserver(() => {
        if (!document.getElementById('add-series-modal')) {
            document.removeEventListener('keydown', onKeydown);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true });

    document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);

    // New Series — immediate action
    document.getElementById('modal-new-series-btn').addEventListener('click', () => {
        import('./miscSeries.js').then(({ addMiscSeries, canAddMiscSeries }) => {
            if (!canAddMiscSeries()) {
                createToast({ message: 'Maximum of 10 misc series reached.', duration: 3000 });
            } else {
                addMiscSeries();
            }
            closeModal();
        });
    });

    // Add Aggregation — transition to step 2
    if (hasAggOption) {
        document.getElementById('modal-add-agg-btn').addEventListener('click', () => {
            showAggregationStep(overlay, eligibleSeries, closeModal);
        });
    }
}

function showAggregationStep(overlay, eligibleSeries, closeModal) {
    const seriesOptionsHtml = eligibleSeries.map(s =>
        `<option value="${s}">${getSeriesDisplayName(s)}</option>`
    ).join('');

    const initialAggHtml = getUnusedAggs(eligibleSeries[0]).map(a =>
        `<option value="${a}">${a.charAt(0).toUpperCase() + a.slice(1)}</option>`
    ).join('');

    const card = overlay.querySelector('div');
    card.innerHTML = `
        <h3 class="m-0 mb-4 text-sm font-bold text-gray-800">Add Aggregation</h3>
        <div class="flex flex-col gap-2">
            <select id="modal-series-select"
                class="w-full p-1.5 text-xs border border-gray-300 rounded">
                ${seriesOptionsHtml}
            </select>
            <select id="modal-agg-select"
                class="w-full p-1.5 text-xs border border-gray-300 rounded">
                ${initialAggHtml}
            </select>
            <button id="modal-confirm-agg-btn"
                class="w-full py-2 px-3 bg-gray-700 hover:bg-gray-800 rounded text-white font-medium text-sm transition-colors cursor-pointer">
                Add
            </button>
        </div>
        <button id="modal-back-btn"
            class="w-full mt-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 text-xs font-medium transition-colors cursor-pointer">
            Back
        </button>
    `;

    const seriesSelect = document.getElementById('modal-series-select');
    const aggSelect = document.getElementById('modal-agg-select');

    seriesSelect.addEventListener('change', () => {
        const unused = getUnusedAggs(seriesSelect.value);
        aggSelect.innerHTML = unused.map(a =>
            `<option value="${a}">${a.charAt(0).toUpperCase() + a.slice(1)}</option>`
        ).join('');
    });

    document.getElementById('modal-confirm-agg-btn').addEventListener('click', () => {
        addAggregationOfType(seriesSelect.value, aggSelect.value);
        closeModal();
    });

    document.getElementById('modal-back-btn').addEventListener('click', () => {
        closeModal();
        showAddSeriesModal();
    });
}

function addAggregationOfType(seriesName, aggType) {
    // Get base config from first aggregation
    const firstConfig = getFirstConfig(seriesName, isMiscSeries(seriesName));
    const newConfig = { ...firstConfig };

    setConfig(seriesName, aggType, newConfig);

    // Re-render flat nav and select the new aggregation
    renderSeriesNav();
    selectAggregation(seriesName, aggType);

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
}

function removeAggregationByType(seriesName, aggType) {
    const aggCount = getAggCount(seriesName);
    if (aggCount <= 1) return;

    deleteConfig(seriesName, aggType);

    // Select first remaining aggregation
    const remainingAggs = getAggTypes(seriesName);
    const newAggType = remainingAggs[0];

    // Re-render flat nav
    renderSeriesNav();

    // If removed the currently selected agg, select another
    if (currentSeries === seriesName && currentAggType === aggType) {
        selectAggregation(seriesName, newAggType);
    }

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
    eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);
}

// ============================================================================
// REMOVE CURRENT SELECTION
// ============================================================================

function removeCurrentSelection() {
    const seriesName = currentSeries;
    const aggType = currentAggType;
    const isMisc = isMiscSeries(seriesName);
    const config = getFirstConfig(seriesName, isMisc);
    const displayName = config?.seriesName || seriesName;
    const aggCount = getAggCount(seriesName);
    const isLastAgg = aggCount <= 1;

    // Determine if this is the last agg of a misc series (full deletion)
    const isFullMiscDelete = isMisc && isLastAgg;

    const message = isFullMiscDelete
        ? `Delete "${displayName}" series?`
        : `Remove ${displayName} (${aggType.charAt(0).toUpperCase() + aggType.slice(1)})?`;

    const yesLabel = isFullMiscDelete ? 'Delete' : 'Remove';

    createConfirmToast({
        message,
        onYes: () => {
            if (isFullMiscDelete) {
                import('./miscSeries.js').then(({ removeMiscSeries }) => {
                    removeMiscSeries(seriesName);
                });
            } else {
                removeAggregationByType(seriesName, aggType);
            }
        },
        onNo: () => {},
        yesLabel,
        noLabel: 'Cancel',
        primaryColor: '#ef4444'
    });
}

// ============================================================================
// VISIBILITY FUNCTIONS
// ============================================================================

function updateTimingSeriesVisibility() {
    const shouldShow = chartState.minuteChart;

    // Hide/show all timing headings and rows in the flat list
    document.querySelectorAll('#series-flat-list [data-series-type="timing"]').forEach(el => {
        el.style.display = shouldShow ? '' : 'none';
    });

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
    // Set up add series button → opens modal with New Series / Add Aggregation options
    const addSeriesBtn = document.querySelector('[data-action="add-misc-series"]');
    if (addSeriesBtn) {
        addSeriesBtn.addEventListener('click', () => showAddSeriesModal());
    }

    // Set up config panel buttons
    document.getElementById('apply-config-btn')?.addEventListener('click', applyConfig);
    document.getElementById('reset-config-btn')?.addEventListener('click', resetConfig);
    document.getElementById('remove-series-btn')?.addEventListener('click', removeCurrentSelection);

    // Initial render
    renderSeriesNav();

    // Select corrects/raw by default
    selectAggregation(CORRECTS, 'raw');
}

function initializeAllSeriesInputs() {
    renderSeriesNav();

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
    updateTimingSeriesVisibility,
    getFirstConfig
};

console.log('traceStyles.js loaded');
