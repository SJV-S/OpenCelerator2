
function resizeYearlyChartByHeight(chartJson, containerHeight) {
    const isMobile = window.innerWidth <= 768 ||
                     (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);

    const spacingFactor = isMobile ? 0.98 : 0.92;
    const height = containerHeight * spacingFactor;

    const margin = chartJson.layout.margin;
    // Yearly.py lines 29-30 (minute_type=True)
    const y = {min: 0.001 * 0.69, max: 1000};
    const xmax = Math.round(chartJson.layout.xaxis.range[1]);
    const deg = 34;
    // Yearly.py line 48
    const unit = 5;
    const yaxis_px = height - (margin.t + margin.b);
    const y_axis = Math.log10(y.max) - Math.log10(y.min);
    const delta_y = Math.log10(2 ** (xmax / unit));
    const delta_y_px = (delta_y / y_axis) * yaxis_px;
    const xaxis_px = delta_y_px / Math.tan((deg * Math.PI) / 180);
    const width = xaxis_px + (margin.l + margin.r);

    chartJson.layout.height = height;
    chartJson.layout.width = width;

    // Scaling factors (base height 675)
    const generalFontScale = height * 0.017;
    const titleFontScale = height * 0.025;

    // Yearly.py lines 396-399
    // year_label_pixel_offset = 35 -> 35 / 11.475 = 3.05
    // decade_count_pixel_offset = 68 -> 68 / 11.475 = 5.93
    // top_x_title_pixel_offset = 115 -> 115 / 16.875 = 6.81
    // bottom_x_title_pixel_offset = 75 -> 75 / 16.875 = 4.44
    const yearLabelPixelOffset = generalFontScale * 3.05;
    const decadeCountPixelOffset = generalFontScale * 5.93;
    const topXTitlePixelOffset = titleFontScale * 6.81;
    const bottomXTitlePixelOffset = titleFontScale * 4.44;
    const xTicksDown = 36;

    // Universally scale annotations
    chartJson.layout.annotations.forEach(annotation => {
        annotation.font.size = generalFontScale;
    });

    // Axes
    chartJson.layout.xaxis.ticklabelstandoff = Math.round(height / xTicksDown);
    chartJson.layout.yaxis.title.font.size = titleFontScale;
    chartJson.layout.yaxis.tickfont.size = generalFontScale * 1.5;
    chartJson.layout.xaxis.tickfont.size = generalFontScale * 1.5;
    if (chartJson.layout.yaxis2?.tickfont?.size) {
        chartJson.layout.yaxis2.tickfont.size = generalFontScale;
    }

    // Scaling specific annotations (Yearly.py names)
    chartJson.layout.annotations.forEach(annotation => {
        if (annotation.name && annotation.name.startsWith("year-label")) {
            // Year labels (2020, 2030...) - Yearly.py line 464-474
            annotation.y = 1 + (yearLabelPixelOffset / yaxis_px);
            annotation.font.size = generalFontScale * 0.75;
        } else if (annotation.name === "decade-count") {
            // Decade count (0, 5, 10) - Yearly.py line 442-452
            annotation.y = 1 + (decadeCountPixelOffset / yaxis_px);
        } else if (annotation.name === "top_x_title") {
            // "SUCCESSIVE CALENDAR DECADES" - Yearly.py line 427-437
            annotation.font.size = titleFontScale;
            annotation.y = 1 + (topXTitlePixelOffset / yaxis_px);
        } else if (annotation.name === "bottom_x_title") {
            // "SUCCESSIVE CALENDAR YEARS" - Yearly.py line 414-424
            annotation.font.size = titleFontScale;
            annotation.y = 0 - (bottomXTitlePixelOffset / yaxis_px);
        } else if (annotation.name === 'minor-left-y') {
            annotation.font.size = generalFontScale;
        }
    });

    // Scaling lines and ticks
    const px_right_n_left_y_tick_len = 6;
    const paper_right_n_left_y_tick_len = px_right_n_left_y_tick_len / xaxis_px;
    // Yearly.py lines 339-340
    const full_tick_height = 55 / yaxis_px;
    const half_tick_height = 30 / yaxis_px;

    chartJson.layout.shapes.forEach(shape => {
        if (shape.name) {
            if (shape.name === "left-y-tick") {
                shape.x1 = -paper_right_n_left_y_tick_len;
            } else if (shape.name === "right-y-tick") {
                shape.x1 = 1 + paper_right_n_left_y_tick_len;
            } else if (shape.name === "top-spine") {
                shape.x0 = -paper_right_n_left_y_tick_len;
            } else if (shape.name === "top-x-tick") {
                // Yearly has variable tick heights - decade boundaries are taller
                // Check x position to determine if it's a decade boundary
                const xPos = shape.x0;
                if (xPos % 10 === 0) {
                    shape.y0 = 1 + full_tick_height;
                } else {
                    shape.y0 = 1 + half_tick_height;
                }
            }
        }
    });

    return chartJson;
}

export { resizeYearlyChartByHeight };
