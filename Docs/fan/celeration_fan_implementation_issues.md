# Celeration Fan Implementation Issues

## Current Status: BROKEN

The celeration fan is partially implemented but text labels do not align with their corresponding lines.

---

## Breakthrough: Margin Expansion (Solves Clipping)

The fan needs to be drawn OUTSIDE the plot area (in the margins). Plotly clips shapes/annotations that fall outside the plot boundaries.

**Solution discovered:** Expand the margins BEFORE calling `Plotly.newPlot()`, then position the fan within the expanded margin space.

```javascript
// In injectCelerationFan(), BEFORE generating fan elements:
const plotWidth = plotData.layout.width - plotData.layout.margin.l - plotData.layout.margin.r;
const extraMargin = Math.round(plotWidth * 0.18);

if (isMinuteChart) {
    plotData.layout.margin.l += extraMargin;
} else {
    plotData.layout.margin.r += extraMargin;
}
plotData.layout.width += extraMargin;
```

This expands the drawing area without affecting the plot itself. The fan can now be positioned in the margin without clipping.

---

## Unsolved Problem: Text-Line Misalignment

### The Issue
- Lines for ×16 and ÷16 (extreme angles) align with their labels
- All other lines (×4, ×2, ×1.4, ×1, ÷1.4, ÷2, ÷4) do NOT point to their labels
- Text appears "pushed away" from the line endpoints
- Some kind of distortion affects middle angles but not extreme angles

### What the Documentation Says

The text position should use THE SAME FORMULA as the line endpoint, just with extended dx:

```python
# Line endpoint
dx = line_length * cos(angle_rad)
x_end = x_mid + dx
y_end = y_mid * (10 ** (log10(cel) * dx / unit))

# Text position - SAME formula, extended dx
distance_factor = 1.1 + (0.05 * len(label))
text_dx = dx * distance_factor
text_x = x_mid + text_dx
text_y = y_mid * (10 ** (log10(cel) * text_dx / unit))
```

The text should be "further along the same ray" - guaranteed alignment.

### What Was Tried (All Failed)

1. **Direct implementation of formula** - Text still misaligned
2. **Paper coordinate conversion** - Converting data coords to paper coords, text still misaligned
3. **Aspect ratio correction for text angle** - No improvement
4. **Extending along paper-space line direction** - No improvement
5. **Various textangle adjustments** - No improvement

### Suspected Issues

1. **Coordinate transformation distortion**: When converting from semi-log data coordinates to linear paper coordinates, something non-linear happens that affects middle angles differently than extreme angles.

2. **Text rotation mismatch**: The `textangle` in Plotly may not correspond to the data-space angle calculation. The visual angle of the line in paper/pixel space differs from the calculated data-space angle.

3. **Aspect ratio**: Paper coordinates (0-1, 0-1) map to different pixel dimensions. A line at 34° in paper coords may not appear at 34° on screen.

4. **Unknown Plotly behavior**: There may be something about how Plotly renders annotations vs shapes that causes the misalignment.

---

## Current Code Location

`static/SCC/misc/celerationFan.js`

### Key Functions
- `generateFanElements()` - Creates shapes and annotations
- `injectCelerationFan()` - Expands margins and injects fan before Plotly.newPlot()
- `toPaper()` - Converts data coordinates to paper coordinates

---

## What Needs to Be Solved

1. **Why do ×16 and ÷16 align but others don't?** - Understanding this would reveal the source of the distortion.

2. **Correct text positioning** - Either fix the coordinate transformation or find another approach.

3. **Correct text rotation** - Text should rotate to match the visual angle of the line as rendered.

---

## Reference Documentation

See `Docs/celeration_fan_documentation.md` for the original specification including:
- Angle calculation formula
- Line endpoint formula
- Text positioning formula
- Expected visual result
