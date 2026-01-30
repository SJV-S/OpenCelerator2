# Plotly Shape Updates: Surgical vs Sledgehammer

## The Problem We Faced

The celeration fan (a set of 10 shapes + 11 annotations) was being hidden via CSS (`display: none`). This worked fine until the user navigated away from the Data tab - suddenly the fan lines would reappear, even though the toggle was off.

### What Was Happening

1. Fan elements hidden via CSS `display: none` on the SVG elements
2. User leaves Data tab
3. `removeEntryDateIndicator()` runs to remove a single indicator line
4. Fan lines reappear (but text stays hidden)

### Root Cause

The indicator removal code was doing this:

```javascript
// The sledgehammer approach
const currentShapes = chartDiv.layout.shapes.filter(
    shape => shape.name !== 'entry-date-indicator'
);
Plotly.relayout(chartDiv, { shapes: currentShapes });
```

When you pass `shapes: [array]` to `Plotly.relayout()`, Plotly interprets this as "here is the complete new shapes array." It then:

1. **Destroys** all existing shape SVG elements in the DOM
2. **Creates** fresh SVG elements from the new array

The new SVG elements don't have `display: none` - that CSS was on the old elements that got destroyed. So the fan becomes visible again.

### Why Text Stayed Hidden

The removal code only passed `shapes:` - it didn't touch annotations. So Plotly only redrew shapes, leaving annotation SVG elements (the fan text) untouched with their CSS intact.

## The Solution

Target the specific shape by index instead of replacing the whole array:

```javascript
// The surgical approach
const shapes = chartDiv.layout.shapes;
const index = shapes.findIndex(s => s.name === 'entry-date-indicator');
if (index !== -1) {
    Plotly.relayout(chartDiv, { [`shapes[${index}]`]: null });
}
```

This tells Plotly "remove the shape at position X" - only that one element gets touched, everything else stays as-is.

## The Naming Pattern

Plotly shapes have a `name` property you can set, but Plotly's API only accepts index-based references:

```javascript
// You CAN'T do this - Plotly doesn't support it
Plotly.relayout(chartDiv, { 'shapes.my-shape': null });

// You MUST do this - find index first, then use it
const index = shapes.findIndex(s => s.name === 'my-shape');
Plotly.relayout(chartDiv, { [`shapes[${index}]`]: null });
```

The `name` property is for YOUR code to find shapes. The index is for PLOTLY's API.

## Quick Reference

| Operation | Sledgehammer (BAD) | Surgical (GOOD) |
|-----------|-------------------|-----------------|
| Remove one shape | `shapes: filtered` | `shapes[i]: null` |
| Update one shape | `shapes: modified` | `shapes[i].property: value` |
| Add one shape | `shapes: [...old, new]` | Use `Plotly.relayout` with shape object |
| Hide one shape | `shapes: filtered` | `shapes[i].visible: false` |

## When Sledgehammer Is Acceptable

- Initial chart creation (no existing elements to preserve)
- Complete chart reset/reload
- When you intentionally want to redraw everything

## Related Files

- `static/SCC/series/dataEntry.js` - Fixed indicator removal
- `static/SCC/misc/celerationFan.js` - Fan visibility toggling
- `Docs/plotly-shapes-array-replacement.md` - Additional context on this issue
