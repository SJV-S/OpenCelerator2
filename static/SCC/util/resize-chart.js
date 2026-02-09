/**
 * Unified chart resize module
 * Handles responsive scaling for all chart types: Daily, Weekly, Monthly, Yearly, FrequencyCollections
 * Also handles margin expansion for celeration fan
 */

import { MOBILE_BREAKPOINT, CHART_MATH, LAYOUT, CHART_TYPE_CONFIG, RESIZE } from '../config.js';
import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';

/**
 * Check if current viewport is mobile-sized
 */
function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * Resize chart based on container dimensions
 * @param {Object} chartJson - Plotly chart data/layout object
 * @param {number} containerWidth - Width of the container element
 * @param {number} containerHeight - Height of the container element
 * @param {string} chartType - Type of chart (Daily, Weekly, Monthly, Yearly, FrequencyCollections)
 * @param {Object} options - Additional options
 * @param {boolean} options.fanVisible - Whether celeration fan will be shown
 * @param {boolean} options.isMinuteChart - Whether this is a minute chart (affects fan position)
 * @returns {Object} Modified chartJson with updated dimensions
 */
function resizeChartByHeight(chartJson, containerWidth, containerHeight, chartType = 'Daily', options = {}) {
    const { fanVisible = false, isMinuteChart = false } = options;

    const config = CHART_TYPE_CONFIG[chartType];
    if (!config) {
        console.warn(`Unknown chart type: ${chartType}, defaulting to Daily`);
        return resizeChartByHeight(chartJson, containerWidth, containerHeight, 'Daily', options);
    }

    // Use configured multiplier of container height for padding
    const height = containerHeight * LAYOUT.CHART_HEIGHT_MULTIPLIER;

    const margin = chartJson.layout.margin;

    // === PEELING: Calculate and apply new xmax based on viewport ===
    const originalXmax = Math.round(chartJson.layout.xaxis.range[1]);

    // Calculate what xmax fits the viewport (using pre-margin-adjustment values)
    const peelHeight = containerHeight * LAYOUT.CHART_PEEL_MULTIPLIER;
    const peelYaxisPx = peelHeight - (margin.t + margin.b);
    const peelXaxisPx = containerWidth - (margin.l + margin.r);
    const yAxisRange = Math.log10(config.yMax) - Math.log10(config.yMin);
    const deg = CHART_MATH.ANGLE_DEGREES;
    const deltaYPx = peelXaxisPx * Math.tan(deg * Math.PI / 180);
    const deltaY = (deltaYPx / peelYaxisPx) * yAxisRange;
    let newXmax = Math.floor(config.unit * deltaY / Math.log10(2));

    // Snap to configured breakpoints (e.g., multiples of 14 for Daily)
    if (config.snapTo) {
        newXmax = Math.floor(newXmax / config.snapTo) * config.snapTo;
    }

    // Clamp to min/max bounds
    newXmax = Math.max(newXmax, config.minXmax || config.snapTo);
    newXmax = Math.min(newXmax, originalXmax);

    // Use saved chartWindow for loaded charts
    if (chartState.id) {
        newXmax = chartState.chartWindow;
    }

    // Move right spine from originalXmax to newXmax
    chartJson.layout.shapes.forEach(shape => {
        if (shape.name === 'spine' && Math.round(shape.x0) === originalXmax) {
            shape.x0 = newXmax;
            shape.x1 = newXmax;
        }
    });

    // Set new x-axis range
    chartJson.layout.xaxis.range = [-0.2, newXmax + 0.2];
    // === END PEELING ===

    // Expand margin for celeration fan (must happen before width calculation)
    if (fanVisible && !isMobile()) {
        // Minute charts need more space (fan on left with labels extending outward)
        const fanMultiplier = isMinuteChart
            ? (config.fanMarginMinute ?? 0.10)
            : (config.fanMarginCount ?? 0.07);
        const fanMargin = height * fanMultiplier;
        if (isMinuteChart) {
            margin.l += fanMargin;
        } else {
            margin.r += fanMargin;
        }
    }

    // Expand bottom margin for credit information
    const creditMargin = height * (config.creditMarginMultiplier ?? 0.10);
    margin.b += creditMargin;

    // Expand top margin
    const topMargin = height * (config.topMarginMultiplier ?? 0);
    margin.t += topMargin;

    const y = { min: config.yMin, max: config.yMax };
    const xmax = newXmax;  // Use peeled xmax for remaining calculations
    const yaxis_px = height - (margin.t + margin.b);
    const y_axis = Math.log10(y.max) - Math.log10(y.min);
    const delta_y = Math.log10(2 ** (xmax / config.unit));
    const delta_y_px = (delta_y / y_axis) * yaxis_px;
    const xaxis_px = delta_y_px / Math.tan((deg * Math.PI) / 180);
    const width = xaxis_px + (margin.l + margin.r);

    // Set new chart size dimensions
    chartJson.layout.height = height;
    chartJson.layout.width = width;

    // Scaling factors
    const generalFontScale = height * RESIZE.GENERAL_FONT_SCALE;
    const titleFontScale = height * RESIZE.TITLE_FONT_SCALE;
    const xTicksDown = RESIZE.X_TICKS_DOWN;

    // Universally scale annotations
    chartJson.layout.annotations.forEach(annotation => {
        annotation.font.size = generalFontScale;
    });

    // Axes scaling
    chartJson.layout.xaxis.ticklabelstandoff = Math.round(height / xTicksDown);
    chartJson.layout.yaxis.title.font.size = titleFontScale;
    // Reposition y-axis title vertically for minute charts (convert to annotation for vertical control)
    if (isMinuteChart && config.yAxisTitlePositionMinute !== undefined && chartJson.layout.yaxis.title?.text) {
        const titleText = chartJson.layout.yaxis.title.text;
        const titleFont = chartJson.layout.yaxis.title.font || {};

        chartJson.layout.yaxis.title.text = '';

        chartJson.layout.annotations.push({
            name: 'yaxis-title',
            text: titleText,
            xref: 'paper',
            yref: 'paper',
            x: -(height * config.yAxisTitleXOffsetMultiplier / xaxis_px),
            y: config.yAxisTitlePositionMinute,
            xanchor: 'center',
            yanchor: 'middle',
            showarrow: false,
            textangle: -90,
            font: {
                size: titleFont.size || titleFontScale,
                family: titleFont.family,
                color: titleFont.color,
                weight: titleFont.weight
            }
        });
    }
    chartJson.layout.yaxis.tickfont.size = generalFontScale * RESIZE.TICK_FONT_SCALE;
    if (chartJson.layout.xaxis?.tickfont?.size) {
        chartJson.layout.xaxis.tickfont.size = generalFontScale * RESIZE.TICK_FONT_SCALE;
    }
    if (chartJson.layout.yaxis2?.tickfont?.size) {
        chartJson.layout.yaxis2.tickfont.size = generalFontScale;
    }

    // Scale specific annotations based on config
    chartJson.layout.annotations.forEach(annotation => {
        // Reposition "COUNTING TIMES" annotation (Daily chart, right y-axis label)
        // Must check before the name guard since this annotation has no name
        if (annotation.text === 'COUNTING TIMES') {
            annotation.name = 'counting-times';
            annotation.x = 1 + (height * config.countingTimesXOffsetMultiplier / xaxis_px);
        }

        if (!annotation.name) return;

        // On mobile, hide top_x_title (e.g., "SUCCESSIVE CALENDAR DAYS")
        if (isMobile() && annotation.name === 'top_x_title') {
            annotation.visible = false;
            return;
        }

        // Check each configured annotation pattern
        for (const [pattern, settings] of Object.entries(config.annotations)) {
            const matches = settings.prefix
                ? annotation.name.startsWith(pattern)
                : annotation.name === pattern;

            if (matches) {
                // Calculate offset
                const baseScale = settings.useTitle ? titleFontScale : generalFontScale;
                const pixelOffset = baseScale * settings.offsetMultiplier;

                // Set font size
                if (settings.fontScale) {
                    annotation.font.size = (settings.useTitle ? titleFontScale : generalFontScale) * settings.fontScale;
                } else if (settings.useTitle) {
                    annotation.font.size = titleFontScale;
                }

                // Set y position unless skipped
                if (!settings.skipPosition && settings.offsetMultiplier) {
                    if (settings.yDirection === 'below') {
                        annotation.y = 0 - (pixelOffset / yaxis_px);
                    } else {
                        annotation.y = 1 + (pixelOffset / yaxis_px);
                    }
                }
                break;
            }
        }

        // Handle minor-left-y (common to all chart types)
        if (annotation.name === 'minor-left-y') {
            annotation.font.size = generalFontScale;
        }
    });

    // Scale shapes
    const px_y_tick_len = RESIZE.Y_TICK_LENGTH_PX;
    const paper_y_tick_len = px_y_tick_len / xaxis_px;

    chartJson.layout.shapes.forEach(shape => {
        if (!shape.name) return;

        // Common y-tick handling
        if (shape.name === 'left-y-tick') {
            shape.x1 = -paper_y_tick_len;
        } else if (shape.name === 'right-y-tick' && !config.shapes.noRightYTick) {
            shape.x1 = 1 + paper_y_tick_len;
        } else if (shape.name === 'top-spine') {
            shape.x0 = -paper_y_tick_len;
        }

        // Chart-specific shape handling
        if (config.shapes.hasDateLine && shape.name === 'date-line') {
            // Daily chart date lines
            const dateLineOffset = generalFontScale * config.shapes.dateLineOffsetMultiplier;
            const px_date_line_len = dateLineOffset * RESIZE.DATE_LINE_LEN_SCALE;
            const paper_date_line_len = px_date_line_len / xaxis_px;

            shape.y0 = 1 + (dateLineOffset / yaxis_px);
            shape.y1 = 1 + (dateLineOffset / yaxis_px);

            const middle = shape.x0 / xmax;
            shape.x0 = middle + paper_date_line_len;
            shape.x1 = middle - paper_date_line_len;
        }

        if (shape.name === 'top-x-tick') {
            if (config.shapes.useDecadeTicks) {
                // Yearly chart: variable tick heights for decade boundaries
                const fullHeight = (generalFontScale * config.shapes.topXTickFullMultiplier) / yaxis_px;
                const halfHeight = (generalFontScale * config.shapes.topXTickHalfMultiplier) / yaxis_px;
                const xPos = shape.x0;
                shape.y0 = 1 + (xPos % 10 === 0 ? fullHeight : halfHeight);
            } else if (config.shapes.hasTopXTick) {
                // Weekly/Monthly: uniform tick height
                const tickHeight = (generalFontScale * config.shapes.topXTickMultiplier) / yaxis_px;
                shape.y0 = 1 + tickHeight;
            }
        }
    });

    return chartJson;
}

/**
 * Emit event to reposition the fan after resize or chart window change.
 * Position calculation is handled by generateFanElements() using layout dimensions.
 */
function emitFanReposition() {
    eventBus.emit(EVENTS.FAN_REPOSITION);
}

/**
 * Rescale all template chart elements after a dimension change.
 * Mirrors the scaling logic in resizeChartByHeight but operates on a live chart
 * via surgical Plotly.relayout with indexed property updates.
 *
 * Skips runtime-managed elements (credits, fan, phase/aim/cel lines).
 *
 * @param {HTMLElement} chartDiv - The Plotly chart DOM element
 */
function rescaleChartElements(chartDiv) {
    if (!chartDiv?.layout) return;

    const config = CHART_TYPE_CONFIG[chartState.chartType];
    if (!config) return;

    const { margin, width, height } = chartDiv.layout;
    const xaxis_px = width - margin.l - margin.r;
    const yaxis_px = height - margin.t - margin.b;

    // Scaling factors (same math as resizeChartByHeight)
    const generalFontScale = height * RESIZE.GENERAL_FONT_SCALE;
    const titleFontScale = height * RESIZE.TITLE_FONT_SCALE;

    const updates = {};

    // --- Axes ---
    updates['xaxis.ticklabelstandoff'] = Math.round(height / RESIZE.X_TICKS_DOWN);
    updates['yaxis.title.font.size'] = titleFontScale;
    updates['yaxis.tickfont.size'] = generalFontScale * RESIZE.TICK_FONT_SCALE;
    if (chartDiv.layout.xaxis?.tickfont?.size !== undefined) {
        updates['xaxis.tickfont.size'] = generalFontScale * RESIZE.TICK_FONT_SCALE;
    }
    if (chartDiv.layout.yaxis2?.tickfont?.size !== undefined) {
        updates['yaxis2.tickfont.size'] = generalFontScale;
    }

    // --- Annotations ---
    // Skip runtime-managed annotations (credits, fan, user-drawn lines)
    const SKIP_PREFIXES = ['credit-', 'fan-', 'phase-', 'aim-', 'cel-'];

    (chartDiv.layout.annotations || []).forEach((ann, i) => {
        if (ann.name && SKIP_PREFIXES.some(p => ann.name.startsWith(p))) return;

        // Universal font scaling for template annotations
        updates[`annotations[${i}].font.size`] = generalFontScale;

        // Special: counting-times x-position (depends on xaxis_px)
        if (ann.name === 'counting-times') {
            updates[`annotations[${i}].x`] = 1 + (height * config.countingTimesXOffsetMultiplier / xaxis_px);
        }

        // Special: yaxis-title x-position (depends on xaxis_px)
        if (ann.name === 'yaxis-title') {
            updates[`annotations[${i}].x`] = -(height * config.yAxisTitleXOffsetMultiplier / xaxis_px);
        }

        if (!ann.name) return;

        // On mobile, hide top_x_title
        if (isMobile() && ann.name === 'top_x_title') {
            updates[`annotations[${i}].visible`] = false;
            return;
        }

        // Config-pattern annotations: font size and y-position
        for (const [pattern, settings] of Object.entries(config.annotations)) {
            const matches = settings.prefix
                ? ann.name.startsWith(pattern)
                : ann.name === pattern;

            if (matches) {
                const baseScale = settings.useTitle ? titleFontScale : generalFontScale;
                const pixelOffset = baseScale * settings.offsetMultiplier;

                if (settings.fontScale) {
                    updates[`annotations[${i}].font.size`] = (settings.useTitle ? titleFontScale : generalFontScale) * settings.fontScale;
                } else if (settings.useTitle) {
                    updates[`annotations[${i}].font.size`] = titleFontScale;
                }

                if (!settings.skipPosition && settings.offsetMultiplier) {
                    if (settings.yDirection === 'below') {
                        updates[`annotations[${i}].y`] = 0 - (pixelOffset / yaxis_px);
                    } else {
                        updates[`annotations[${i}].y`] = 1 + (pixelOffset / yaxis_px);
                    }
                }
                break;
            }
        }
    });

    // --- Shapes ---
    const paper_y_tick_len = RESIZE.Y_TICK_LENGTH_PX / xaxis_px;

    (chartDiv.layout.shapes || []).forEach((shape, i) => {
        if (!shape.name) return;

        // Y-tick and spine scaling (paper x-coordinates depend on xaxis_px)
        if (shape.name === 'left-y-tick') {
            updates[`shapes[${i}].x1`] = -paper_y_tick_len;
        } else if (shape.name === 'right-y-tick' && !config.shapes.noRightYTick) {
            updates[`shapes[${i}].x1`] = 1 + paper_y_tick_len;
        } else if (shape.name === 'top-spine') {
            updates[`shapes[${i}].x0`] = -paper_y_tick_len;
        }

        // Date-line shapes (Daily chart)
        if (config.shapes.hasDateLine && shape.name === 'date-line') {
            const dateLineOffset = generalFontScale * config.shapes.dateLineOffsetMultiplier;
            const px_date_line_len = dateLineOffset * RESIZE.DATE_LINE_LEN_SCALE;
            const paper_date_line_len = px_date_line_len / xaxis_px;

            updates[`shapes[${i}].y0`] = 1 + (dateLineOffset / yaxis_px);
            updates[`shapes[${i}].y1`] = 1 + (dateLineOffset / yaxis_px);

            // Recover original center from symmetrically-offset x0/x1
            const middle = (shape.x0 + shape.x1) / 2;
            updates[`shapes[${i}].x0`] = middle + paper_date_line_len;
            updates[`shapes[${i}].x1`] = middle - paper_date_line_len;
        }

        // Top x-axis tick shapes
        if (shape.name === 'top-x-tick') {
            if (config.shapes.useDecadeTicks) {
                const fullHeight = (generalFontScale * config.shapes.topXTickFullMultiplier) / yaxis_px;
                const halfHeight = (generalFontScale * config.shapes.topXTickHalfMultiplier) / yaxis_px;
                const xPos = shape.x0;
                updates[`shapes[${i}].y0`] = 1 + (xPos % 10 === 0 ? fullHeight : halfHeight);
            } else if (config.shapes.hasTopXTick) {
                const tickHeight = (generalFontScale * config.shapes.topXTickMultiplier) / yaxis_px;
                updates[`shapes[${i}].y0`] = 1 + tickHeight;
            }
        }
    });

    if (Object.keys(updates).length) {
        Plotly.relayout(chartDiv, updates);
    }
}

export { resizeChartByHeight, emitFanReposition, rescaleChartElements };
