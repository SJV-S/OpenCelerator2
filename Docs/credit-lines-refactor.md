# Credit Lines Refactor

## Overview

Refactoring credit lines from a separate HTML container to Plotly annotations rendered directly in the chart's bottom margin.

## Previous Architecture

```
#chart-area (100vh)
├── #chart-container (85%) → Plotly chart
└── #credit-container (15%) → HTML divs with contenteditable
```

- Credits rendered as `<div class="credit-line">` elements
- Inline editing via `contenteditable` attribute
- Separate container required CSS alignment with chart margins

## New Architecture

```
#chart-area (100vh)
└── #chart-container (100%) → Plotly chart with expanded bottom margin
                              ├── Credit annotations (paper coords y < 0)
                              └── Invisible hit-area rectangles
```

- Credits rendered as Plotly annotations in expanded bottom margin
- Click detection via invisible hit-area rectangles (like celeration fan pattern)
- Modal dialog for editing (replaces inline contenteditable)

## Files Changed

### `static/SCC/misc/credit.js` - Complete rewrite
- `generateCreditElements(layout)` - Creates Plotly annotations + hit-area shapes
- `injectCredits(plotData)` - Expands `margin.b` by 60px before `Plotly.newPlot()`
- `renderCredits()` - Updates annotation text via `Plotly.relayout()`
- `regenerateCredits()` - Regenerates on resize with recalculated font sizes
- `initCreditClick()` - Sets up click handler for credit detection
- `openCreditEditDialog(index)` - Modal popup for editing
- `pixelToPaper()` / `getCreditAtPoint()` - Click detection helpers

### `static/SCC/main.js`
- Added imports: `injectCredits`, `initCreditClick`, `regenerateCredits`
- Call `injectCredits(plotData)` before `Plotly.newPlot()` (after celeration fan injection)
- Call `initCreditClick()` after chart creation
- Resize handler calls `regenerateCredits()` instead of `renderCredits()`

### `templates/SCC/chart.html`
- Removed `#credit-container` div
- Updated comment

### `static/SCC/css/chart_menu.css`
- `#chart-container`: 85% → 100% height
- `#credit-container`: simplified to `display: none`
- Removed unused `.credit-display`, `.credit-line` desktop styles

## Key Implementation Details

### Credit Positioning (paper coordinates)
```javascript
const creditPositions = [
    { y: -0.035, hitY0: -0.055, hitY1: -0.015 },  // Credit line 0
    { y: -0.08, hitY0: -0.10, hitY1: -0.06 }      // Credit line 1
];
```

Paper y < 0 positions annotations in the bottom margin below the plot area.

### Hit-Area Pattern (from celeration fan)
- Invisible rectangle shapes behind each credit line
- `fillcolor: 'rgba(0,0,0,0)'` with `line: { width: 0 }`
- Click detection converts pixel → paper coords, checks bounds

### Modal Dialog
- Replaces inline `contenteditable` editing
- Full-width input field for long credit text
- Enter to save, Escape to cancel, click outside to cancel

## Mobile Behavior (unchanged)
- Credits hidden on desktop chart (now via Plotly annotations)
- Mobile shows credits in credit tab via `#mobile-credit-0`, `#mobile-credit-1`
- `renderCredits()` still updates mobile elements

## Remaining Issues

TBD - to be discussed in follow-up session.
