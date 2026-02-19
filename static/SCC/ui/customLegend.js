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
import { CORRECTS, ERRORS, TIMING, WINDOW_UNITS } from '../config.js';
import { icons } from './icons.js';
import { createToast } from './toaster.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { restyle } from '../util/plotlyWrapper.js';
import { getChartDiv } from '../util/dom.js';
import { getAggLabel } from '../series/traceStyles.js';

/** Escape a value for safe interpolation into an XML/SVG attribute. */
const escAttr = v => String(v).replace(/[&"'<>]/g, c => ({'&':'&amp;','"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;'}[c]));

// Series visibility is stored in chartState.seriesVisibility (persisted via IndexedDB)

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

        Object.entries(aggConfigs).forEach(([aggId, config]) => {
            const uniqueKey = `${seriesKey}_${aggId}`;

            if (chartState.seriesVisibility[uniqueKey] === undefined) {
                chartState.seriesVisibility[uniqueKey] = true;
            }

            items.push({
                seriesKey: uniqueKey,
                displayName: config.seriesName,
                visible: chartState.seriesVisibility[uniqueKey],
                config: config,
                baseSeriesKey: seriesKey,
                aggId: aggId,
                onXAgg: config.onXAgg || 'raw',
                acrossXAgg: config.acrossXAgg || null
            });
        });
    });

    // Process dynamic misc series
    Object.entries(chartState.traceStyles.misc).forEach(([miscId, aggConfigs]) => {
        // Skip if no integer data
        const dataArray = chartState.series.misc[miscId];
        const hasIntegerData = dataArray && dataArray.some(val => Number.isFinite(val));
        if (!hasIntegerData) return;

        Object.entries(aggConfigs).forEach(([aggId, config]) => {
            const uniqueKey = `${miscId}_${aggId}`;

            if (chartState.seriesVisibility[uniqueKey] === undefined) {
                chartState.seriesVisibility[uniqueKey] = true;
            }

            items.push({
                seriesKey: uniqueKey,
                displayName: config.seriesName,
                visible: chartState.seriesVisibility[uniqueKey],
                config: config,
                baseSeriesKey: miscId,
                aggId: aggId,
                onXAgg: config.onXAgg || 'raw',
                acrossXAgg: config.acrossXAgg || null
            });
        });
    });

    return items;
}

/**
 * Map Plotly lineDash names to SVG stroke-dasharray values
 */
const DASH_MAP = {
    'solid': '',
    'dash': '6,3',
    'dot': '2,3',
    'dashdot': '6,3,2,3',
    'longdash': '10,5',
    'longdashdot': '10,5,2,5'
};

/**
 * Get the appropriate SVG swatch for a legend item.
 * Draws a horizontal line behind the marker when config.showLine is true,
 * matching Plotly's built-in legend style.
 * @param {string} seriesKey - Series identifier (correct, incorrect, timing, misc1, misc2)
 * @param {Object} config - Trace configuration object
 * @param {number} scale - Scale factor for sizing
 * @returns {string} SVG string
 */
function getMarkerSVG(seriesKey, config, scale = 1) {
    const hasLine = config.showLine;
    const isTextMarker = seriesKey === ERRORS || seriesKey === TIMING;
    const hasMarker = isTextMarker || config.markerSymbol !== 'none';

    const vbWidth = 40;
    const cy = 10;
    const cx = 20; // marker center

    let inner = '';

    // 1. Line (drawn first = rendered behind marker; transparent when showLine is off)
    const dashArray = DASH_MAP[config.lineDash] || '';
    const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : '';
    const lw = Math.max(config.lineWidth || 1, 1);
    const lineColor = hasLine ? escAttr(config.lineColor) : 'transparent';
    inner += `<line x1="5" y1="${cy}" x2="${vbWidth - 5}" y2="${cy}" stroke="${lineColor}" stroke-width="${lw}"${dashAttr}/>`;

    // 2. Marker (drawn second = rendered on top)
    if (hasMarker) {
        if (seriesKey === ERRORS) {
            const fs = Math.min(Math.round((config.markerSize || 20) * scale), 18);
            inner += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-family="Arial" fill="${escAttr(config.markerColor)}">X</text>`;
        } else if (seriesKey === TIMING) {
            const fs = Math.min(Math.round((config.markerSize || 20) * scale), 18);
            inner += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-family="Arial" fill="${escAttr(config.markerColor)}">−</text>`;
        } else {
            const r = Math.min(Math.round((config.markerSize || 8) * scale) / 2, 9);
            const fill = escAttr(config.markerColor);
            const stroke = escAttr(config.markerEdgeColor);
            switch (config.markerSymbol) {
                case 'square':
                    inner += `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
                    break;
                case 'triangle-up':
                    inner += `<polygon points="${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
                    break;
                case 'diamond':
                    inner += `<polygon points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
                    break;
                default: // circle
                    inner += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
                    break;
            }
        }
    }

    // Fallback: neither line nor marker (shouldn't happen, but safety net)
    if (!inner) {
        inner = `<line x1="4" y1="${cy}" x2="16" y2="${cy}" stroke="gray" stroke-width="2"/>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbWidth} 20" width="${vbWidth}" height="20">${inner}</svg>`;
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

    // Create label with aggregation suffix
    const label = document.createElement('span');
    let aggSuffix = '';
    const onX = item.onXAgg || 'raw';
    const acrossX = item.acrossXAgg;
    if (onX !== 'raw' || acrossX) {
        const parts = [];
        if (onX !== 'raw') parts.push(onX.charAt(0).toUpperCase() + onX.slice(1));
        if (acrossX) {
            const unit = WINDOW_UNITS[chartState.chartType]?.abbrev || 'x';
            parts.push(`${acrossX.fn.charAt(0).toUpperCase() + acrossX.fn.slice(1)} ${unit}${acrossX.window}`);
        }
        aggSuffix = ` (${parts.join(', ')})`;
    }
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
        { key: 'aim', label: 'Count markers', icon: icons.aimDiagonal(scaledIconSize, false) },
        { key: 'phase', label: 'Event markers', icon: icons.phaseTextTop(scaledIconSize, false) },
        { key: 'change', label: 'Trendlines', icon: icons.scatterLine(scaledIconSize) },
        { key: 'grid', label: 'Grid', icon: icons.grid(scaledIconSize) }
    ];

    lineTypes.forEach(lineType => {
        const item = document.createElement('div');
        item.className = 'legend-item legend-line-item';
        item.dataset.lineType = lineType.key;

        // Apply scaled styles
        item.style.gap = `${Math.round(4 * scale)}px`;
        item.style.padding = `${Math.round(2 * scale)}px ${Math.round(4 * scale)}px`;

        const isVisible = lineType.key === 'grid'
            ? (chartState.lineVisibility.grid.dateLines || chartState.lineVisibility.grid.countLines || chartState.lineVisibility.grid.minorGrid)
            : chartState.lineVisibility[lineType.key];
        if (!isVisible) {
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
    // Grid is an object with three states — legend flips all at once
    if (lineType === 'grid') {
        const g = chartState.lineVisibility.grid;
        const anyOn = g.dateLines || g.countLines || g.minorGrid;
        const newState = !anyOn;
        g.dateLines = newState;
        g.countLines = newState;
        g.minorGrid = newState;

        const legendItem = document.querySelector(`.legend-line-item[data-line-type="grid"]`);
        if (legendItem) {
            legendItem.classList.toggle('legend-item-hidden', !newState);
        }

        setTimeout(() => eventBus.emit(EVENTS.CHART_GRID_VISIBILITY_CHANGED, { visible: newState }), 0);
        return;
    }

    chartState.lineVisibility[lineType] = !chartState.lineVisibility[lineType];

    // Update UI
    const legendItem = document.querySelector(`.legend-line-item[data-line-type="${lineType}"]`);
    if (legendItem) {
        legendItem.classList.toggle('legend-item-hidden', !chartState.lineVisibility[lineType]);
    }

    // Emit event for line modules to handle visibility
    eventBus.emit(EVENTS.LINE_VISIBILITY_CHANGED, { lineType, visible: chartState.lineVisibility[lineType] });
}

/**
 * Calculate scale factor based on chart height
 * @returns {number} Scale factor (1.0 = baseline at ~900px height)
 */
function getScaleFactor() {
    const chartDiv = getChartDiv();
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
    const chartDiv = getChartDiv();
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
    container.style.gap = `${Math.round(2 * scale)}px`;
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

    // Re-apply hidden series after render (survives replot)
    Object.entries(chartState.seriesVisibility).forEach(([key, visible]) => {
        if (!visible) {
            updatePlotlyTraceVisibility(key, false);
        }
    });
}

/**
 * Toggle visibility for a series
 * @param {string} seriesKey - Unique series identifier (series_aggId)
 */
function toggleSeriesVisibility(seriesKey) {
    // Toggle visibility state for THIS specific series_aggId combination
    chartState.seriesVisibility[seriesKey] = !chartState.seriesVisibility[seriesKey];

    // Update legend item styling for this specific item only
    const legendItem = document.querySelector(`.legend-item[data-series-key="${seriesKey}"]`);
    if (legendItem) {
        if (chartState.seriesVisibility[seriesKey]) {
            legendItem.classList.remove('legend-item-hidden');
        } else {
            legendItem.classList.add('legend-item-hidden');
        }
    }

    // Tell Plotly to hide/show traces for this specific series_aggId
    updatePlotlyTraceVisibility(seriesKey, chartState.seriesVisibility[seriesKey]);

    // Emit event so state is persisted
    eventBus.emit(EVENTS.SERIES_VISIBILITY_CHANGED, { seriesKey, visible: chartState.seriesVisibility[seriesKey] });
}

/**
 * Update Plotly trace visibility (one-way command to Plotly)
 * @param {string} seriesKey - Unique series identifier (series_aggId)
 * @param {boolean} visible - Whether the series should be visible
 */
function updatePlotlyTraceVisibility(seriesKey, visible) {
    const chartDiv = getChartDiv();
    if (!chartDiv) return;

    // Parse the unique key (e.g., "corrects_0" -> baseKey="corrects", aggId="0")
    const underscoreIdx = seriesKey.lastIndexOf('_');
    const baseKey = seriesKey.slice(0, underscoreIdx);
    const aggId = seriesKey.slice(underscoreIdx + 1);

    // baseKey is: 'corrects', 'errors', 'timing', or misc ID
    const targetSeriesName = baseKey;
    const traceIndices = [];

    // Find all traces for this specific series AND aggregation ID
    chartDiv.data.forEach((trace, idx) => {
        if (trace.meta &&
            trace.meta.seriesName === targetSeriesName &&
            trace.meta.aggId === aggId) {
            traceIndices.push(idx);
        }
    });

    // Command Plotly to update visibility
    if (traceIndices.length > 0) {
        restyle(chartDiv, { visible: visible }, traceIndices);
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

    // Notify bus (triggers auto-save for this preference change)
    eventBus.emit(EVENTS.UI_LEGEND_VISIBILITY_CHANGED, { visible });
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

    // When a line drawing mode activates, ensure that line type is visible
    const modeToLineType = {
        [EVENTS.MODE_PHASE_ACTIVATE]: { key: 'phase', label: 'Event markers' },
        [EVENTS.MODE_AIM_ACTIVATE]:   { key: 'aim',   label: 'Count markers' },
        [EVENTS.MODE_CEL_ACTIVATE]:   { key: 'change', label: 'Trendlines' }
    };

    for (const [event, { key, label }] of Object.entries(modeToLineType)) {
        eventBus.subscribe(event, () => {
            if (chartState.lineVisibility[key]) return;

            chartState.lineVisibility[key] = true;

            const legendItem = document.querySelector(`.legend-line-item[data-line-type="${key}"]`);
            if (legendItem) legendItem.classList.remove('legend-item-hidden');

            eventBus.emit(EVENTS.LINE_VISIBILITY_CHANGED, { lineType: key, visible: true });

            createToast({ message: `${label} are now visible`, duration: 3000 });
        });
    }
}

export { renderCustomLegend, toggleLegend, init };