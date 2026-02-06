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
import { getMiscSeriesIds, addMiscSeries, canAddMiscSeries, removeMiscSeries } from './miscSeries.js';
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

        // Clickable heading for the series group
        const heading = document.createElement('div');
        heading.className = 'series-heading';
        heading.dataset.series = seriesName;
        heading.textContent = truncateTabName(displayName);
        if (seriesName === TIMING) {
            heading.dataset.seriesType = 'timing';
            heading.style.display = chartState.minuteChart ? '' : 'none';
        }
        if (seriesName === currentSeries && currentAggType === null) {
            heading.classList.add('active');
        }
        heading.addEventListener('click', () => selectSeriesHeading(seriesName));
        flatList.appendChild(heading);

        // Indented clickable rows for each aggregation
        aggTypes.forEach(aggType => {
            const label = aggType === 'raw'
                ? 'Raw'
                : aggType.charAt(0).toUpperCase() + aggType.slice(1);

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

    // Clear active from all headings and agg rows
    document.querySelectorAll('#series-flat-list .series-heading').forEach(h => {
        h.classList.remove('active');
    });
    document.querySelectorAll('#series-flat-list .series-row').forEach(row => {
        row.classList.remove('active');
        if (row.dataset.series === seriesName && row.dataset.agg === aggType) {
            row.classList.add('active');
        }
    });

    // Switch to config panel, hide add-agg panel
    const addAggPanel = document.getElementById('add-agg-panel');
    const configPanel = document.getElementById('series-config-panel');
    if (addAggPanel) addAggPanel.style.display = 'none';
    if (configPanel) configPanel.style.display = '';

    // Load config into panel
    loadConfigPanel(seriesName, aggType);
}

function selectSeriesHeading(seriesName) {
    currentSeries = seriesName;
    currentAggType = null;

    // Clear active from all agg rows, set active on clicked heading
    document.querySelectorAll('#series-flat-list .series-row').forEach(row => {
        row.classList.remove('active');
    });
    document.querySelectorAll('#series-flat-list .series-heading').forEach(h => {
        h.classList.remove('active');
        if (h.dataset.series === seriesName) {
            h.classList.add('active');
        }
    });

    loadAddAggPanel(seriesName);
}

function loadAddAggPanel(seriesName) {
    const addAggPanel = document.getElementById('add-agg-panel');
    const configPanel = document.getElementById('series-config-panel');
    if (!addAggPanel || !configPanel) return;

    // Show add-agg panel, hide config panel
    configPanel.style.display = 'none';
    addAggPanel.style.display = '';

    // Set series name heading
    const nameEl = document.getElementById('add-agg-series-name');
    if (nameEl) nameEl.textContent = getSeriesDisplayName(seriesName);

    // Populate unused agg types
    const unused = getUnusedAggs(seriesName);
    const select = document.getElementById('agg-type-select');
    const addBtn = document.getElementById('confirm-add-agg-btn');
    const emptyMsg = document.getElementById('add-agg-empty-msg');

    if (select) {
        select.innerHTML = unused.map(a =>
            `<option value="${a}">${a.charAt(0).toUpperCase() + a.slice(1)}</option>`
        ).join('');
    }

    if (unused.length === 0) {
        if (select) select.style.display = 'none';
        if (addBtn) addBtn.style.display = 'none';
        if (emptyMsg) emptyMsg.style.display = '';
    } else {
        if (select) select.style.display = '';
        if (addBtn) addBtn.style.display = '';
        if (emptyMsg) emptyMsg.style.display = 'none';
    }

    // Show delete button only for misc series
    const deleteBtn = document.getElementById('delete-series-btn');
    if (deleteBtn) {
        deleteBtn.style.display = isMiscSeries(seriesName) ? '' : 'none';
    }
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

    // Always show Remove button (series-level protection is handled at the heading panel)
    const removeBtn = document.getElementById('remove-series-btn');
    if (removeBtn) {
        removeBtn.style.display = '';
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

function getUnusedAggs(seriesName) {
    const usedAggs = getAggTypes(seriesName);
    return getAvailableAggTypes().filter(a => !usedAggs.includes(a));
}

function getSeriesDisplayName(seriesName) {
    const isMisc = isMiscSeries(seriesName);
    const config = getFirstConfig(seriesName, isMisc);
    return config?.seriesName || seriesName;
}

function showNameSeriesModal() {
    document.getElementById('name-series-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'name-series-modal';
    overlay.className = 'fixed inset-0 bg-black/50 flex justify-center items-center z-[10000]';

    overlay.innerHTML = `
        <div class="bg-white p-5 rounded-lg shadow-xl w-[280px] max-w-[90vw]">
            <h3 class="m-0 mb-4 text-sm font-bold text-gray-800">New Series</h3>
            <div class="flex flex-col gap-2">
                <label class="text-sm font-semibold text-gray-600">Name</label>
                <input id="modal-series-name-input" type="text" placeholder="e.g. Prompts"
                    class="w-full px-3 py-2 border-2 border-gray-300 rounded text-sm focus:outline-none focus:border-[#6ad1e3]">
            </div>
            <div class="flex gap-2 mt-4">
                <button id="modal-name-cancel-btn"
                    class="flex-1 py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 text-sm font-medium transition-colors cursor-pointer">
                    Cancel
                </button>
                <button id="modal-name-confirm-btn"
                    class="flex-1 py-2 bg-[#6ad1e3] hover:bg-[#5bc1d3] rounded text-white text-sm font-medium transition-colors cursor-pointer">
                    Create
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const nameInput = document.getElementById('modal-series-name-input');
    const closeModal = () => overlay.remove();

    const confirmCreate = () => {
        const name = nameInput.value.trim();
        if (!name) {
            nameInput.focus();
            return;
        }
        const id = addMiscSeries();
        if (id) {
            // Overwrite the default display name with the user's choice
            const configs = chartState.traceStyles.misc[id];
            if (configs) {
                Object.values(configs).forEach(cfg => { cfg.seriesName = name; });
            }
            // Re-render so the name shows immediately
            renderSeriesNav();
            selectAggregation(id, 'raw');
            updateCounterLabels();
        }
        closeModal();
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    const onKeydown = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', onKeydown);
        } else if (e.key === 'Enter') {
            confirmCreate();
            document.removeEventListener('keydown', onKeydown);
        }
    };
    document.addEventListener('keydown', onKeydown);

    const observer = new MutationObserver(() => {
        if (!document.getElementById('name-series-modal')) {
            document.removeEventListener('keydown', onKeydown);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true });

    document.getElementById('modal-name-cancel-btn').addEventListener('click', closeModal);
    document.getElementById('modal-name-confirm-btn').addEventListener('click', confirmCreate);

    nameInput.focus();
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
    deleteConfig(seriesName, aggType);

    const remainingAggs = getAggTypes(seriesName);

    // Re-render flat nav
    renderSeriesNav();

    // If removed the currently selected agg, select another or fall back to heading
    if (currentSeries === seriesName && currentAggType === aggType) {
        if (remainingAggs.length > 0) {
            selectAggregation(seriesName, remainingAggs[0]);
        } else {
            selectSeriesHeading(seriesName);
        }
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

    // Last agg of a misc series → delete entire series; otherwise just remove the agg
    const isFullMiscDelete = isMisc && isLastAgg;

    const aggLabel = aggType.charAt(0).toUpperCase() + aggType.slice(1);
    const message = isFullMiscDelete
        ? `Delete "${displayName}" series?`
        : `Remove ${displayName} (${aggLabel})?`;

    const yesLabel = isFullMiscDelete ? 'Delete' : 'Remove';

    createConfirmToast({
        message,
        onYes: () => {
            if (isFullMiscDelete) {
                removeMiscSeries(seriesName);
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
    // Set up add series button → shows name modal then creates misc series
    const addSeriesBtn = document.querySelector('[data-action="add-misc-series"]');
    if (addSeriesBtn) {
        addSeriesBtn.addEventListener('click', () => {
            if (!canAddMiscSeries()) {
                createToast({ message: 'Maximum of 10 misc series reached.', duration: 3000 });
            } else {
                showNameSeriesModal();
            }
        });
    }

    // Set up config panel buttons
    document.getElementById('apply-config-btn')?.addEventListener('click', applyConfig);
    document.getElementById('reset-config-btn')?.addEventListener('click', resetConfig);
    document.getElementById('remove-series-btn')?.addEventListener('click', removeCurrentSelection);

    // Set up add-agg panel confirm button
    document.getElementById('confirm-add-agg-btn')?.addEventListener('click', () => {
        const aggType = document.getElementById('agg-type-select')?.value;
        if (currentSeries && aggType) {
            addAggregationOfType(currentSeries, aggType);
        }
    });

    // Set up delete series button (only functional for misc series)
    document.getElementById('delete-series-btn')?.addEventListener('click', () => {
        if (!currentSeries || !isMiscSeries(currentSeries)) return;
        const displayName = getSeriesDisplayName(currentSeries);
        createConfirmToast({
            message: `Delete "${displayName}" series and all its aggregations?`,
            onYes: () => {
                removeMiscSeries(currentSeries);
            },
            onNo: () => {},
            yesLabel: 'Delete',
            noLabel: 'Cancel',
            primaryColor: '#ef4444'
        });
    });

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
