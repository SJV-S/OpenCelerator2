# Crosshair CPU Debugging - In Progress

## Problem

CPU/fan spins up when using crosshair feature (Shift + mouse move over chart).

## What We've Ruled Out

Through systematic testing, these are NOT the cause:

| Component | Status |
|-----------|--------|
| Plotly hovermode/dragmode | Not the cause |
| `plotly_beforehover` event | Not the cause |
| Event overlay blocking Plotly | Not the cause |
| Throttle rate (15fps vs 30fps) | Not the cause |
| RAF loop itself | Minor impact only with extreme mouse movement |
| `getBoundingClientRect()` | Not the cause |
| `chartDiv.layout` access | Not the cause |
| `getPlotCoordinates()` full function | Not the cause |

## Current State

We're incrementally re-enabling features to find the culprit. Currently enabled:

```javascript
function processMouseMove(event, chartDiv) {
    if (!event) return;

    const coords = getPlotCoordinates(event, chartDiv);
    if (!coords) {
        removeCrosshairLines();
        return;
    }

    updateCrosshairLines(coords.x, coords.y);  // <-- JUST ADDED, NEEDS TESTING
    return;  // Stop here for now
}
```

## Still Disabled (needs re-enabling after finding culprit)

1. **Crosshair panel UI** - tabs hiding, crosshair-content showing
2. **Data markers** - `updateDataMarkers()`
3. **Info panel** - `updateInfoPanel()`
4. **Data lookup** - `findTraceDataAtX()`

## Next Steps

1. Test if `updateCrosshairLines()` causes CPU issue
2. If not, enable data lookup (`findTraceDataAtX`)
3. If not, enable markers (`updateDataMarkers`)
4. If not, enable info panel (`updateInfoPanel`)
5. If not, enable panel UI (tabs/crosshair-content)

## Code Locations

- `static/SCC/util/crosshair.js` - main crosshair module
- `processMouseMove()` ~line 218 - where we're testing
- `updateCrosshairLines()` ~line 380 - crosshair line positioning
- `updateDataMarkers()` ~line 545 - data point markers
- `updateInfoPanel()` ~line 605 - sidebar info panel

## Changes Made During Debugging

- Added event-capturing overlay (`crosshair-event-overlay`) with `pointer-events: auto` when active
- Added `plotly_beforehover` handler returning false
- Changed to RAF-based throttling instead of setTimeout
- Added `will-change: transform` and `contain` CSS properties to crosshair lines
- Using CSS `transform` instead of `top`/`left` for positioning

## Files Modified

- `static/SCC/util/crosshair.js` - heavily modified during debugging
- `static/SCC/lines/cutLines.js` - removed dead code (old Plotly-based functions)
- `CLAUDE.md` - added interaction rule about answering questions before coding
