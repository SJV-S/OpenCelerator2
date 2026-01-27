
function resizeMonthlyChartByHeight(chartJson, containerHeight) {
    const isMobile = window.innerWidth <= 768 ||
                     (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);

    const spacingFactor = isMobile ? 0.98 : 0.92;
    const height = containerHeight * spacingFactor;

    const margin = chartJson.layout.margin;
    // Monthly.py lines 29-30 (minute_type=True)
    const y = {min: 0.001 * 0.69, max: 1000};
    const xmax = Math.round(chartJson.layout.xaxis.range[1]);
    const deg = 34;
    // Monthly.py line 48
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

    // Monthly.py lines 394-397
    // year_label_pixel_offset = 30 -> 30 / 11.475 = 2.61
    // year_count_pixel_offset = 58 -> 58 / 11.475 = 5.05
    // top_x_title_pixel_offset = 100 -> 100 / 16.875 = 5.93
    // bottom_x_title_pixel_offset = 75 -> 75 / 16.875 = 4.44
    const yearLabelPixelOffset = generalFontScale * 2.61;
    const yearCountPixelOffset = generalFontScale * 5.05;
    const topXTitlePixelOffset = titleFontScale * 5.93;
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

    // Scaling specific annotations (Monthly.py names)
    chartJson.layout.annotations.forEach(annotation => {
        if (annotation.name && annotation.name.startsWith("year-label")) {
            // Year labels (25, 26, 27...) - Monthly.py line 464-474
            annotation.y = 1 + (yearLabelPixelOffset / yaxis_px);
            annotation.font.size = generalFontScale * 0.85;
        } else if (annotation.name === "year-count") {
            // Year count (0, 1, 2, 3...) - Monthly.py line 441-451
            annotation.y = 1 + (yearCountPixelOffset / yaxis_px);
        } else if (annotation.name === "top_x_title") {
            // "SUCCESSIVE CALENDAR YEARS" - Monthly.py line 425-435
            annotation.font.size = titleFontScale;
            annotation.y = 1 + (topXTitlePixelOffset / yaxis_px);
        } else if (annotation.name === "bottom_x_title") {
            // "SUCCESSIVE CALENDAR MONTHS" - Monthly.py line 412-422
            annotation.font.size = titleFontScale;
            annotation.y = 0 - (bottomXTitlePixelOffset / yaxis_px);
        } else if (annotation.name === 'minor-left-y') {
            annotation.font.size = generalFontScale;
        }
    });

    // Scaling lines and ticks
    const px_right_n_left_y_tick_len = 6;
    const paper_right_n_left_y_tick_len = px_right_n_left_y_tick_len / xaxis_px;
    // Monthly.py line 340: tick_height_paper = 45 / self.yaxis_px
    const tick_height_paper = 45 / yaxis_px;

    chartJson.layout.shapes.forEach(shape => {
        if (shape.name) {
            if (shape.name === "left-y-tick") {
                shape.x1 = -paper_right_n_left_y_tick_len;
            } else if (shape.name === "right-y-tick") {
                shape.x1 = 1 + paper_right_n_left_y_tick_len;
            } else if (shape.name === "top-spine") {
                shape.x0 = -paper_right_n_left_y_tick_len;
            } else if (shape.name === "top-x-tick") {
                shape.y0 = 1 + tick_height_paper;
            }
        }
    });

    return chartJson;
}

export { resizeMonthlyChartByHeight };
