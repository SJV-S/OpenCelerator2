# Line Draw/Redraw Unification

## Problem

The line drawing modules have separate functions for initial drawing and redrawing after chart replot. These functions have drifted out of sync, causing redrawn lines to appear differently than when first drawn.

## Affected Files

- `static/SCC/lines/aimLines.js` — **has discrepancies**
- `static/SCC/lines/phaseLines.js` — appears consistent, but still has duplication
- `static/SCC/lines/cutLines.js` — no redraw function (uses chart refresh)

## Specific Discrepancies: aimLines.js

### Initial draw (`addAimTextLabel`, lines 568-588)

```javascript
{
    textangle: textAngle,      // Calculated for diagonal lines
    yshift: 5,                 // Text floats 5px above line
    bgcolor: 'rgba(255, 255, 255, 1.0)',  // Fully opaque
    yanchor: 'bottom'
}
```

### Redraw (`redrawAimLines`, lines 935-958)

```javascript
{
    // textangle: MISSING — diagonal text not tilted
    // yshift: MISSING — text sits on line instead of above
    bgcolor: 'rgba(255, 255, 255, 0.8)',  // Different opacity
    yanchor: 'bottom'
}
```

## Solution

Refactor to use a **single unified function** that:

1. Takes line metadata as input
2. Builds Plotly shape(s) and annotation(s) with all properties
3. Is called both during initial finalization AND during replot restoration

### Proposed approach

```javascript
// Single source of truth for building aim line shapes/annotations
function buildAimLineElements(metadata, chartDiv) {
    const shapes = [...];
    const annotation = {...};  // All properties in one place
    return { shapes, annotation };
}

// Called by finalizeAimLine()
// Called by redrawAimLines()
```

This eliminates duplication and ensures draw/redraw are always identical.

## Priority

Medium — visual fidelity issue, not functional breakage.
