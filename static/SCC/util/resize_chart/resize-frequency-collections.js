
function resizeFrequencyCollectionsChartByHeight(chartJson, containerHeight) {
    const isMobile = window.innerWidth <= 768 ||
                     (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);

    const spacingFactor = isMobile ? 0.98 : 0.92;
    const height = containerHeight * spacingFactor;

    const margin = chartJson.layout.margin;
    // FrequencyCollections.py lines 31-32 (minute_type=True)
    const y = {min: 0.001 * 0.69, max: 1000};
    const xmax = Math.round(chartJson.layout.xaxis.range[1]);
    const deg = 34;
    // User specified: unit = 10 for frequency collections
    const unit = 10;
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

    // FrequencyCollections.py lines 244-246
    // blank_line_pixel_offset = 35 -> 35 / 11.475 = 3.05
    // counted_label_pixel_offset = 55 -> 55 / 11.475 = 4.79
    // title_pixel_offset = 90 -> 90 / 16.875 = 5.33
    const blankLinePixelOffset = generalFontScale * 3.05;
    const countedLabelPixelOffset = generalFontScale * 4.79;
    const titlePixelOffset = titleFontScale * 5.33;
    const xTicksDown = 36;

    // Universally scale annotations
    chartJson.layout.annotations.forEach(annotation => {
        annotation.font.size = generalFontScale;
    });

    // Axes
    chartJson.layout.xaxis.ticklabelstandoff = Math.round(height / xTicksDown);
    chartJson.layout.yaxis.title.font.size = titleFontScale;
    chartJson.layout.yaxis.tickfont.size = generalFontScale * 1.5;
    if (chartJson.layout.xaxis?.tickfont?.size) {
        chartJson.layout.xaxis.tickfont.size = generalFontScale * 1.5;
    }

    // Scaling specific annotations (FrequencyCollections.py names)
    chartJson.layout.annotations.forEach(annotation => {
        if (annotation.name && annotation.name.startsWith("blank-line")) {
            // Blank lines for user input - FrequencyCollections.py line 276-286
            annotation.y = 0 - (blankLinePixelOffset / yaxis_px);
            annotation.font.size = generalFontScale * 0.75;
        } else if (annotation.name && annotation.name.startsWith("counted-label")) {
            // "Counted" labels - FrequencyCollections.py line 289-299
            annotation.y = 0 - (countedLabelPixelOffset / yaxis_px);
            annotation.font.size = generalFontScale * 0.75;
        } else if (annotation.name === "chart_title") {
            // Chart title - FrequencyCollections.py line 258-268
            annotation.font.size = titleFontScale * 1.2;
        } else if (annotation.name === 'minor-left-y') {
            annotation.font.size = generalFontScale;
        }
    });

    // Scaling lines and ticks
    const px_left_y_tick_len = 6;
    const paper_left_y_tick_len = px_left_y_tick_len / xaxis_px;

    chartJson.layout.shapes.forEach(shape => {
        if (shape.name) {
            if (shape.name === "left-y-tick") {
                shape.x1 = -paper_left_y_tick_len;
            } else if (shape.name === "top-spine") {
                shape.x0 = -paper_left_y_tick_len;
            }
            // Note: FrequencyCollections has no right-y-tick, but has right-spine
        }
    });

    return chartJson;
}

export { resizeFrequencyCollectionsChartByHeight };
