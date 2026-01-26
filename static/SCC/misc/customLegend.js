/**
 * Custom Legend Module
 *
 * Renders a custom HTML/SVG legend completely independent of Plotly's legend system.
 * - Reads only from chartState.traceStyles (never touches Plotly traces)
 * - Dynamically generates legend items based on current trace configurations
 * - Handles visibility toggling via click events
 * - Uses icons.js for all marker rendering
 */

import { chartState } from '../chartState.js';
import { icons } from '../util/icons.js';
import { eventBus, EVENTS } from '../eventBus.js';

// Visibility state tracked independently from Plotly
// Each unique series_aggType combination has its own visibility state
const visibilityState = {};

// Line visibility now stored in chartState.lineVisibility

/**
 * Generate legend items from chartState.traceStyles
 * @returns {Array} Array of legend item objects
 */
function getLegendItems() {
    const items = [];

    Object.entries(chartState.traceStyles).forEach(([seriesKey, aggConfigs]) => {
        // Skip misc1 and misc2 if they have no integer data
        if (seriesKey === 'misc1' || seriesKey === 'misc2') {
            const dataArray = chartState.series[seriesKey];
            // Check if there's at least one integer value
            const hasIntegerData = dataArray && dataArray.some(val => Number.isInteger(val));
            if (!hasIntegerData) {
                return; // Skip this series
            }
        }

        // Create a legend item for EACH aggregation config
        Object.entries(aggConfigs).forEach(([aggType, config]) => {
            const uniqueKey = `${seriesKey}_${aggType}`;

            // Initialize visibility state if not present
            if (visibilityState[uniqueKey] === undefined) {
                visibilityState[uniqueKey] = true;
            }

            items.push({
                seriesKey: uniqueKey,
                displayName: config.seriesName,
                visible: visibilityState[uniqueKey],
                config: config,
                baseSeriesKey: seriesKey
            });
        });
    });

    return items;
}

/**
 * Get the appropriate SVG marker for a series
 * @param {string} seriesKey - Series identifier (correct, incorrect, timing, misc1, misc2)
 * @param {Object} config - Trace configuration object
 * @returns {string} SVG string
 */
function getMarkerSVG(seriesKey, config) {
    if (seriesKey === 'incorrect') {
        return icons.markerX(config.textSize || 20, config.markerColor);
    } else if (seriesKey === 'timing') {
        return icons.markerDash(config.markerSize || 20, config.markerColor);
    } else {
        // Map Plotly symbol names to icon functions
        const symbolMap = {
            'circle': icons.markerCircle,
            'square': icons.markerSquare,
            'triangle-up': icons.markerTriangle,
            'diamond': icons.markerDiamond
        };

        const iconFn = symbolMap[config.markerSymbol] || icons.markerCircle;
        return iconFn(config.markerSize, config.markerFaceColor, config.markerEdgeColor);
    }
}

/**
 * Create a legend item DOM element
 * @param {Object} item - Legend item object
 * @returns {HTMLElement} Legend item div
 */
function createLegendItem(item) {
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.dataset.seriesKey = item.seriesKey;

    // Create marker container
    const markerContainer = document.createElement('span');
    markerContainer.className = 'legend-marker';
    markerContainer.innerHTML = getMarkerSVG(item.baseSeriesKey, item.config);

    // Create label
    const label = document.createElement('span');
    label.textContent = item.displayName;
    label.className = 'legend-label';

    div.appendChild(markerContainer);
    div.appendChild(label);

    // Click handler to toggle visibility
    div.addEventListener('click', () => toggleSeriesVisibility(item.seriesKey));

    // Apply hidden styling if not visible
    if (!item.visible) {
        div.classList.add('legend-item-hidden');
    }

    return div;
}

/**
 * Create the collapsible lines section for the legend
 * Shows on hover/tap of the legend
 * @returns {HTMLElement} Lines section container
 */
function createLinesSection() {
    const section = document.createElement('div');
    section.className = 'legend-lines-section';

    // Line type items - use main icons with size=20 and showText=false
    const lineTypes = [
        { key: 'aim', label: 'Aim', icon: icons.aimDiagonal(20, false) },
        { key: 'phase', label: 'Phase', icon: icons.phaseTextTop(20, false) },
        { key: 'change', label: 'Change', icon: icons.otherCeleration(20) }
    ];

    lineTypes.forEach(lineType => {
        const item = document.createElement('div');
        item.className = 'legend-item legend-line-item';
        item.dataset.lineType = lineType.key;

        if (!chartState.lineVisibility[lineType.key]) {
            item.classList.add('legend-item-hidden');
        }

        const markerContainer = document.createElement('span');
        markerContainer.className = 'legend-marker';
        markerContainer.innerHTML = lineType.icon;

        const label = document.createElement('span');
        label.className = 'legend-label';
        label.textContent = lineType.label;

        item.appendChild(markerContainer);
        item.appendChild(label);

        // Click handler to toggle visibility (UI only for now)
        item.addEventListener('click', () => toggleLineVisibility(lineType.key));

        section.appendChild(item);
    });

    return section;
}

/**
 * Toggle visibility for a line type (phase, aim, change)
 * @param {string} lineType - Line type identifier
 */
function toggleLineVisibility(lineType) {
    chartState.lineVisibility[lineType] = !chartState.lineVisibility[lineType];

    // Update UI
    const legendItem = document.querySelector(`.legend-line-item[data-line-type="${lineType}"]`);
    if (legendItem) {
        if (chartState.lineVisibility[lineType]) {
            legendItem.classList.remove('legend-item-hidden');
        } else {
            legendItem.classList.add('legend-item-hidden');
        }
    }

    // Emit event for line modules to handle visibility
    eventBus.emit(EVENTS.LINE_VISIBILITY_CHANGED, { lineType, visible: chartState.lineVisibility[lineType] });
}

/**
 * Render the complete custom legend
 * Clears existing legend and rebuilds from current chartState
 */
function renderCustomLegend() {
    const container = document.getElementById('custom-legend');
    const chartDiv = document.getElementById('chart');
    if (!container || !chartDiv) return;

    const items = getLegendItems();

    // Clear container and hide if no items
    if (items.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.innerHTML = '';
    container.style.display = 'flex';

    items.forEach(item => {
        container.appendChild(createLegendItem(item));
    });

    // Add collapsible lines section (hidden by default, shows on hover/tap)
    container.appendChild(createLinesSection());

    // Add touch handling to show lines section on tap
    container.addEventListener('touchstart', () => {
        container.classList.toggle('touched');
    }, { passive: true });

    // Move legend inside chart div (which has position: relative)
    if (container.parentElement !== chartDiv) {
        chartDiv.appendChild(container);
    }

    // Position legend based on chartState using pixel coordinates from plotly layout
    const position = chartState.legend.position;

    // Get Plotly layout coordinates
    if (chartDiv._fullLayout && chartDiv._fullLayout.xaxis && chartDiv._fullLayout.yaxis) {
        const layout = chartDiv._fullLayout;
        const plotArea = {
            left: layout.margin.l,
            right: layout.width - layout.margin.r,
            top: layout.margin.t,
            bottom: layout.height - layout.margin.b
        };

        // Position based on setting - anchor top-right corner of legend to plot area corner
        container.style.position = 'absolute';

        if (position === 'top-right') {
            container.style.top = plotArea.top + 'px';
            container.style.right = (layout.width - plotArea.right) + 'px';
            container.style.left = 'auto';
            container.style.bottom = 'auto';
        } else if (position === 'top-left') {
            container.style.top = plotArea.top + 'px';
            container.style.left = plotArea.left + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        } else if (position === 'bottom-right') {
            container.style.bottom = (layout.height - plotArea.bottom) + 'px';
            container.style.right = (layout.width - plotArea.right) + 'px';
            container.style.left = 'auto';
            container.style.top = 'auto';
        } else if (position === 'bottom-left') {
            container.style.bottom = (layout.height - plotArea.bottom) + 'px';
            container.style.left = plotArea.left + 'px';
            container.style.right = 'auto';
            container.style.top = 'auto';
        }
    }

    // Apply visibility based on chartState.legend.show
    container.style.display = chartState.legend.show ? 'flex' : 'none';
}

/**
 * Toggle visibility for a series
 * @param {string} seriesKey - Unique series identifier (series_aggType)
 */
function toggleSeriesVisibility(seriesKey) {
    // Toggle visibility state for THIS specific series_aggType combination
    visibilityState[seriesKey] = !visibilityState[seriesKey];

    // Update legend item styling for this specific item only
    const legendItem = document.querySelector(`.legend-item[data-series-key="${seriesKey}"]`);
    if (legendItem) {
        if (visibilityState[seriesKey]) {
            legendItem.classList.remove('legend-item-hidden');
        } else {
            legendItem.classList.add('legend-item-hidden');
        }
    }

    // Tell Plotly to hide/show traces for this specific series_aggType
    updatePlotlyTraceVisibility(seriesKey, visibilityState[seriesKey]);
}

/**
 * Update Plotly trace visibility (one-way command to Plotly)
 * @param {string} seriesKey - Unique series identifier (series_aggType)
 * @param {boolean} visible - Whether the series should be visible
 */
function updatePlotlyTraceVisibility(seriesKey, visible) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    // Parse the unique key (e.g., "correct_mean" -> baseKey="correct", aggType="mean")
    const parts = seriesKey.split('_');
    const baseKey = parts[0];
    const aggType = parts[1];

    // Map base seriesKey to trace meta seriesName
    const seriesNameMap = {
        'correct': 'corrects',
        'incorrect': 'errors',
        'timing': 'timing',
        'misc1': 'misc1',
        'misc2': 'misc2'
    };

    const targetSeriesName = seriesNameMap[baseKey];
    const traceIndices = [];

    // Find all traces for this specific series AND aggregation type
    chartDiv.data.forEach((trace, idx) => {
        if (trace.meta &&
            trace.meta.seriesName === targetSeriesName &&
            trace.meta.aggType === aggType) {
            traceIndices.push(idx);
        }
    });

    // Command Plotly to update visibility
    if (traceIndices.length > 0) {
        Plotly.restyle(chartDiv, { visible: visible }, traceIndices);
    }
}

/**
 * Toggle the legend visibility on/off
 * @param {boolean} visible - Whether the legend should be visible
 */
function toggleLegend(visible) {
    const container = document.getElementById('custom-legend');
    if (!container) return;

    // Update chartState
    chartState.legend.show = visible;

    // Set visibility
    if (visible) {
        // Re-render the legend when turning it on
        renderCustomLegend();
    } else {
        // Clear and hide when turning it off
        container.innerHTML = '';
        container.style.display = 'none';
    }

    // Enable/disable the position dropdown
    const legendPosition = document.getElementById('legend-position');
    if (legendPosition) {
        legendPosition.disabled = !visible;
    }
}

/**
 * Initialize subscriptions for this module
 * Called by main.js coordinator
 */
function init() {
    // Subscribe to legend render events
    eventBus.subscribe(EVENTS.UI_LEGEND_RENDER, () => {
        renderCustomLegend();
    });
}

export { renderCustomLegend, visibilityState, toggleLegend, init };