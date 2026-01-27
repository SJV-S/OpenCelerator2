
function resizeWeeklyChartByHeight(chartJson, containerHeight) {
    // Detect if likely mobile screen (width <= 768px or touch-only device)
    const isMobile = window.innerWidth <= 768 ||
                     (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);

    // Use 2% spacing for mobile, 8% for desktop
    const spacingFactor = isMobile ? 0.98 : 0.92;
    const height = containerHeight * spacingFactor;

    console.log(height)

    const margin = chartJson.layout.margin;
    // Weekly minute chart y-axis range (from Weekly.py)
    const y = {min: 0.001 * 0.69, max: 1000};
    const xmax = Math.round(chartJson.layout.xaxis.range[1])
    const deg = 34; // desired angle of doubling in degrees
    const unit = 4; // weeks per doubling (from Weekly.py)
    const yaxis_px = height - (margin.t + margin.b); // y-axis length in px
    const y_axis = Math.log10(y.max) - Math.log10(y.min); // y-axis length
    const delta_y = Math.log10(2 ** (xmax / unit)); // height of a 34 degree triangle with x-axis as base
    const delta_y_px = (delta_y / y_axis) * yaxis_px; // triangle height in px
    const xaxis_px = delta_y_px / Math.tan((deg * Math.PI) / 180); // triangle base in px = x-axis length in px
    const width = xaxis_px + (margin.l + margin.r); // layout width

    // Set new chart size dimensions
    chartJson.layout.height = height;
    chartJson.layout.width = width;

    console.log("height calc", height)
    console.log("width calc", width)

    // Scaling chart aspects (derived from Weekly.py at base height 675)
    // Base values: generalFontScale = 675 * 0.017 = 11.475, titleFontScale = 675 * 0.025 = 16.875
    const generalFontScale = height * 0.017
    const titleFontScale = height * 0.025

    // Weekly.py offsets at base height 675:
    // month_name_pixel_offset = 35 -> 35 / 11.475 = 3.05
    // month_count_pixel_offset = 68 -> 68 / 11.475 = 5.93
    // top_x_title_pixel_offset = 100 -> 100 / 16.875 = 5.93
    // bottom_x_title_pixel_offset = 75 -> 75 / 16.875 = 4.44
    const monthNamePixelOffset = generalFontScale * 3.05
    const monthCountPixelOffset = generalFontScale * 5.93
    const topXTitlePixelOffset = titleFontScale * 5.93
    const bottomXTitlePixelOffset = titleFontScale * 4.44
    const xTicksDown = 36

    // Universally scale annotations
    chartJson.layout.annotations.forEach(annotation => {
        annotation.font.size = generalFontScale;
    });

    // Axes
    chartJson.layout.xaxis.ticklabelstandoff = Math.round(height / xTicksDown);  // Must be integer
    chartJson.layout.yaxis.title.font.size = titleFontScale;  // Left y-axis title font size
    chartJson.layout.yaxis.tickfont.size = generalFontScale * 1.5; // Left y-axis number font size
    chartJson.layout.xaxis.tickfont.size = generalFontScale * 1.5;  // Left x-axis number font size
    if (chartJson.layout.yaxis2?.tickfont?.size) {
        chartJson.layout.yaxis2.tickfont.size = generalFontScale;  // Right y-axis number font size
    }

    // Scaling specific annotations (Weekly.py names)
    chartJson.layout.annotations.forEach(annotation => {
        if (annotation.name && annotation.name.startsWith("month-label")) {
            // Month name labels (e.g., "Jan\n26") - Weekly.py line 501-511
            annotation.y = 1 + (monthNamePixelOffset / yaxis_px);
            annotation.font.size = generalFontScale * 0.85;
        } else if (annotation.name === "month-count") {
            // Month count numbers (0, 2, 4, 6...) - Weekly.py line 477-487
            annotation.y = 1 + (monthCountPixelOffset / yaxis_px);
        } else if (annotation.name === "top_x_title") {
            // "SUCCESSIVE CALENDAR MONTHS" - Weekly.py line 460-470
            annotation.font.size = titleFontScale;
            annotation.y = 1 + (topXTitlePixelOffset / yaxis_px);
        } else if (annotation.name === "bottom_x_title") {
            // "SUCCESSIVE CALENDAR WEEKS" - Weekly.py line 447-457
            annotation.font.size = titleFontScale;
            annotation.y = 0 - (bottomXTitlePixelOffset / yaxis_px);
        } else if (annotation.name === 'minor-left-y') {
            annotation.font.size = generalFontScale;
        }
    });

    // Scaling lines and ticks
    const px_right_n_left_y_tick_len = 6;
    const paper_right_n_left_y_tick_len = px_right_n_left_y_tick_len / xaxis_px;
    // Weekly.py line 371: tick_height_paper = 55 / self.yaxis_px
    const tick_height_paper = 55 / yaxis_px;

    chartJson.layout.shapes.forEach(shape => {
        if (shape.name) {
            if (shape.name === "left-y-tick") {
                shape.x1 = -paper_right_n_left_y_tick_len;

            } else if (shape.name === "right-y-tick") {
                shape.x1 = 1 + paper_right_n_left_y_tick_len;

            } else if (shape.name === "top-spine") {
                shape.x0 = -paper_right_n_left_y_tick_len;

            } else if (shape.name === "top-x-tick") {
                // Weekly.py line 378: y0=1 + tick_height_paper
                shape.y0 = 1 + tick_height_paper;
            }
        }
    });


    return chartJson
}

// Export as ES module
export { resizeWeeklyChartByHeight };
