# Fan Visibility Fix - Status Report

## Original Issue

Celeration fan lines reappear even when visibility toggle is off. Specifically:
- Navigating in the menu (leaving Data tab) causes fan lines to reappear
- Text labels stay hidden, only lines reappear

## Root Cause Identified

When `removeEntryDateIndicator()` ran, it used the "sledgehammer" approach:

```javascript
Plotly.relayout(chartDiv, { shapes: currentShapes });
```

This replaces the entire shapes array, causing Plotly to destroy and recreate ALL shape SVG elements. The new elements don't have the CSS `display: none` that was applied to hide the fan.

## Solution Implemented

### 1. Created plotlyWrapper.js

Location: `static/SCC/util/plotlyWrapper.js`

Wraps Plotly operations to:
- Emit events through eventBus after completion (guaranteed, unlike native Plotly events)
- Support name-based shape removal via `relayout(chartDiv, 'shape-name', true)`

### 2. Fixed removeEntryDateIndicator

Changed from sledgehammer to surgical:

```javascript
// Before (BAD)
Plotly.relayout(chartDiv, { shapes: filteredArray });

// After (GOOD)
await relayout(chartDiv, ENTRY_DATE_INDICATOR_NAME, true);
```

### 3. Fixed updateEntryDateIndicator

Changed from array replacement to indexed update/add:

```javascript
// Update existing
await relayout(chartDiv, {
    [`shapes[${index}].x0`]: xPos,
    [`shapes[${index}].x1`]: xPos
});

// Add new
await relayout(chartDiv, {
    [`shapes[${shapes.length}]`]: { ...shapeObject }
});
```

## Outstanding Issue

**Problem:** On first date click, the indicator doesn't appear. On second click, it does.

**Observations:**
- The UPDATE path (second click) works
- The ADD path (first click) doesn't show the shape
- Shape may be added to layout but not rendered

**Suspected cause:** Missing `xref: 'x'` property. The original code also lacked it, but the sledgehammer approach might handle defaults differently than indexed add.

**To investigate:**
1. Add `xref: 'x'` to the shape definition
2. Check if Plotly has quirks with `shapes[N]: {...}` for new shapes
3. Verify `shapes.length` is correct at time of add

## Files Modified

- `static/SCC/util/plotlyWrapper.js` - NEW: Plotly operation wrapper
- `static/SCC/eventBus.js` - Added PLOTLY_* events
- `static/SCC/series/dataEntry.js` - Fixed indicator add/remove
- `CLAUDE.md` - Added surgical update policy

## Related Documentation

- `Docs/plotly-shape-surgical-updates.md` - Full explanation of the issue
- `Docs/plotly-shapes-array-replacement.md` - Additional context

## Next Steps

1. Fix the first-click-not-appearing issue (try adding `xref: 'x'`)
2. Audit other Plotly.relayout calls in codebase for sledgehammer patterns
3. Consider migrating all Plotly calls to use the wrapper
