/**
 * Unified chart resize module
 * Handles responsive scaling for all chart types: Daily, Weekly, Monthly, Yearly, FrequencyCollections
 * Also handles margin expansion for celeration fan
 */

const MOBILE_BREAKPOINT = 768;

/**
 * Check if current viewport is mobile-sized
 */
function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
}

// Chart-specific configuration
const CHART_CONFIG = {
    Daily: {
        yMin: 1 * 0.69,
        yMax: 1000000,
        unit: 7,
        annotations: {
            'date-text': { offsetMultiplier: 4, useGeneral: true },
            'week-count': { offsetMultiplier: 2.0833, useGeneral: true },
            'top_x_title': { offsetMultiplier: 5.2, useTitle: true, yDirection: 'above' },
            'bottom_x_title': { offsetMultiplier: 4.1666, useTitle: true, yDirection: 'below' }
        },
        shapes: {
            hasDateLine: true,
            dateLineOffsetMultiplier: 2.4305
        }
    },
    Weekly: {
        yMin: 0.001 * 0.69,
        yMax: 1000,
        unit: 4,
        annotations: {
            'month-label': { offsetMultiplier: 3.05, useGeneral: true, fontScale: 0.85, prefix: true },
            'month-count': { offsetMultiplier: 5.93, useGeneral: true },
            'top_x_title': { offsetMultiplier: 5.93, useTitle: true, yDirection: 'above' },
            'bottom_x_title': { offsetMultiplier: 4.44, useTitle: true, yDirection: 'below' }
        },
        shapes: {
            hasTopXTick: true,
            topXTickHeight: 55
        }
    },
    Monthly: {
        yMin: 0.001 * 0.69,
        yMax: 1000,
        unit: 5,
        annotations: {
            'year-label': { offsetMultiplier: 2.61, useGeneral: true, fontScale: 0.85, prefix: true },
            'year-count': { offsetMultiplier: 5.05, useGeneral: true },
            'top_x_title': { offsetMultiplier: 5.93, useTitle: true, yDirection: 'above' },
            'bottom_x_title': { offsetMultiplier: 4.44, useTitle: true, yDirection: 'below' }
        },
        shapes: {
            hasTopXTick: true,
            topXTickHeight: 45
        }
    },
    Yearly: {
        yMin: 0.001 * 0.69,
        yMax: 1000,
        unit: 5,
        annotations: {
            'year-label': { offsetMultiplier: 3.05, useGeneral: true, fontScale: 0.75, prefix: true },
            'decade-count': { offsetMultiplier: 5.93, useGeneral: true },
            'top_x_title': { offsetMultiplier: 6.81, useTitle: true, yDirection: 'above' },
            'bottom_x_title': { offsetMultiplier: 4.44, useTitle: true, yDirection: 'below' }
        },
        shapes: {
            hasTopXTick: true,
            topXTickFullHeight: 55,
            topXTickHalfHeight: 30,
            useDecadeTicks: true
        }
    },
    FrequencyCollections: {
        yMin: 0.001 * 0.69,
        yMax: 1000,
        unit: 7,
        annotations: {
            'blank-line': { offsetMultiplier: 3.05, useGeneral: true, fontScale: 0.75, prefix: true, yDirection: 'below' },
            'counted-label': { offsetMultiplier: 4.79, useGeneral: true, fontScale: 0.75, prefix: true, yDirection: 'below' },
            'chart_title': { fontScale: 1.2, useTitle: true, skipPosition: true }
        },
        shapes: {
            noRightYTick: true
        }
    }
};

/**
 * Resize chart based on container height
 * @param {Object} chartJson - Plotly chart data/layout object
 * @param {number} containerHeight - Height of the container element
 * @param {string} chartType - Type of chart (Daily, Weekly, Monthly, Yearly, FrequencyCollections)
 * @param {Object} options - Additional options
 * @param {boolean} options.fanVisible - Whether celeration fan will be shown
 * @param {boolean} options.isMinuteChart - Whether this is a minute chart (affects fan position)
 * @returns {Object} Modified chartJson with updated dimensions
 */
function resizeChartByHeight(chartJson, containerHeight, chartType = 'Daily', options = {}) {
    const { fanVisible = false, isMinuteChart = false } = options;

    const config = CHART_CONFIG[chartType];
    if (!config) {
        console.warn(`Unknown chart type: ${chartType}, defaulting to Daily`);
        return resizeChartByHeight(chartJson, containerHeight, 'Daily', options);
    }

    // Use 98% of container height for padding
    const height = containerHeight * 0.98;

    const margin = chartJson.layout.margin;

    // Expand margin for celeration fan (must happen before width calculation)
    if (fanVisible && !isMobile()) {
        // Minute charts need more space (fan on left with labels extending outward)
        const fanMargin = isMinuteChart ? height * 0.10 : height * 0.07;
        if (isMinuteChart) {
            margin.l += fanMargin;
        } else {
            margin.r += fanMargin;
        }
    }

    // Expand bottom margin for credit information
    const creditMargin = height * 0.10;
    margin.b += creditMargin;

    const y = { min: config.yMin, max: config.yMax };
    const xmax = Math.round(chartJson.layout.xaxis.range[1]);
    const deg = 34; // Desired angle of doubling in degrees
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
    const generalFontScale = height * 0.017;
    const titleFontScale = height * 0.025;
    const xTicksDown = 36;

    // Universally scale annotations
    chartJson.layout.annotations.forEach(annotation => {
        annotation.font.size = generalFontScale;
    });

    // Axes scaling
    chartJson.layout.xaxis.ticklabelstandoff = Math.round(height / xTicksDown);
    chartJson.layout.yaxis.title.font.size = titleFontScale;
    chartJson.layout.yaxis.tickfont.size = generalFontScale * 1.5;
    if (chartJson.layout.xaxis?.tickfont?.size) {
        chartJson.layout.xaxis.tickfont.size = generalFontScale * 1.5;
    }
    if (chartJson.layout.yaxis2?.tickfont?.size) {
        chartJson.layout.yaxis2.tickfont.size = generalFontScale;
    }

    // Scale specific annotations based on config
    chartJson.layout.annotations.forEach(annotation => {
        if (!annotation.name) return;

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
    const px_y_tick_len = 6;
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
            const px_date_line_len = dateLineOffset * 0.8;
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
                const fullHeight = config.shapes.topXTickFullHeight / yaxis_px;
                const halfHeight = config.shapes.topXTickHalfHeight / yaxis_px;
                const xPos = shape.x0;
                shape.y0 = 1 + (xPos % 10 === 0 ? fullHeight : halfHeight);
            } else if (config.shapes.hasTopXTick) {
                // Weekly/Monthly: uniform tick height
                const tickHeight = config.shapes.topXTickHeight / yaxis_px;
                shape.y0 = 1 + tickHeight;
            }
        }
    });

    return chartJson;
}

export { resizeChartByHeight, CHART_CONFIG };
