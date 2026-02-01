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
import { CORRECTS, ERRORS, TIMING } from '../config.js';
import { icons } from '../util/icons.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { toggleGrid } from './grid.js';

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

    // Process fixed series (corrects, errors, timing)
    [CORRECTS, ERRORS, TIMING].forEach(seriesKey => {
        // Timing only shows on minute charts
        if (seriesKey === TIMING && !chartState.minuteChart) return;

        // Skip if no data for this series (NaN values don't count as data)
        const dataArray = chartState.series[seriesKey];
        const hasData = dataArray && dataArray.some(val => Number.isFinite(val));
        if (!hasData) return;

        const aggConfigs = chartState.traceStyles[seriesKey];
        if (!aggConfigs) return;

        Object.entries(aggConfigs).forEach(([aggType, config]) => {
            const uniqueKey = `${seriesKey}_${aggType}`;

            if (visibilityState[uniqueKey] === undefined) {
                visibilityState[uniqueKey] = true;
            }

            items.push({
                seriesKey: uniqueKey,
                displayName: config.seriesName,
                visible: visibilityState[uniqueKey],
                config: config,
                baseSeriesKey: seriesKey,
                aggType: aggType
            });
        });
    });

    // Process dynamic misc series
    Object.entries(chartState.traceStyles.misc).forEach(([miscId, aggConfigs]) => {
        // Skip if no integer data
        const dataArray = chartState.series.misc[miscId];
        const hasIntegerData = dataArray && dataArray.some(val => Number.isInteger(val));
        if (!hasIntegerData) return;

        Object.entries(aggConfigs).forEach(([aggType, config]) => {
            const uniqueKey = `${miscId}_${aggType}`;

            if (visibilityState[uniqueKey] === undefined) {
                visibilityState[uniqueKey] = true;
            }

            items.push({
                seriesKey: uniqueKey,
                displayName: config.seriesName,
                visible: visibilityState[uniqueKey],
                config: config,
                baseSeriesKey: miscId,
                aggType: aggType
            });
        });
    });

    return items;
}

/**
 * Get the appropriate SVG marker for a series
 * @param {string} seriesKey - Series identifier (correct, incorrect, timing, misc1, misc2)
 * @param {Object} config - Trace configuration object
 * @param {number} scale - Scale factor for sizing
 * @returns {string} SVG string
 */
function getMarkerSVG(seriesKey, config, scale = 1) {
    const baseSize = 20;
    const scaledSize = Math.round(baseSize * scale);

    if (seriesKey === ERRORS) {
        return icons.markerX(scaledSize, config.markerColor);
    } else if (seriesKey === TIMING) {
        return icons.markerDash(scaledSize, config.markerColor);
    } else {
        // Map Plotly symbol names to icon functions
        const symbolMap = {
            'circle': icons.markerCircle,
            'square': icons.markerSquare,
            'triangle-up': icons.markerTriangle,
            'diamond': icons.markerDiamond
        };

        const iconFn = symbolMap[config.markerSymbol] || icons.markerCircle;
        return iconFn(Math.round((config.markerSize || baseSize) * scale), config.markerFaceColor, config.markerEdgeColor);
    }
}

/**
 * Create a legend item DOM element
 * @param {Object} item - Legend item object
 * @param {number} scale - Scale factor for sizing
 * @returns {HTMLElement} Legend item div
 */
function createLegendItem(item, scale = 1) {
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.dataset.seriesKey = item.seriesKey;

    // Apply scaled styles
    div.style.gap = `${Math.round(4 * scale)}px`;
    div.style.padding = `${Math.round(2 * scale)}px ${Math.round(4 * scale)}px`;

    // Create marker container
    const markerContainer = document.createElement('span');
    markerContainer.className = 'legend-marker';
    markerContainer.innerHTML = getMarkerSVG(item.baseSeriesKey, item.config, scale);

    // Create label
    const label = document.createElement('span');
    const aggSuffix = item.aggType && item.aggType !== 'raw' ? ` (${item.aggType})` : '';
    label.textContent = item.displayName + aggSuffix;
    label.className = 'legend-label';
    label.style.fontSize = `${Math.round(14 * scale)}px`;

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
 * @param {number} scale - Scale factor for sizing
 * @returns {HTMLElement} Lines section container
 */
function createLinesSection(scale = 1) {
    const section = document.createElement('div');
    section.className = 'legend-lines-section';
    section.style.gap = `${Math.round(2 * scale)}px`;

    const scaledIconSize = Math.round(20 * scale);

    // Line type items - use main icons with scaled size and showText=false
    const lineTypes = [
        { key: 'aim', label: 'Aim', icon: icons.aimDiagonal(scaledIconSize, false) },
        { key: 'phase', label: 'Phase', icon: icons.phaseTextTop(scaledIconSize, false) },
        { key: 'change', label: 'Change', icon: icons.scatterLine(scaledIconSize) },
        { key: 'grid', label: 'Grid', icon: icons.grid(scaledIconSize) }
    ];

    lineTypes.forEach(lineType => {
        const item = document.createElement('div');
        item.className = 'legend-item legend-line-item';
        item.dataset.lineType = lineType.key;

        // Apply scaled styles
        item.style.gap = `${Math.round(4 * scale)}px`;
        item.style.padding = `${Math.round(2 * scale)}px ${Math.round(4 * scale)}px`;

        if (!chartState.lineVisibility[lineType.key]) {
            item.classList.add('legend-item-hidden');
        }

        const markerContainer = document.createElement('span');
        markerContainer.className = 'legend-marker';
        markerContainer.innerHTML = lineType.icon;

        const label = document.createElement('span');
        label.className = 'legend-label';
        label.textContent = lineType.label;
        label.style.fontSize = `${Math.round(14 * scale)}px`;

        item.appendChild(markerContainer);
        item.appendChild(label);

        // Click handler to toggle visibility (UI only for now)
        item.addEventListener('click', () => toggleLineVisibility(lineType.key));

        section.appendChild(item);
    });

    return section;
}

/**
 * Toggle visibility for a line type (phase, aim, change, grid)
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

    // Handle grid specially - call toggleGrid directly
    if (lineType === 'grid') {
        toggleGrid(chartState.lineVisibility[lineType]);
        eventBus.emit(EVENTS.CHART_GRID_VISIBILITY_CHANGED, { visible: chartState.lineVisibility[lineType] });
        return;
    }

    // Emit event for line modules to handle visibility
    eventBus.emit(EVENTS.LINE_VISIBILITY_CHANGED, { lineType, visible: chartState.lineVisibility[lineType] });
}

/**
 * Calculate scale factor based on chart height
 * @returns {number} Scale factor (1.0 = baseline at ~900px height)
 */
function getScaleFactor() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv?._fullLayout) return 1;

    const height = chartDiv._fullLayout.height;
    const baseHeight = 900;
    const ratio = height / baseHeight;
    // Gentle scaling with square root to dampen effect
    return Math.max(0.5, Math.min(1.1, Math.sqrt(ratio)));
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

    // Calculate scale factor based on chart height
    const scale = getScaleFactor();

    // Apply scaled CSS custom properties
    container.style.setProperty('--legend-scale', scale);
    container.style.gap = `${Math.round(4 * scale)}px`;
    container.style.padding = `${Math.round(6 * scale)}px`;

    items.forEach(item => {
        container.appendChild(createLegendItem(item, scale));
    });

    // Add collapsible lines section (hidden by default, shows on hover/tap)
    container.appendChild(createLinesSection(scale));


    // Move legend inside chart div (which has position: relative)
    if (container.parentElement !== chartDiv) {
        chartDiv.appendChild(container);
    }

    // Position legend at the chart's plot area corners
    const position = chartState.legend.position;

    // Get the actual plot area bounding box from Plotly
    if (chartDiv._fullLayout) {
        const layout = chartDiv._fullLayout;

        // Plot area corners in pixels (relative to chart div)
        const plotLeft = layout.margin.l;
        const plotRight = layout.width - layout.margin.r;
        const plotTop = layout.margin.t;
        const plotBottom = layout.height - layout.margin.b;

        container.style.position = 'absolute';

        // Position legend at plot area corners with scaled offset
        const offset = Math.round(8 * scale);

        if (position === 'top-right') {
            container.style.top = (plotTop + offset) + 'px';
            container.style.left = (plotRight - container.offsetWidth - offset) + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        } else if (position === 'top-left') {
            container.style.top = (plotTop + offset) + 'px';
            container.style.left = (plotLeft + offset) + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        } else if (position === 'bottom-right') {
            container.style.top = (plotBottom - container.offsetHeight - offset) + 'px';
            container.style.left = (plotRight - container.offsetWidth - offset) + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        } else if (position === 'bottom-left') {
            container.style.top = (plotBottom - container.offsetHeight - offset) + 'px';
            container.style.left = (plotLeft + offset) + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
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

    // Parse the unique key (e.g., "corrects_mean" -> baseKey="corrects", aggType="mean")
    const parts = seriesKey.split('_');
    const baseKey = parts[0];
    const aggType = parts[1];

    // baseKey is now consistent: 'corrects', 'errors', 'timing', or misc ID
    const targetSeriesName = baseKey;
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
    // Attach touch handler once (not in renderCustomLegend to avoid duplicates)
    const container = document.getElementById('custom-legend');
    if (container) {
        container.addEventListener('touchstart', () => {
            container.classList.toggle('touched');
        }, { passive: true });
    }

    // Subscribe to legend render events
    eventBus.subscribe(EVENTS.UI_LEGEND_RENDER, () => {
        renderCustomLegend();
    });
}

export { renderCustomLegend, visibilityState, toggleLegend, init };