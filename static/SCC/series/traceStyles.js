/**
 * Trace Styles Configuration
 *
 * This module handles:
 * - Flat series navigation (one row per series+aggregation combo)
 * - Single aggregation config panel
 * - Adding/removing aggregation methods per series
 *
 * Keys in traceStyles are counter-based IDs ("0", "1", ...), not aggregation
 * type names. Each config carries onXAgg and acrossXAgg explicitly.
 */

import { chartState } from '../chartState.js';
import { CORRECTS, ERRORS, TIMING, LIMITS, LINE_DEFAULTS, WINDOW_UNITS, defaultCorrectTraceConfig, defaultErrorTraceConfig, defaultTimingTraceConfig, createMiscTraceConfig } from '../config.js';
import { getMiscSeriesIds, addMiscSeries, canAddMiscSeries, removeMiscSeries } from './miscSeries.js';
import { createToast, createConfirmToast } from '../ui/toaster.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { FIT_METHODS } from '../util/fit_lines.js';

// ============================================================================
// STATE
// ============================================================================

// Currently selected series and aggregation counter ID
let currentSeries = CORRECTS;
let currentAggId = '0';

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

function getConfig(seriesName, aggId) {
    const configs = getSeriesConfigs(seriesName);
    return configs ? configs[aggId] : null;
}

function setConfig(seriesName, aggId, config) {
    const configs = getSeriesConfigs(seriesName) || {};
    configs[aggId] = config;
    setSeriesConfigs(seriesName, configs);
}

function deleteConfig(seriesName, aggId) {
    const configs = getSeriesConfigs(seriesName);
    if (configs && configs[aggId]) {
        delete configs[aggId];
    }
}

function getFirstConfig(seriesName, isMisc) {
    const misc = isMisc ?? seriesName?.startsWith('misc');
    const configs = misc
        ? chartState.traceStyles.misc?.[seriesName]
        : chartState.traceStyles?.[seriesName];
    if (!configs) return null;
    const firstKey = Object.keys(configs)[0];
    return firstKey ? configs[firstKey] : null;
}



function getAggCount(seriesName) {
    const configs = getSeriesConfigs(seriesName);
    return configs ? Object.keys(configs).length : 0;
}

function getAggIds(seriesName) {
    const configs = getSeriesConfigs(seriesName);
    return configs ? Object.keys(configs) : [];
}

function getNextAggId(seriesName) {
    const configs = getSeriesConfigs(seriesName);
    if (!configs || Object.keys(configs).length === 0) return '0';
    return String(Math.max(...Object.keys(configs).map(Number)) + 1);
}

function getFirstAggId(seriesName) {
    const configs = getSeriesConfigs(seriesName);
    const keys = configs ? Object.keys(configs) : [];
    return keys.length > 0 ? keys[0] : '0';
}

/**
 * Generate a human-readable label for an aggregation config
 */
function getAggLabel(config) {
    const onX = config.onXAgg || 'raw';
    const onXLabel = onX.charAt(0).toUpperCase() + onX.slice(1);

    const parts = [];
    if (config.detrend) {
        parts.push(`${config.detrend.method} residuals ${config.detrend.center ?? 1}`);
    }
    if (config.acrossXAgg) {
        const acrossXLabel = config.acrossXAgg.fn.charAt(0).toUpperCase() + config.acrossXAgg.fn.slice(1);
        const unit = WINDOW_UNITS[chartState.chartType]?.abbrev || 'x';
        parts.push(`${acrossXLabel} ${unit}${config.acrossXAgg.window}`);
    }

    return parts.length > 0 ? `${onXLabel} (${parts.join(', ')})` : onXLabel;
}

/**
 * Check if a given onXAgg + acrossXAgg combination already exists for a series
 */
function isDuplicateAgg(seriesName, onXAgg, acrossXAgg, detrend) {
    const configs = getSeriesConfigs(seriesName);
    if (!configs) return false;
    return Object.values(configs).some(cfg => {
        if (cfg.onXAgg !== onXAgg) return false;
        const cfgDetrend = cfg.detrend?.method || null;
        const newDetrend = detrend?.method || null;
        if (cfgDetrend !== newDetrend) return false;
        if (cfgDetrend && (cfg.detrend?.center ?? 1) !== (detrend?.center ?? 1)) return false;
        if (!acrossXAgg && !cfg.acrossXAgg) return true;
        if (!acrossXAgg || !cfg.acrossXAgg) return false;
        return cfg.acrossXAgg.fn === acrossXAgg.fn && cfg.acrossXAgg.window === acrossXAgg.window;
    });
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
        const configs = getSeriesConfigs(seriesName);
        const aggIds = configs ? Object.keys(configs) : [];
        const isMisc = isMiscSeries(seriesName);
        const config = getFirstConfig(seriesName, isMisc);
        const displayName = config?.seriesName || seriesName;

        // Clickable heading for the series group
        const heading = document.createElement('div');
        heading.className = 'series-heading';
        heading.dataset.series = seriesName;
        heading.textContent = truncateTabName(displayName);
        heading.title = displayName;
        if (seriesName === TIMING) {
            heading.dataset.seriesType = 'timing';
            heading.style.display = chartState.minuteChart ? '' : 'none';
        }
        if (seriesName === currentSeries && currentAggId === null) {
            heading.classList.add('active');
        }
        heading.addEventListener('click', () => selectSeriesHeading(seriesName));
        flatList.appendChild(heading);

        // Indented clickable rows for each aggregation
        aggIds.forEach(aggId => {
            const aggConfig = configs[aggId];
            const label = getAggLabel(aggConfig);

            const btn = document.createElement('button');
            btn.className = 'series-row series-agg-row';
            btn.dataset.series = seriesName;
            btn.dataset.agg = aggId;

            if (seriesName === TIMING) {
                btn.dataset.seriesType = 'timing';
                btn.style.display = chartState.minuteChart ? '' : 'none';
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'series-name';
            nameSpan.textContent = truncateTabName(label);
            nameSpan.title = label;
            btn.appendChild(nameSpan);

            if (seriesName === currentSeries && aggId === currentAggId) {
                btn.classList.add('active');
            }

            btn.addEventListener('click', () => selectAggregation(seriesName, aggId));
            flatList.appendChild(btn);
        });
    });
}

// ============================================================================
// INTERACTION HANDLERS
// ============================================================================

function selectAggregation(seriesName, aggId) {
    currentSeries = seriesName;
    currentAggId = aggId;

    // Clear active from all headings and agg rows
    document.querySelectorAll('#series-flat-list .series-heading').forEach(h => {
        h.classList.remove('active');
    });
    document.querySelectorAll('#series-flat-list .series-row').forEach(row => {
        row.classList.remove('active');
        if (row.dataset.series === seriesName && row.dataset.agg === aggId) {
            row.classList.add('active');
        }
    });

    // Switch to config panel, hide add-agg panel
    const addAggPanel = document.getElementById('add-agg-panel');
    const configPanel = document.getElementById('series-config-panel');
    if (addAggPanel) addAggPanel.style.display = 'none';
    if (configPanel) configPanel.style.display = '';

    // Load config into panel
    loadConfigPanel(seriesName, aggId);
}

function selectSeriesHeading(seriesName) {
    currentSeries = seriesName;
    currentAggId = null;

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

    // Populate display name input
    const nameInput = document.getElementById('heading-series-name');
    if (nameInput) nameInput.value = getSeriesDisplayName(seriesName);

    // Populate on-x agg dropdown
    const onXSelect = document.getElementById('on-x-agg-select');
    const acrossXSelect = document.getElementById('across-x-agg-select');
    const windowSizeRow = document.getElementById('window-size-row');

    const aggTypes = getAvailableAggTypes();

    if (onXSelect) {
        onXSelect.innerHTML = aggTypes.map(a =>
            `<option value="${a}">${a.charAt(0).toUpperCase() + a.slice(1)}</option>`
        ).join('');
    }

    if (acrossXSelect) {
        const rollingAggs = aggTypes.filter(a => !['raw', 'first', 'last', 'sum'].includes(a));
        acrossXSelect.innerHTML =
            `<option value="none">None</option>` +
            rollingAggs.map(a =>
                `<option value="${a}">${a.charAt(0).toUpperCase() + a.slice(1)}</option>`
            ).join('');
    }

    // Populate detrend dropdown and wire center row visibility
    const detrendSelect = document.getElementById('detrend-select');
    const detrendCenterRow = document.getElementById('detrend-center-row');
    if (detrendSelect) {
        const trendMethods = Object.values(FIT_METHODS).filter(m =>
            m !== FIT_METHODS.MEAN && m !== FIT_METHODS.MEDIAN
        );
        detrendSelect.innerHTML =
            `<option value="none">None</option>` +
            trendMethods.map(m =>
                `<option value="${m}">${m}</option>`
            ).join('');

        const newDetrendSelect = detrendSelect.cloneNode(true);
        detrendSelect.parentNode.replaceChild(newDetrendSelect, detrendSelect);
        newDetrendSelect.addEventListener('change', () => {
            if (detrendCenterRow) {
                detrendCenterRow.style.display = newDetrendSelect.value === 'none' ? 'none' : '';
            }
        });
    }

    // Hide window size row initially; set label and default value to match chart type
    const unitConfig = WINDOW_UNITS[chartState.chartType];
    if (windowSizeRow) {
        windowSizeRow.style.display = 'none';
        const windowLabel = windowSizeRow.querySelector('label');
        if (windowLabel) windowLabel.textContent = `${unitConfig?.name || 'Position'} Window`;
        const windowInput = document.getElementById('window-size-input');
        if (windowInput) windowInput.value = unitConfig?.defaultWindow || 7;
    }

    // Rolling window + detrend rows: hidden entirely when on-x is "raw"
    const acrossXRow = document.getElementById('across-x-agg-row');
    const detrendRow = document.getElementById('detrend-row');

    // Wire across-x change to show/hide window size
    let liveAcrossXSelect = acrossXSelect;
    if (acrossXSelect) {
        const newSelect = acrossXSelect.cloneNode(true);
        acrossXSelect.parentNode.replaceChild(newSelect, acrossXSelect);
        liveAcrossXSelect = newSelect;
        newSelect.addEventListener('change', () => {
            if (windowSizeRow) {
                windowSizeRow.style.display = newSelect.value === 'none' ? 'none' : '';
            }
        });
    }

    // Wire on-x change to hide rolling window + detrend controls when "raw" is selected
    const liveDetrendSelect = document.getElementById('detrend-select');
    if (onXSelect) {
        const newOnX = onXSelect.cloneNode(true);
        onXSelect.parentNode.replaceChild(newOnX, onXSelect);
        newOnX.addEventListener('change', () => {
            if (newOnX.value === 'raw') {
                if (liveAcrossXSelect) liveAcrossXSelect.value = 'none';
                if (acrossXRow) acrossXRow.style.display = 'none';
                if (detrendRow) detrendRow.style.display = 'none';
                if (liveDetrendSelect) liveDetrendSelect.value = 'none';
                if (detrendCenterRow) detrendCenterRow.style.display = 'none';
                if (windowSizeRow) windowSizeRow.style.display = 'none';
            } else {
                if (acrossXRow) acrossXRow.style.display = '';
                if (detrendRow) detrendRow.style.display = '';
            }
        });
        // Initial state: raw is selected by default → hide rolling window + detrend controls
        if (acrossXRow) acrossXRow.style.display = 'none';
        if (detrendRow) detrendRow.style.display = 'none';
        if (detrendCenterRow) detrendCenterRow.style.display = 'none';
    }

    // Always show add button and hide empty message (duplicates are checked on click)
    const addBtn = document.getElementById('confirm-add-agg-btn');
    const emptyMsg = document.getElementById('add-agg-empty-msg');
    if (addBtn) addBtn.style.display = '';
    if (emptyMsg) emptyMsg.style.display = 'none';

    // Show delete button only for misc series
    const deleteBtn = document.getElementById('delete-series-btn');
    if (deleteBtn) {
        deleteBtn.style.display = isMiscSeries(seriesName) ? '' : 'none';
    }
}

// ============================================================================
// CONFIG PANEL
// ============================================================================

/**
 * Enable/disable line and marker sub-fields based on current dropdown values.
 * When line style is "none", line width and color are meaningless.
 * When marker symbol is "none", marker size, color, and edge color are meaningless.
 */
function updateFieldStates() {
    const lineDash = document.getElementById('config-line-dash')?.value;
    const markerSymbol = document.getElementById('config-marker-symbol')?.value;

    const lineDisabled = lineDash === 'none';
    const markerDisabled = markerSymbol === 'none';

    const setDisabled = (id, disabled) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = disabled;
        const wrapper = el.closest('div');
        if (wrapper) {
            wrapper.classList.toggle('opacity-40', disabled);
            wrapper.classList.toggle('pointer-events-none', disabled);
        }
    };

    setDisabled('config-line-width', lineDisabled);
    setDisabled('config-line-color', lineDisabled);
    setDisabled('config-marker-size', markerDisabled);
    setDisabled('config-marker-color', markerDisabled);
    setDisabled('config-marker-edge-color', markerDisabled);
}

function loadConfigPanel(seriesName, aggId) {
    const config = getConfig(seriesName, aggId);
    if (!config) return;

    const isMisc = isMiscSeries(seriesName);

    const symbolRow = document.getElementById('marker-symbol-row');
    if (symbolRow) {
        symbolRow.style.display = '';
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
    document.getElementById('config-marker-size').value = config.markerSize || 8;
    document.getElementById('config-line-width').value = config.lineWidth || 0.7;
    document.getElementById('config-line-color').value = config.lineColor || '#000000';
    document.getElementById('config-marker-color').value = config.markerColor || '#000000';
    document.getElementById('config-marker-edge-color').value = config.markerEdgeColor || '#000000';
    document.getElementById('config-marker-symbol').value = config.markerSymbol || 'circle';

    // Line style: "none" if showLine is false, otherwise the actual dash value
    const showLine = config.showLine ?? true;
    document.getElementById('config-line-dash').value = showLine ? (config.lineDash || 'solid') : 'none';

    updateFieldStates();
}

function applyConfig() {
    const seriesName = currentSeries;
    const aggId = currentAggId;

    const existingConfig = getConfig(seriesName, aggId);
    const lineDashRaw = document.getElementById('config-line-dash').value || 'solid';
    const showLine = lineDashRaw !== 'none';
    const config = {
        seriesName: existingConfig?.seriesName || seriesName,
        showLine,
        lineDash: showLine ? lineDashRaw : 'solid',
        lineWidth: parseFloat(document.getElementById('config-line-width').value) || LINE_DEFAULTS.TRACE_LINE_WIDTH,
        lineColor: document.getElementById('config-line-color').value || '#000000',
        markerSize: parseInt(document.getElementById('config-marker-size').value) || 8,
        markerColor: document.getElementById('config-marker-color').value || '#000000',
        markerEdgeColor: document.getElementById('config-marker-edge-color').value || '#000000',
        markerSymbol: document.getElementById('config-marker-symbol').value || 'circle',
        // Preserve aggregation properties from existing config
        onXAgg: existingConfig?.onXAgg || 'raw',
        acrossXAgg: existingConfig?.acrossXAgg || null,
        detrend: existingConfig?.detrend || null
    };

    setConfig(seriesName, aggId, config);

    // Re-render flat nav and refresh
    renderSeriesNav();
    updateCounterLabels();
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
    eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);
    createToast({ message: `${config.seriesName} updated.`, duration: 2000 });

    // Re-select to update active states
    selectAggregation(seriesName, aggId);
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
        setSeriesConfigs(seriesName, { "0": createMiscTraceConfig(index) });
    } else {
        setSeriesConfigs(seriesName, { "0": { ...defaultsMap[seriesName] } });
    }

    currentAggId = '0';

    // Re-render flat nav and select
    renderSeriesNav();
    selectAggregation(seriesName, '0');
    updateCounterLabels();

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
    eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);
    createToast({ message: `Reset to defaults.`, duration: 2000 });
}

function applyHeadingName() {
    const seriesName = currentSeries;
    if (!seriesName) return;

    const nameInput = document.getElementById('heading-series-name');
    const newName = nameInput?.value.trim();
    if (!newName) return;

    // Update seriesName on ALL aggregation configs for this series
    const configs = getSeriesConfigs(seriesName);
    if (configs) {
        Object.values(configs).forEach(cfg => { cfg.seriesName = newName; });
    }

    // Update the heading text in the panel
    const nameEl = document.getElementById('add-agg-series-name');
    if (nameEl) nameEl.textContent = newName;

    renderSeriesNav();
    updateCounterLabels();
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
    eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);
    createToast({ message: `Renamed to "${newName}".`, duration: 2000 });

    // Re-select heading to keep it active
    selectSeriesHeading(seriesName);
}

// ============================================================================
// AGGREGATION MANAGEMENT
// ============================================================================

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
            selectAggregation(id, getFirstAggId(id));
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

/**
 * Add a new aggregation configuration for a series.
 * @param {string} seriesName - Series key
 * @param {string} onXAgg - Per-position aggregation type
 * @param {Object|null} acrossXAgg - Rolling window config { fn, window } or null
 * @param {Object|null} detrend - Detrend config { method } or null
 */
function addAggregation(seriesName, onXAgg, acrossXAgg, detrend) {
    if (isDuplicateAgg(seriesName, onXAgg, acrossXAgg, detrend)) {
        createToast({ message: 'This aggregation combination already exists.', duration: 3000 });
        return;
    }

    // Clone style properties from the first existing config
    const firstConfig = getFirstConfig(seriesName, isMiscSeries(seriesName));
    const newConfig = {
        ...(firstConfig || {}),
        onXAgg,
        acrossXAgg,
        detrend
    };

    const newId = getNextAggId(seriesName);
    setConfig(seriesName, newId, newConfig);

    // Re-render flat nav and select the new aggregation
    renderSeriesNav();
    selectAggregation(seriesName, newId);

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
}

function removeAggregation(seriesName, aggId) {
    deleteConfig(seriesName, aggId);

    const remainingIds = getAggIds(seriesName);

    // Re-render flat nav
    renderSeriesNav();

    // If removed the currently selected agg, select another or fall back to heading
    if (currentSeries === seriesName && currentAggId === aggId) {
        if (remainingIds.length > 0) {
            selectAggregation(seriesName, remainingIds[0]);
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
    const aggId = currentAggId;
    const isMisc = isMiscSeries(seriesName);
    const config = getConfig(seriesName, aggId);
    const firstCfg = getFirstConfig(seriesName, isMisc);
    const displayName = firstCfg?.seriesName || seriesName;
    const aggCount = getAggCount(seriesName);
    const isLastAgg = aggCount <= 1;

    // Last agg of a misc series → delete entire series; otherwise just remove the agg
    const isFullMiscDelete = isMisc && isLastAgg;

    const aggLabel = config ? getAggLabel(config) : aggId;
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
                removeAggregation(seriesName, aggId);
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
        selectAggregation(CORRECTS, getFirstAggId(CORRECTS));
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

    // Live-update field states when line style or marker symbol changes
    document.getElementById('config-line-dash')?.addEventListener('change', updateFieldStates);
    document.getElementById('config-marker-symbol')?.addEventListener('change', updateFieldStates);

    // Set up config panel buttons
    document.getElementById('apply-config-btn')?.addEventListener('click', applyConfig);
    document.getElementById('reset-config-btn')?.addEventListener('click', resetConfig);
    document.getElementById('remove-series-btn')?.addEventListener('click', removeCurrentSelection);

    // Set up add-agg panel confirm button
    document.getElementById('confirm-add-agg-btn')?.addEventListener('click', () => {
        const onXAgg = document.getElementById('on-x-agg-select')?.value;
        const acrossXVal = document.getElementById('across-x-agg-select')?.value;
        const windowSize = parseInt(document.getElementById('window-size-input')?.value) || 7;
        const detrendVal = document.getElementById('detrend-select')?.value;

        if (!currentSeries || !onXAgg) return;

        const acrossXAgg = (acrossXVal && acrossXVal !== 'none')
            ? { fn: acrossXVal, window: Math.max(2, windowSize) }
            : null;

        const detrendCenter = parseFloat(document.getElementById('detrend-center-input')?.value) || 1;
        const detrend = (detrendVal && detrendVal !== 'none')
            ? { method: detrendVal, center: detrendCenter }
            : null;

        addAggregation(currentSeries, onXAgg, acrossXAgg, detrend);
    });

    // Set up heading name apply button
    document.getElementById('apply-heading-name-btn')?.addEventListener('click', () => {
        applyHeadingName();
    });

    // Also apply on Enter key in heading name input
    document.getElementById('heading-series-name')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyHeadingName();
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

    // Select corrects first agg by default
    selectAggregation(CORRECTS, getFirstAggId(CORRECTS));
}

function initializeAllSeriesInputs() {
    renderSeriesNav();

    // Re-select current if valid, otherwise default to corrects first agg
    const configs = getSeriesConfigs(currentSeries);
    if (configs && configs[currentAggId]) {
        selectAggregation(currentSeries, currentAggId);
    } else {
        selectAggregation(CORRECTS, getFirstAggId(CORRECTS));
    }
}

// ============================================================================
// EVENT SUBSCRIPTIONS
// ============================================================================

eventBus.subscribe(EVENTS.MISC_SERIES_ADDED, ({ id }) => {
    renderSeriesNav();
    selectAggregation(id, getFirstAggId(id));
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
}, true);

eventBus.subscribe(EVENTS.MISC_SERIES_REMOVED, ({ id }) => {
    renderSeriesNav();
    if (currentSeries === id) {
        selectAggregation(CORRECTS, getFirstAggId(CORRECTS));
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
    getFirstConfig,
    getAggLabel
};
