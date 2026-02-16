# Fix: Line Visibility Toggle Bug

## Problem

When toggling line visibility OFF and then back ON via the legend, only the text labels (annotations) reappear. The actual lines (shapes) remain invisible.

**Affected line types:**
- Phase lines (`phaseLines.js`)
- Aim lines (`aimLines.js`)
- Change/Cel lines (`celLine.js`)

## Root Cause

Plotly shapes don't reliably respond to `visible: true` after being set to `visible: false`. This is a known quirk in Plotly.js where:
- Setting `visible: false` works correctly (hides the shape)
- Setting `visible: true` does NOT reliably restore visibility

Annotations don't have this issue - they respond correctly to both `visible: false` and `visible: true`.

## Current Code Pattern

All three visibility functions use the same pattern:

```javascript
// phaseLines.js:934-964, aimLines.js:912-941, celLine.js:765-794

function setXxxLineVisibility(visible) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    const shapes = chartDiv.layout.shapes || [];
    const annotations = chartDiv.layout.annotations || [];
    let updated = false;

    const updatedShapes = shapes.map(s => {
        if (s.name && s.name.startsWith('xxx-')) {
            updated = true;
            return { ...s, visible };  // <-- Problem: visible: true doesn't work for shapes
        }
        return s;
    });

    const updatedAnnotations = annotations.map(a => {
        if (a.name && a.name.startsWith('xxx-')) {
            updated = true;
            return { ...a, visible };  // <-- Works fine for annotations
        }
        return a;
    });

    if (updated) {
        Plotly.relayout(chartDiv, { shapes: updatedShapes, annotations: updatedAnnotations });
    }
}
```

## Proposed Fix

Instead of setting `visible: true` to show elements, **remove the `visible` property entirely**. This restores Plotly's default state (visible), which works reliably for both shapes and annotations.

```javascript
const updatedShapes = shapes.map(s => {
    if (s.name && s.name.startsWith('xxx-')) {
        updated = true;
        if (visible) {
            // Remove 'visible' property to restore default (shown) state
            const { visible: _removed, ...rest } = s;
            return rest;
        } else {
            return { ...s, visible: false };
        }
    }
    return s;
});

const updatedAnnotations = annotations.map(a => {
    if (a.name && a.name.startsWith('xxx-')) {
        updated = true;
        if (visible) {
            // Remove 'visible' property to restore default (shown) state
            const { visible: _removed, ...rest } = a;
            return rest;
        } else {
            return { ...a, visible: false };
        }
    }
    return a;
});
```

## Files to Modify

| File | Function | Lines |
|------|----------|-------|
| `static/SCC/lines/phaseLines.js` | `setPhaseLineVisibility()` | 934-964 |
| `static/SCC/lines/aimLines.js` | `setAimLineVisibility()` | 912-941 |
| `static/SCC/lines/celLine.js` | `setCelLineVisibility()` | 765-794 |

## Why This Works

- Plotly elements default to visible when the `visible` property is absent
- Removing the property restores this default state
- This approach is consistent for both shapes and annotations
- No need for workarounds like opacity or other properties
