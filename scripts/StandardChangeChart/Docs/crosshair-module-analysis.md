# Crosshair Module - Complete Analysis

## Intended UX Experience

The crosshair feature provides **real-time data inspection** when the user holds **Shift** and moves the mouse over the chart:

1. **Visual Crosshairs** - Gray dashed lines (vertical + horizontal) track the cursor position
2. **Data Markers** - Semi-transparent overlays appear on data points at the current x-position
3. **Info Panel** - The sidebar transforms to show detailed data values instead of normal tabs
4. **Clean Exit** - Releasing Shift restores everything to the previous state

---

## Activation Flow (lines 47-99)

When user presses Shift:

| Step | Action | Code Location |
|------|--------|---------------|
| 1 | Block Plotly hover via `plotly_beforehover` returning `false` | 56-57 |
| 2 | Disable Plotly's `hovermode` and `dragmode` | 60-62 |
| 3 | Store current active sidebar tab for later restoration | 65-68 |
| 4 | **[DISABLED]** Hide sidebar tabs, show crosshair-content panel | 70-84 |
| 5 | Show counter overlay on mobile if hidden | 86-90 |
| 6 | Activate transparent event-capturing overlay | 93-94 |
| 7 | Attach `mousemove` handler to overlay (not chart) | 97-98 |

The **event overlay** (`crosshair-event-overlay`) is critical - it sits above the chart with `z-index: 100` and intercepts all mouse events, preventing Plotly from receiving them.

---

## Mouse Movement Processing (lines 203-241)

Uses **requestAnimationFrame throttling** for smooth 60fps updates:

```
mousemove event → store lastEvent → request RAF (if not pending)
                                          ↓
                               on RAF: processMouseMove(lastEvent)
```

**`processMouseMove()` intended flow:**

1. `getPlotCoordinates()` → convert pixel to chart x/y values
2. `updateCrosshairLines()` → position the visual crosshairs
3. `findTraceDataAtX()` → lookup data values at rounded x
4. `updateDataMarkers()` → draw markers on data points
5. `updateInfoPanel()` → populate sidebar with values

**Currently:** Steps 3-5 are disabled (commented out) while debugging CPU issues.

---

## Data Sources and Fetching

**Where data comes from:**

| Data | Source | Access Pattern |
|------|--------|----------------|
| Mouse position | `event.clientX`, `event.clientY` | Real-time from overlay |
| Chart layout | `chartDiv.layout` | Margin, axis ranges from Plotly |
| Trace data | `chartDiv.data[]` | Array of Plotly traces |
| Trace metadata | `trace.meta.seriesName`, `trace.meta.aggType` | Set by `tracePipeline.js:464` |
| Custom series names | `chartState.traceStyles[id].raw.seriesName` | From chartState |
| Marker sizes | `chartState.traceStyles[id].raw.markerSize` | From chartState |

**`findTraceDataAtX()` (lines 247-274):**

```javascript
// Iterates all traces, finds exact x-match, returns Map:
// key: "seriesName-aggType"
// value: { seriesName, aggType, value }
```

Uses **direct index lookup** (`xArray.indexOf(xRounded)`) - works because data points are at integer x positions.

---

## Crosshair Lines (lines 317-437)

**DOM-based** (not Plotly shapes) for performance:

| Element | Style |
|---------|-------|
| Container `#crosshair-lines` | `z-index: 50`, `contain: strict` |
| Vertical `#crosshair-v` | Gray dashed pattern, 1px wide, full plot height |
| Horizontal `#crosshair-h` | Gray dashed pattern, 1px tall, full plot width |

**Positioning uses CSS transforms** for GPU acceleration:
```javascript
lines.vLine.style.transform = `translate(${xPixel}px, ${plotTop}px)`;
lines.hLine.style.transform = `translate(${plotLeft}px, ${yPixel}px)`;
```

---

## Data Markers (lines 440-603)

**Creates shaped overlays** on actual data points at current x:

| Series Type | Color | Shape | Size Source |
|-------------|-------|-------|-------------|
| corrects | Green `#22c55e` | Circle | `traceStyles.corrects.raw.markerSize` |
| errors | Red `#ef4444` | Circle | `traceStyles.errors.raw.textSize` |
| timing | Purple `#a855f7` | Triangle (down) | `traceStyles.timing.raw.markerSize` |
| misc* | Orange `#f97316` | Square | `traceStyles.misc[id].raw.markerSize` |

Markers have **40% opacity** and include padding (`OVERLAY_PADDING = 8px`) beyond visual size.

---

## Info Panel (lines 608-664)

Intended sidebar display structure:

```
┌─────────────────────────┐
│ Date                    │  ← xPositionToDate() conversion
│   Day: Wed | 15         │
│   Month: Jan | 01       │
│   Year: 2025            │
├─────────────────────────┤
│ Cursor                  │
│   x: 45                 │
│   y: 1.5                │  ← formatValue() for log scale
├─────────────────────────┤
│ Series                  │  ← From findTraceDataAtX() Map
│   Correct: 12 (sum)     │
│   Incorrect: 3 (sum)    │
│   Timing: 0.5           │  ← Shows 1/value for timing
│   Custom Name: 7        │
└─────────────────────────┘
```

**Timing special case:** Displays `1/value` because timing is stored as reciprocal (timing floor).

---

## Deactivation Flow (lines 127-197)

When user releases Shift:

1. Cancel any pending RAF
2. Remove `plotly_beforehover` handler
3. Restore Plotly's `hovermode`/`dragmode`
4. Remove mousemove handler from overlay
5. Set overlay `pointer-events: none` (let events through)
6. Hide crosshair lines
7. Clear data markers
8. Hide crosshair-content panel
9. Restore tabs and previous active tab

---

## Known Issues Being Investigated

| Issue | Status | Root Cause |
|-------|--------|------------|
| Custom names not showing | FIXED | Was using hardcoded map instead of `chartState.traceStyles` lookup |
| Only 2/5 series showing | Needs investigation | Possibly data gaps, missing trace.meta, or NaN values |
| CPU runs hot | Under investigation | Currently bisecting - crosshair lines enabled, data features disabled |

---

## Key Dependencies

```
crosshair.js
    ├── chartState.js (traceStyles for names/sizes)
    ├── config.js (CORRECTS, ERRORS constants)
    ├── util/dates.js (xPositionToDate)
    └── util/format.js (formatValue)
```
