/**
 * Trace Styles Configuration
 *
 * This module handles:
 * - Reading and writing trace configuration objects
 * - Syncing trace configs with HTML form inputs
 * - Series configuration UI management
 * - Aggregation block management (adding/removing config blocks)
 */

import { chartState, defaultCorrectTraceConfig, defaultErrorTraceConfig, defaultTimingTraceConfig, createMiscTraceConfig } from '../chartState.js';
import { CORRECTS, ERRORS, TIMING } from '../config.js';
import { getMiscSeriesIds } from './miscSeries.js';
import { createToast } from '../util/toaster.js';
import { eventBus, EVENTS } from '../eventBus.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const MAX_TAB_NAME_LENGTH = 17;

/**
 * Truncate a series name for display in tab buttons.
 * @param {string} name - The series name to truncate
 * @returns {string} Truncated name with "..." if over limit
 */
function truncateTabName(name) {
    if (!name || name.length <= MAX_TAB_NAME_LENGTH) {
        return name;
    }
    return name.slice(0, MAX_TAB_NAME_LENGTH) + '...';
}

// ============================================================================
// AGGREGATION OPTIONS
// ============================================================================

/**
 * Get available aggregation types based on chart type.
 * 'sum' is only available for non-minute charts (where frequency = raw count).
 * @returns {string[]} Array of available aggregation type keys
 */
function getAvailableAggTypes() {
    const baseAggs = ['raw', 'mean', 'median', 'min', 'max', 'first', 'last'];
    if (!chartState.minuteChart) {
        baseAggs.push('sum');
    }
    return baseAggs;
}

/**
 * Update visibility of sum option in all aggregation select dropdowns.
 * Called on initialization and when chart type could change.
 */
function updateSumOptionVisibility() {
    const sumOptions = document.querySelectorAll('.agg-type-select .sum-option');
    const shouldShow = !chartState.minuteChart;

    sumOptions.forEach(option => {
        option.style.display = shouldShow ? '' : 'none';
        // If sum was selected on a minute chart, reset to 'raw'
        if (!shouldShow && option.selected) {
            option.parentElement.value = 'raw';
        }
    });
}

// ============================================================================
// TRACE CONFIGURATION UI
// ============================================================================

function updateCounterLabels() {
    // Get the first available aggregation config for each series for UI labels
    const getFirstConfig = (seriesName, isMisc = false) => {
        const configs = isMisc
            ? chartState.traceStyles.misc[seriesName]
            : chartState.traceStyles[seriesName];
        if (!configs) return null;
        const firstAggType = Object.keys(configs)[0];
        return configs[firstAggType];
    };

    document.getElementById('corrects-series-label').textContent = getFirstConfig(CORRECTS).seriesName;
    document.getElementById('errors-series-label').textContent = getFirstConfig(ERRORS).seriesName;
    document.getElementById('timing-series-label').textContent = getFirstConfig(TIMING).seriesName;

    // Update labels for dynamic misc series
    getMiscSeriesIds().forEach(miscId => {
        const label = document.getElementById(`${miscId}-series-label`);
        const config = getFirstConfig(miscId, true);
        if (label && config) {
            label.textContent = config.seriesName;
        }
    });
}

function updateTraceConfig(seriesName, newConfig) {
    // Update "raw" aggregation config by default for now
    // TODO: In future, allow UI to select which aggregation to update
    const configObj = chartState.traceStyles[seriesName]["raw"];
    Object.assign(configObj, newConfig);
}

function initializeSeriesInputs(seriesName) {
    // Initialize all aggregation blocks for this series from chartState
    const container = document.getElementById(`${seriesName}-blocks-container`);
    if (!container) return;

    // Get all aggregation configs for this series (handle nested misc structure)
    const isMiscSeries = seriesName.startsWith('misc');
    const aggConfigs = isMiscSeries
        ? chartState.traceStyles.misc[seriesName]
        : chartState.traceStyles[seriesName];

    if (!aggConfigs) return;

    // Get template block, clear all blocks, rebuild from chartState
    const existingBlocks = Array.from(container.querySelectorAll('.agg-config-block'));
    const templateBlock = existingBlocks[0]?.cloneNode(true);
    if (!templateBlock) return;

    existingBlocks.forEach(block => block.remove());

    // Create and initialize a block for each entry in aggConfigs
    Object.entries(aggConfigs).forEach(([aggType, config]) => {
        const block = templateBlock.cloneNode(true);
        container.appendChild(block);

        // Set the aggregation type
        const aggSelect = block.querySelector('.agg-type-select');
        if (aggSelect) {
            aggSelect.value = aggType;
            block.dataset.agg = aggType;
        }

        // Set common fields
        const seriesNameInput = block.querySelector('.series-name-input');
        const showLineInput = block.querySelector('.show-line-input');
        const lineWidthInput = block.querySelector('.line-width-input');
        const lineColorInput = block.querySelector('.line-color-input');

        if (seriesNameInput) seriesNameInput.value = config.seriesName;
        if (showLineInput) showLineInput.checked = config.showLine;
        if (lineWidthInput) lineWidthInput.value = config.lineWidth;
        if (lineColorInput) lineColorInput.value = config.lineColor;

        // Set series-specific fields
        if (seriesName === ERRORS) {
            const textSizeInput = block.querySelector('.text-size-input');
            const markerColorInput = block.querySelector('.marker-color-input');
            if (textSizeInput) textSizeInput.value = config.textSize;
            if (markerColorInput) markerColorInput.value = config.markerColor;
        } else if (seriesName === TIMING) {
            const markerSizeInput = block.querySelector('.marker-size-input');
            const markerColorInput = block.querySelector('.marker-color-input');
            if (markerSizeInput) markerSizeInput.value = config.markerSize;
            if (markerColorInput) markerColorInput.value = config.markerColor;
        } else if (seriesName === CORRECTS) {
            const markerSizeInput = block.querySelector('.marker-size-input');
            const markerFaceColorInput = block.querySelector('.marker-face-color-input');
            const markerEdgeColorInput = block.querySelector('.marker-edge-color-input');
            if (markerSizeInput) markerSizeInput.value = config.markerSize;
            if (markerFaceColorInput) markerFaceColorInput.value = config.markerFaceColor;
            if (markerEdgeColorInput) markerEdgeColorInput.value = config.markerEdgeColor;
        } else {
            const markerSizeInput = block.querySelector('.marker-size-input');
            const markerSymbolInput = block.querySelector('.marker-symbol-input');
            const markerFaceColorInput = block.querySelector('.marker-face-color-input');
            const markerEdgeColorInput = block.querySelector('.marker-edge-color-input');
            if (markerSizeInput) markerSizeInput.value = config.markerSize;
            if (markerSymbolInput) markerSymbolInput.value = config.markerSymbol;
            if (markerFaceColorInput) markerFaceColorInput.value = config.markerFaceColor;
            if (markerEdgeColorInput) markerEdgeColorInput.value = config.markerEdgeColor;
        }
    });

    updateButtonVisibility(seriesName);
}

function initializeAllSeriesInputs() {
    // Update sum option visibility based on chart type
    updateSumOptionVisibility();
    // Initialize fixed series
    [CORRECTS, ERRORS, TIMING].forEach(initializeSeriesInputs);
    // Initialize dynamic misc series
    getMiscSeriesIds().forEach(initializeSeriesInputs);
}

function applyTraceConfig(seriesName) {
    // Read configuration from all blocks for this series
    const container = document.getElementById(`${seriesName}-blocks-container`);
    if (!container) return;

    const blocks = container.querySelectorAll('.agg-config-block');

    // Check if this is a misc series
    const isMiscSeries = seriesName.startsWith('misc');

    // Clear existing configs and rebuild from blocks
    if (isMiscSeries) {
        chartState.traceStyles.misc[seriesName] = {};
    } else {
        chartState.traceStyles[seriesName] = {};
    }

    blocks.forEach(block => {
        const aggType = block.querySelector('.agg-type-select')?.value || 'raw';

        const config = {
            seriesName: block.querySelector('.series-name-input')?.value || seriesName,
            showLine: block.querySelector('.show-line-input')?.checked ?? true,
            lineWidth: parseFloat(block.querySelector('.line-width-input')?.value) || 0.7,
            lineColor: block.querySelector('.line-color-input')?.value || '#000000'
        };

        // Add series-specific fields
        if (seriesName === ERRORS) {
            config.textSize = parseInt(block.querySelector('.text-size-input')?.value) || 20;
            config.markerColor = block.querySelector('.marker-color-input')?.value || '#000000';
        } else if (seriesName === TIMING) {
            config.markerSize = parseInt(block.querySelector('.marker-size-input')?.value) || 30;
            config.markerColor = block.querySelector('.marker-color-input')?.value || '#000000';
        } else if (seriesName === CORRECTS) {
            config.markerSize = parseInt(block.querySelector('.marker-size-input')?.value) || 8;
            config.markerSymbol = 'circle';
            config.markerFaceColor = block.querySelector('.marker-face-color-input')?.value || '#000000';
            config.markerEdgeColor = block.querySelector('.marker-edge-color-input')?.value || '#000000';
        } else {
            config.markerSize = parseInt(block.querySelector('.marker-size-input')?.value) || 8;
            config.markerSymbol = block.querySelector('.marker-symbol-input')?.value || 'circle';
            config.markerFaceColor = block.querySelector('.marker-face-color-input')?.value || '#000000';
            config.markerEdgeColor = block.querySelector('.marker-edge-color-input')?.value || '#000000';
        }

        // Store this config under its aggregation type
        if (isMiscSeries) {
            chartState.traceStyles.misc[seriesName][aggType] = config;
        } else {
            chartState.traceStyles[seriesName][aggType] = config;
        }
    });

    updateCounterLabels();

    // Update tab button text (for all series, truncated for display)
    const tabButton = document.querySelector(`[data-series-tab="${seriesName}"]`);
    if (tabButton) {
        const rawConfig = isMiscSeries
            ? chartState.traceStyles.misc[seriesName]?.raw
            : chartState.traceStyles[seriesName]?.raw;
        if (rawConfig?.seriesName) {
            tabButton.textContent = truncateTabName(rawConfig.seriesName);
        }
    }

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
    eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);
    createToast({ message: `${seriesName} configurations updated.`, duration: 2000 });
}

function resetTraceConfig(seriesName) {
    // Reset to default "raw" aggregation only
    const defaultsMap = {
        [CORRECTS]: defaultCorrectTraceConfig,
        [ERRORS]: defaultErrorTraceConfig,
        [TIMING]: defaultTimingTraceConfig
    };

    // Check if this is a misc series
    const isMiscSeries = seriesName.startsWith('misc');

    if (isMiscSeries) {
        // Extract the number from miscN and create default config
        const num = parseInt(seriesName.slice(4));
        const index = num - 1;
        chartState.traceStyles.misc[seriesName] = {
            "raw": createMiscTraceConfig(index)
        };
    } else {
        // Reset traceStyles to have only "raw" aggregation
        chartState.traceStyles[seriesName] = {
            "raw": { ...defaultsMap[seriesName] }
        };
    }

    // Remove all blocks except the first one
    const container = document.getElementById(`${seriesName}-blocks-container`);
    if (container) {
        const blocks = Array.from(container.querySelectorAll('.agg-config-block'));
        // Remove all but the first block
        blocks.slice(1).forEach(block => block.remove());
    }

    // Re-initialize the remaining block
    initializeSeriesInputs(seriesName);
    updateCounterLabels();

    // Update tab button text (for all series, truncated for display)
    const tabButton = document.querySelector(`[data-series-tab="${seriesName}"]`);
    if (tabButton) {
        const rawConfig = isMiscSeries
            ? chartState.traceStyles.misc[seriesName]?.raw
            : chartState.traceStyles[seriesName]?.raw;
        if (rawConfig?.seriesName) {
            tabButton.textContent = truncateTabName(rawConfig.seriesName);
        }
    }

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
    eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);
    createToast({ message: `${seriesName} reset to defaults.`, duration: 2000 });
}

function toggleLineWidth(seriesName) {
    // This function is now handled per-block in the event listeners
    // Left as a no-op for compatibility
}

function initializeLineWidthToggles() {
    // Toggle line width inputs for all blocks across all series
    document.querySelectorAll('.agg-config-block').forEach(block => {
        const showLineCheckbox = block.querySelector('.show-line-input');
        const lineWidthInput = block.querySelector('.line-width-input');

        if (showLineCheckbox && lineWidthInput) {
            const lineWidthContainer = lineWidthInput.parentElement;
            const lineWidthLabel = lineWidthContainer?.querySelector('label');

            const updateState = () => {
                lineWidthInput.disabled = !showLineCheckbox.checked;
                if (showLineCheckbox.checked) {
                    lineWidthInput.classList.remove('opacity-50', 'cursor-not-allowed');
                    if (lineWidthLabel) lineWidthLabel.classList.remove('opacity-50');
                } else {
                    lineWidthInput.classList.add('opacity-50', 'cursor-not-allowed');
                    if (lineWidthLabel) lineWidthLabel.classList.add('opacity-50');
                }
            };

            // Initialize state
            updateState();

            // Add event listener
            showLineCheckbox.addEventListener('change', updateState);
        }
    });
}

function switchSeriesTab(seriesName) {
    // Hide all series config panels
    document.querySelectorAll('.series-config-panel').forEach(panel => {
        panel.style.display = 'none';
    });

    // Remove active styling from all series sub-tabs
    document.querySelectorAll('.series-subtab').forEach(button => {
        button.classList.remove('active');
    });

    // Show selected series config panel
    document.getElementById(seriesName + '-series-config').style.display = 'block';

    // Add active styling to selected sub-tab
    const activeButton = document.querySelector(`[data-series-tab="${seriesName}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
}

// ============================================================================
// AGGREGATION BLOCK MANAGEMENT
// ============================================================================

/**
 * Add a new aggregation configuration block for a series
 * @param {string} seriesName - Name of the series (correct, incorrect, timing, misc1, misc2)
 */
function addAggregationBlock(seriesName) {
    const container = document.getElementById(`${seriesName}-blocks-container`);
    if (!container) return;

    // Check if all aggregation types are already in use
    const usedAggs = Array.from(container.querySelectorAll('.agg-config-block .agg-type-select'))
        .map(select => select.value);

    const availableAggs = getAvailableAggTypes();

    // If all aggregation types are used, don't allow adding more blocks
    if (usedAggs.length >= availableAggs.length) {
        return;
    }

    // Get the first block as a template
    const templateBlock = container.querySelector('.agg-config-block');
    if (!templateBlock) return;

    // Clone the template block
    const newBlock = templateBlock.cloneNode(true);

    // Reset the aggregation type to a default unused value
    const aggSelect = newBlock.querySelector('.agg-type-select');
    if (aggSelect) {
        // Find an unused aggregation type
        const unusedAgg = availableAggs.find(agg => !usedAggs.includes(agg));

        if (unusedAgg) {
            aggSelect.value = unusedAgg;
            newBlock.dataset.agg = unusedAgg;
        }
    }

    // Add the new block to the container
    container.appendChild(newBlock);

    // Re-attach line width toggle for the new block's checkbox
    const showLineCheckbox = newBlock.querySelector('.show-line-input');
    if (showLineCheckbox) {
        showLineCheckbox.addEventListener('change', (e) => {
            const seriesName = e.currentTarget.dataset.seriesToggle;
            if (seriesName) {
                toggleLineWidth(seriesName);
            }
        });
    }

    // Update button visibility for both + and - buttons
    updateButtonVisibility(seriesName);
}

/**
 * Update the visibility of add and remove buttons based on available aggregation types
 * @param {string} seriesName - Name of the series
 */
function updateButtonVisibility(seriesName) {
    const container = document.getElementById(`${seriesName}-blocks-container`);
    const addButton = document.querySelector(`.add-block-btn[data-series="${seriesName}"]`);

    if (!container) return;

    const blocks = container.querySelectorAll('.agg-config-block');
    const availableAggs = getAvailableAggTypes();

    // Hide/show the + button based on whether all aggregation types are used
    if (addButton) {
        if (blocks.length >= availableAggs.length) {
            addButton.style.display = 'none';
        } else {
            addButton.style.display = 'flex';
        }
    }

    // Hide/show the - buttons based on whether there's only one block
    blocks.forEach(block => {
        const removeButton = block.querySelector('.remove-block-btn');
        if (removeButton) {
            if (blocks.length <= 1) {
                removeButton.style.display = 'none';
            } else {
                removeButton.style.display = 'flex';
            }
        }
    });
}

/**
 * Remove an aggregation configuration block
 * @param {HTMLElement} block - The block element to remove
 */
function removeAggregationBlock(block) {
    const container = block.parentElement;

    // Don't allow removing the last block (this shouldn't happen since button is hidden)
    const remainingBlocks = container.querySelectorAll('.agg-config-block');
    if (remainingBlocks.length <= 1) {
        return;
    }

    // Get the series name and aggType before removing
    const seriesName = block.dataset.series;
    const aggType = block.dataset.agg;

    // Remove the block from DOM
    block.remove();

    // Remove from chartState
    if (seriesName && aggType) {
        const isMiscSeries = seriesName.startsWith('misc');
        if (isMiscSeries) {
            delete chartState.traceStyles.misc[seriesName][aggType];
        } else {
            delete chartState.traceStyles[seriesName][aggType];
        }
    }

    // Update button visibility
    if (seriesName) {
        updateButtonVisibility(seriesName);
    }

    // Refresh chart
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
    eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);
}

// ============================================================================
// EVENT SUBSCRIPTIONS
// ============================================================================

// For manual "Add Misc Series" button - creates single series
eventBus.subscribe(EVENTS.MISC_SERIES_ADDED, ({ id, index }) => {
    createMiscSeriesTab(id, index);
    updateSumOptionVisibility();
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
}, true);

// Sync misc series UI after import completes
eventBus.subscribe(EVENTS.DATA_IMPORT_COMPLETED, () => {
    syncMiscSeriesUI();
    initializeAllSeriesInputs();
}, true);

/**
 * Sync misc series UI tabs/panels with chartState.series.misc
 * Creates missing tabs, removes orphaned tabs
 */
function syncMiscSeriesUI() {
    const tabContainer = document.getElementById('series-tab-container');
    const panelContainer = document.getElementById('misc-panels-container');
    const template = document.getElementById('misc-series-template');

    if (!tabContainer || !panelContainer || !template) return;

    const miscIdsInState = Object.keys(chartState.series.misc || {});
    const existingTabs = tabContainer.querySelectorAll('[data-series-tab^="misc"]');
    const existingTabIds = Array.from(existingTabs).map(t => t.dataset.seriesTab);

    // Remove tabs that no longer exist in chartState
    for (const tabId of existingTabIds) {
        if (!miscIdsInState.includes(tabId)) {
            document.querySelector(`[data-series-tab="${tabId}"]`)?.remove();
            document.getElementById(`${tabId}-series-config`)?.remove();
        }
    }

    // Create tabs for misc series that don't have UI yet
    for (const id of miscIdsInState) {
        if (!existingTabIds.includes(id)) {
            const num = parseInt(id.slice(4));
            const index = num - 1;
            createMiscSeriesTab(id, index);
        }
    }
}

/**
 * Create a single misc series tab and panel
 */
function createMiscSeriesTab(id, index) {
    const tabContainer = document.getElementById('series-tab-container');
    const panelContainer = document.getElementById('misc-panels-container');
    const template = document.getElementById('misc-series-template');

    if (!tabContainer || !panelContainer || !template) return;

    // Create tab button
    const addBtn = tabContainer.querySelector('[data-action="add-misc-series"]');
    const tabButton = document.createElement('button');
    tabButton.className = 'series-subtab';
    tabButton.dataset.seriesTab = id;
    const config = chartState.traceStyles.misc[id]?.raw;
    tabButton.textContent = truncateTabName(config?.seriesName || `Misc ${index + 1}`);
    tabButton.addEventListener('click', () => switchSeriesTab(id));
    tabContainer.insertBefore(tabButton, addBtn);

    // Clone and configure panel from template
    const panel = template.content.firstElementChild.cloneNode(true);
    panel.id = `${id}-series-config`;

    panel.querySelectorAll('[data-series="misc-template"]').forEach(el => {
        el.dataset.series = id;
    });

    const blocksContainer = panel.querySelector('.misc-blocks-container');
    if (blocksContainer) {
        blocksContainer.id = `${id}-blocks-container`;
    }

    if (config) {
        const nameInput = panel.querySelector('.series-name-input');
        if (nameInput) nameInput.value = config.seriesName;

        const symbolInput = panel.querySelector('.marker-symbol-input');
        if (symbolInput) symbolInput.value = config.markerSymbol;

        const faceColorInput = panel.querySelector('.marker-face-color-input');
        if (faceColorInput) faceColorInput.value = config.markerFaceColor;
    }

    panel.querySelector('.apply-misc-btn')?.addEventListener('click', () => applyTraceConfig(id));
    panel.querySelector('.reset-misc-btn')?.addEventListener('click', () => resetTraceConfig(id));
    panel.querySelector('.delete-misc-btn')?.addEventListener('click', () => {
        import('./miscSeries.js').then(({ removeMiscSeries }) => {
            removeMiscSeries(id);
        });
    });
    panel.querySelector('.add-block-btn')?.addEventListener('click', () => addAggregationBlock(id));
    panel.querySelectorAll('.remove-block-btn').forEach(btn => {
        btn.addEventListener('click', (e) => removeAggregationBlock(e.target.closest('.agg-config-block')));
    });

    panelContainer.appendChild(panel);
    updateButtonVisibility(id);
}

// Sync UI with chartState after chart loads from storage
eventBus.subscribe(EVENTS.STORAGE_CHART_LOADED, () => {
    syncMiscSeriesUI();
    initializeAllSeriesInputs();
}, true);

eventBus.subscribe(EVENTS.MISC_SERIES_REMOVED, ({ id }) => {
    // Remove tab button
    const tabButton = document.querySelector(`[data-series-tab="${id}"]`);
    if (tabButton) tabButton.remove();

    // Remove config panel
    const panel = document.getElementById(`${id}-series-config`);
    if (panel) panel.remove();

    // Switch to correct tab if needed
    const activePanel = document.querySelector('.series-config-panel[style*="display: block"]');
    if (!activePanel) switchSeriesTab(CORRECTS);

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
}, true);

// ============================================================================
// EXPORTS
// ============================================================================

export {
    initializeAllSeriesInputs,
    applyTraceConfig,
    resetTraceConfig,
    switchSeriesTab,
    toggleLineWidth,
    initializeLineWidthToggles,
    addAggregationBlock,
    updateButtonVisibility,
    removeAggregationBlock,
    getAvailableAggTypes,
    updateSumOptionVisibility
};