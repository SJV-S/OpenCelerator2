
function resizeChartByHeight(chartJson, containerHeight) {
    // Detect if likely mobile screen (width <= 768px or touch-only device)
    const isMobile = window.innerWidth <= 768 ||
                     (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);

    // Use 2% spacing for mobile, 8% for desktop
    const spacingFactor = isMobile ? 0.98 : 0.92;
    const height = containerHeight * spacingFactor;

    console.log(height)

    const margin = chartJson.layout.margin;
    const y = {min: 1 * 0.69, max: 1000000};  // Maybe there's a better way without hardcoding
    const xmax = Math.round(chartJson.layout.xaxis.range[1])
    const deg = 34; // desired angle of doubling in degrees
    const unit = 7; // number of units per doubling
    const yaxis_px = height - (margin.t + margin.b); // y-axis length in px
    const y_axis = Math.log10(y.max) - Math.log10(y.min); // y-axis length
    const delta_y = Math.log10(2 ** (xmax / unit)); // - log10(1) | height of a 34 degree triangle with x-axis as base
    const delta_y_px = (delta_y / y_axis) * yaxis_px; // triangle height in px
    const xaxis_px = delta_y_px / Math.tan((deg * Math.PI) / 180); // triangle base in px = x-axis length in px
    const width = xaxis_px + (margin.l + margin.r); // layout width

    // Set new chart size dimensions
    chartJson.layout.height = height;
    chartJson.layout.width = width;

    console.log("height calc", height)
    console.log("width calc", width)

    // Scaling chart aspects
    // Tags: x-tick, left-y-tick, right-y-tick, minor-left-y, date-line, week-count, date-text, top_x_title,
    const generalFontScale = height * 0.017
    const titleFontScale = height * 0.025
    const dateLinePixelOffset = generalFontScale * 2.4305 // (25 / 6)
    const dateTextPixelOffset = generalFontScale * 4
    const weekCountPixelOffset = generalFontScale * 2.0833  // (25 / 12)
    const topXTitlePixelOffset = titleFontScale * 5.2
    const bottomXTitlePixelOffset = titleFontScale * 4.1666 // (25 / 6)
    const xTicksDown = 36

    // Universally scale annotations
    chartJson.layout.annotations.forEach(annotation => {
        annotation.font.size = generalFontScale;
    });
    
    // Axes
    chartJson.layout.xaxis.ticklabelstandoff = Math.round(height / xTicksDown);  // Must be interger
    chartJson.layout.yaxis.title.font.size = titleFontScale;  // Left y-axis title font size
    chartJson.layout.yaxis.tickfont.size = generalFontScale * 1.5; // Left y-axis number font size
    chartJson.layout.xaxis.tickfont.size = generalFontScale * 1.5;  // Left x-axis number font size
    if (chartJson.layout.yaxis2?.tickfont?.size) {
        chartJson.layout.yaxis2.tickfont.size = generalFontScale;  // Right y-axis number font size
    }
  
    // Scaling specific annotations
    chartJson.layout.annotations.forEach(annotation => {
        if (annotation.name === "date-text") {
            annotation.y = 1 + (dateTextPixelOffset / yaxis_px);
        } else if (annotation.name === "week-count") {
            annotation.y = 1 + (weekCountPixelOffset / yaxis_px);
        } else if (annotation.name === "top_x_title") {
            annotation.font.size = titleFontScale
            // Keep x at 0.5 for paper coordinates (centered)
            annotation.y = 0 - (bottomXTitlePixelOffset / yaxis_px);
        } else if (annotation.name == "bottom_x_title") {
            annotation.font.size = titleFontScale
            // Keep x at 0.5 for paper coordinates (centered)
            annotation.y = 1 + (topXTitlePixelOffset / yaxis_px);
        } else if (annotation.name == 'minor-left-y') {
            annotation.font.size = generalFontScale
        }
    });
    
    // Scaling lines and ticks
    const px_date_line_len = dateTextPixelOffset * 0.8;
    const paper_date_line_len = px_date_line_len / xaxis_px;
    const px_right_n_left_y_tick_len = 6;
    const paper_right_n_left_y_tick_len = px_right_n_left_y_tick_len / xaxis_px;
    chartJson.layout.shapes.forEach(shape => {
        if (shape.name) {
            if (shape.name === "date-line") {
                shape.y0 = 1 + (dateLinePixelOffset / yaxis_px);
                shape.y1 = 1 + (dateLinePixelOffset / yaxis_px);
    
                // x-coordinate position to 'paper' position
                const middle = shape.x0 / xmax;
                shape.x0 = middle + paper_date_line_len;
                shape.x1 = middle - paper_date_line_len;

            } else if (shape.name === "left-y-tick") {
                shape.x1 = -paper_right_n_left_y_tick_len;

            } else if (shape.name === "right-y-tick") {
                shape.x1 = 1 + paper_right_n_left_y_tick_len;

            } else if (shape.name === "top-spine") {
                shape.x0 = -paper_right_n_left_y_tick_len;
            }
        }
    });
    
        
    return chartJson
}

// Export as ES module
export { resizeChartByHeight };
