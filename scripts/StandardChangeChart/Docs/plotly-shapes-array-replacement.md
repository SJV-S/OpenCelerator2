# Plotly Shapes: Array Replacement vs. Targeted Updates

## The Problem

When toggling visibility of chart elements (like the celeration fan) using CSS `display: none`, the hidden elements reappear unexpectedly after certain operations.

## Root Cause

The issue stems from how Plotly handles shape updates. There are two approaches:

### Sledgehammer: Replace Entire Array

```javascript
const currentShapes = chartDiv.layout.shapes.filter(
    shape => shape.name !== 'indicator-line'
);

Plotly.relayout(chartDiv, {
    shapes: currentShapes  // Replaces entire array
});
```

When you pass `shapes: [...]` to `relayout()`, Plotly interprets this as "here's the new complete shapes array" and **redraws ALL shapes from scratch**. Every shape gets new SVG elements in the DOM.

### Surgical: Target Specific Index

```javascript
Plotly.relayout(chartDiv, {
    'shapes[5]': null  // Remove only shape at index 5
});
```

This only affects the targeted shape. Other shapes keep their existing SVG elements.

## Why This Breaks CSS Visibility

1. Element is hidden via CSS: `element.style.display = 'none'`
2. Some operation triggers array replacement (e.g., removing an indicator line)
3. Plotly redraws all shapes, creating **new SVG elements**
4. New elements don't have the CSS `display: none` style
5. Hidden elements reappear

## Specific Case: Celeration Fan

The celeration fan consists of:
- **10 shapes** (lines + hit-area rectangle)
- **11 annotations** (labels + header + period text)

When `removeEntryDateIndicator()` runs on leaving the Data tab:

```javascript
Plotly.relayout(chartDiv, {
    shapes: currentShapes  // Only shapes, not annotations
});
```

This redraws all shapes (fan lines reappear) but leaves annotations untouched (fan text stays hidden).

## Solution

Use `plotly_afterplot` event to re-apply CSS visibility after any Plotly render:

```javascript
chartDiv.on('plotly_afterplot', syncVisibilityState);

function syncVisibilityState() {
    if (!chartState.fanVisible) {
        toggleCelerationFan(false);
    }
}
```

This catches ALL Plotly operations that might regenerate SVG elements.

## Additional Gotcha: Element Selection

When selecting fan shapes for CSS hiding, don't assume they're at the end of the DOM:

```javascript
// WRONG: Assumes fan shapes are last N elements
const startIndex = allShapes.length - numFanShapes;

// RIGHT: Use actual indices from layout.shapes
shapeIndices.forEach(i => {
    // Select by actual index
});
```

If other shapes (phase lines, aim lines, etc.) were added after the fan, they'll be at the end instead.

## Key Takeaway

Plotly diffs against its internal state (`gd._fullLayout`), not the DOM. Any operation that triggers a redraw creates fresh SVG elements, wiping out CSS modifications. Always re-apply CSS state after Plotly renders.
