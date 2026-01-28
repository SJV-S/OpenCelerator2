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
import { getMiscSeriesIds } from './miscSeries.js';
import { createToast } from '../util/toaster.js';
import { eventBus, EVENTS } from '../eventBus.js';

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

    document.getElementById('correct-series-label').textContent = getFirstConfig('correct').seriesName;
    document.getElementById('incorrect-series-label').textContent = getFirstConfig('incorrect').seriesName;
    document.getElementById('timing-series-label').textContent = getFirstConfig('timing').seriesName;

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

    // Get all existing blocks
    const blocks = Array.from(container.querySelectorAll('.agg-config-block'));

    // For each aggregation type in the config, ensure there's a block
    Object.entries(aggConfigs).forEach(([aggType, config], index) => {
        let block = blocks[index];

        // If we need more blocks than exist, we'll just use the first block for now
        // The user can add more blocks manually
        if (!block) return;

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
        if (seriesName === 'incorrect') {
            const textSizeInput = block.querySelector('.text-size-input');
            const markerColorInput = block.querySelector('.marker-color-input');
            if (textSizeInput) textSizeInput.value = config.textSize;
            if (markerColorInput) markerColorInput.value = config.markerColor;
        } else if (seriesName === 'timing') {
            const markerSizeInput = block.querySelector('.marker-size-input');
            const markerColorInput = block.querySelector('.marker-color-input');
            if (markerSizeInput) markerSizeInput.value = config.markerSize;
            if (markerColorInput) markerColorInput.value = config.markerColor;
        } else if (seriesName === 'correct') {
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
}

function initializeAllSeriesInputs() {
    // Initialize fixed series
    ['correct', 'incorrect', 'timing'].forEach(initializeSeriesInputs);
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
        if (seriesName === 'incorrect') {
            config.textSize = parseInt(block.querySelector('.text-size-input')?.value) || 20;
            config.markerColor = block.querySelector('.marker-color-input')?.value || '#000000';
        } else if (seriesName === 'timing') {
            config.markerSize = parseInt(block.querySelector('.marker-size-input')?.value) || 30;
            config.markerColor = block.querySelector('.marker-color-input')?.value || '#000000';
        } else if (seriesName === 'correct') {
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

    // Update tab button text for misc series
    if (isMiscSeries) {
        const tabButton = document.querySelector(`[data-series-tab="${seriesName}"]`);
        const rawConfig = chartState.traceStyles.misc[seriesName]?.raw;
        if (tabButton && rawConfig?.seriesName) {
            tabButton.textContent = rawConfig.seriesName;
        }
    }

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
    createToast({ message: `${seriesName} configurations updated.`, duration: 2000 });
}

function resetTraceConfig(seriesName) {
    // Reset to default "raw" aggregation only
    const defaultsMap = {
        correct: defaultCorrectTraceConfig,
        incorrect: defaultErrorTraceConfig,
        timing: defaultTimingTraceConfig
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

    // Update tab button text for misc series
    if (isMiscSeries) {
        const tabButton = document.querySelector(`[data-series-tab="${seriesName}"]`);
        const rawConfig = chartState.traceStyles.misc[seriesName]?.raw;
        if (tabButton && rawConfig?.seriesName) {
            tabButton.textContent = rawConfig.seriesName;
        }
    }

    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
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

function switchSeriesTab(seriesName, aggType) {
    // Hide all series config panels
    document.querySelectorAll('.series-agg-panel').forEach(panel => {
        panel.classList.add('hidden');
    });

    // Remove active styling from all series sub-tabs
    document.querySelectorAll('.series-subtab').forEach(button => {
        button.classList.remove('active');
    });

    // Show selected series config panel
    const panelId = `${seriesName}-${aggType}-config`;
    const panel = document.getElementById(panelId);
    if (panel) {
        panel.classList.remove('hidden');
    }

    // Add active styling to selected sub-tab
    const activeButton = document.querySelector(`.series-subtab[data-series="${seriesName}"][data-agg="${aggType}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
}

// ============================================================================
// AGGREGATION MANAGEMENT (Flat Menu Approach)
// ============================================================================

const AVAILABLE_AGGS = ['raw', 'mean', 'median', 'min', 'max', 'first', 'last'];
const CORE_SERIES = ['correct', 'incorrect', 'timing'];

/**
 * Get aggregation types already in use for a series
 */
function getUsedAggregations(seriesName) {
    const buttons = document.querySelectorAll(`.series-subtab[data-series="${seriesName}"]`);
    return Array.from(buttons).map(btn => btn.dataset.agg).filter(Boolean);
}

/**
 * Add a new aggregation for a series
 */
function addAggregation(seriesName, aggType) {
    // Check if this combination already exists
    const existing = document.querySelector(`.series-subtab[data-series="${seriesName}"][data-agg="${aggType}"]`);
    if (existing) {
        createToast({ message: `${seriesName} (${aggType}) already exists.`, duration: 3000 });
        return;
    }

    // Get the template for this series type
    const template = document.getElementById(`${seriesName}-agg-template`);
    if (!template) {
        createToast({ message: `No template found for ${seriesName}.`, duration: 3000 });
        return;
    }

    // Create new menu button
    const tabContainer = document.getElementById('series-tab-container');
    const addButton = tabContainer.querySelector('[data-action="add-aggregation"]');

    const newTab = document.createElement('button');
    newTab.className = 'series-subtab';
    newTab.dataset.series = seriesName;
    newTab.dataset.agg = aggType;
    newTab.textContent = `${seriesName.charAt(0).toUpperCase() + seriesName.slice(1)} (${aggType})`;

    // Insert before the + button
    tabContainer.insertBefore(newTab, addButton);

    // Clone panel from template
    const panelClone = template.content.cloneNode(true);
    const newPanel = panelClone.querySelector('.series-agg-panel');
    newPanel.id = `${seriesName}-${aggType}-config`;
    newPanel.dataset.agg = aggType;
    newPanel.querySelector('.series-name-input').value = `${seriesName} (${aggType})`;

    // Add panel to container
    document.getElementById('dynamic-agg-panels').appendChild(newPanel);

    // Add click handler for new tab
    newTab.addEventListener('click', () => {
        switchSeriesTab(seriesName, aggType);
    });

    // Add delete handler for new panel
    const deleteBtn = newPanel.querySelector('[data-action="delete-agg"]');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            deleteAggregation(seriesName, aggType);
        });
    }

    // Switch to the new tab
    switchSeriesTab(seriesName, aggType);
}

/**
 * Delete an aggregation
 */
function deleteAggregation(seriesName, aggType) {
    // Don't allow deleting the last aggregation for a core series
    const usedAggs = getUsedAggregations(seriesName);
    if (CORE_SERIES.includes(seriesName) && usedAggs.length <= 1) {
        createToast({ message: `Cannot delete the last aggregation for ${seriesName}.`, duration: 3000 });
        return;
    }

    // Remove the tab
    const tab = document.querySelector(`.series-subtab[data-series="${seriesName}"][data-agg="${aggType}"]`);
    if (tab) tab.remove();

    // Remove the panel
    const panel = document.getElementById(`${seriesName}-${aggType}-config`);
    if (panel) panel.remove();

    // Switch to another tab
    const remainingTab = document.querySelector('.series-subtab[data-series][data-agg]');
    if (remainingTab) {
        switchSeriesTab(remainingTab.dataset.series, remainingTab.dataset.agg);
    }
}

/**
 * Show dialog to add new aggregation
 */
function showAddAggregationDialog() {
    // Build options for series
    const seriesOptions = CORE_SERIES.map(s => ({
        value: s,
        label: s.charAt(0).toUpperCase() + s.slice(1)
    }));

    // For simplicity, use a prompt-based approach
    // In production, use a proper modal dialog
    const seriesChoice = prompt('Enter series (correct, incorrect, timing):');
    if (!seriesChoice || !CORE_SERIES.includes(seriesChoice.toLowerCase())) {
        if (seriesChoice) createToast({ message: 'Invalid series name.', duration: 3000 });
        return;
    }

    const usedAggs = getUsedAggregations(seriesChoice.toLowerCase());
    const availableAggs = AVAILABLE_AGGS.filter(a => !usedAggs.includes(a));

    if (availableAggs.length === 0) {
        createToast({ message: `All aggregation types already exist for ${seriesChoice}.`, duration: 3000 });
        return;
    }

    const aggChoice = prompt(`Enter aggregation type (${availableAggs.join(', ')}):`);
    if (!aggChoice || !availableAggs.includes(aggChoice.toLowerCase())) {
        if (aggChoice) createToast({ message: 'Invalid or already used aggregation type.', duration: 3000 });
        return;
    }

    addAggregation(seriesChoice.toLowerCase(), aggChoice.toLowerCase());
}

// ============================================================================
// EVENT SUBSCRIPTIONS
// ============================================================================

eventBus.subscribe(EVENTS.MISC_SERIES_ADDED, ({ id, index }) => {
    // Misc series feature disabled - needs rework for flat menu approach
    // TODO: Implement misc series with the new aggregation-per-menu-item structure
    console.log('Misc series added:', id, index);
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
    eventBus.emit(EVENTS.UI_LEGEND_RENDER);
}, true);

eventBus.subscribe(EVENTS.MISC_SERIES_REMOVED, ({ id }) => {
    // Misc series feature disabled - needs rework for flat menu approach
    console.log('Misc series removed:', id);
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
    addAggregation,
    deleteAggregation,
    showAddAggregationDialog
};