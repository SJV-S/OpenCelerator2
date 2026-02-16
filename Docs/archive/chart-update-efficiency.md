# Chart Update Efficiency: Current Issues and Refactoring Questions

## Problem Statement

Many UI interactions trigger a full chart refresh via `DATA_CHART_REFRESH` → `Plotly.react()`, which rebuilds all traces from scratch. For charts with thousands of data points (e.g., 2308 points in `all_monthly.json`), this causes noticeable lag.

## Current Architecture

### Three Levels of Plotly Updates

| Method | What it does | Performance | Used for |
|--------|--------------|-------------|----------|
| `Plotly.react()` | Rebuilds entire chart (data + layout) | **Slowest** | Full data refresh |
| `Plotly.relayout()` | Updates layout only (shapes, annotations, axes) | Medium | Fan toggle, line drawing |
| `Plotly.restyle()` | Updates trace properties only | **Fastest** | Grid visibility, legend toggles |

### Current Usage Pattern

**Full refresh (`DATA_CHART_REFRESH` → `Plotly.react()`)** is triggered by:

- `placeZerosBelowFloor` toggle (chart_tab)
- Aggregation type changes (series_tab)
- Trace style changes - marker size, color, line width (series_tab)
- Series name changes (series_tab)
- Data entry/import
- Cut line changes

**Efficient updates (`Plotly.restyle()`)** are used for:

- Grid visibility toggles (`grid.js`)
- Legend item visibility (`customLegend.js`)

**Layout-only updates (`Plotly.relayout()`)** are used for:

- Celeration fan toggle (`celerationFan.js`)
- Phase/aim/cel line drawing

## The Core Question

When a setting changes (e.g., `placeZerosBelowFloor`), do we need to:

1. **Recalculate** the data? (frequencies, aggregations)
2. **Rebuild** the trace objects? (Plotly trace configs)
3. **Re-render** the chart? (Plotly API call)

Currently, most changes do all three via the nuclear option: `DATA_CHART_REFRESH`.

## Specific Examples

### 1. Place Zeros Below Floor Toggle

**Current:** Full refresh - recalculates all frequencies, rebuilds all traces, calls `Plotly.react()`

**Could be:** Just update y-values of existing traces via `Plotly.restyle(chartDiv, { y: newYValues }, traceIndices)`

**Challenge:** Need to track which trace indices correspond to which series, and recalculate only the affected y-values.

### 2. Aggregation Type Change (Series Tab)

**Current:** Full refresh

**Could be:**
- If adding a new aggregation: `Plotly.addTraces()`
- If removing: `Plotly.deleteTraces()`
- If changing existing: `Plotly.restyle()` with new y-values

**Challenge:** Aggregation affects the number of points (grouped data), so trace length changes.

### 3. Marker/Line Style Changes

**Current:** Full refresh

**Could be:** `Plotly.restyle()` with style properties only - no data recalculation needed at all.

**Challenge:** Need to know trace indices.

## Architectural Questions

### 1. Trace Index Management

Currently, traces are rebuilt on every refresh with no persistent identity. To use `Plotly.restyle()`, we need to know which trace index corresponds to which series/aggregation combo.

**Options:**
- Store trace indices in `chartState` after each render
- Use `trace.meta` to find traces by querying `chartDiv.data`
- Maintain a trace registry that survives refreshes

### 2. Granular Event System

Currently `DATA_CHART_REFRESH` is a catch-all. Could introduce more specific events:

```javascript
EVENTS.TRACE_STYLE_CHANGED    // → Plotly.restyle() for style props only
EVENTS.TRACE_DATA_CHANGED     // → Plotly.restyle() for y-values only
EVENTS.TRACE_ADDED            // → Plotly.addTraces()
EVENTS.TRACE_REMOVED          // → Plotly.deleteTraces()
EVENTS.FULL_REFRESH           // → Plotly.react() (nuclear option)
```

### 3. Dirty Tracking

Track what specifically changed and choose the minimal update path:

```javascript
// Example dirty flags
chartState._dirty = {
    frequencies: false,      // Need to recalculate count/timing → frequency
    aggregations: false,     // Need to re-aggregate (median, mean, etc.)
    traceStyles: false,      // Just marker/line properties changed
    traceCount: false,       // Number of traces changed (add/remove agg)
    layout: false            // Shapes, annotations, axes changed
};
```

### 4. Incremental Updates vs. Simplicity

The current architecture is simple: any change → full refresh. It's slow but predictable and bug-resistant.

Incremental updates are faster but:
- More complex code paths
- More potential for state desync (traces don't match chartState)
- More edge cases to handle

**Is the complexity worth it?**

## Proposed Refactoring Path

### Phase 1: Style-Only Updates (Low Risk)

For changes that don't affect data (marker color, size, line width):
- Query `chartDiv.data` using `trace.meta.seriesName` to find indices
- Call `Plotly.restyle()` with only the changed style properties
- Skip frequency recalculation entirely

### Phase 2: Y-Value Updates (Medium Risk)

For changes that affect y-values but not trace count (placeZerosBelowFloor, timing changes):
- Recalculate frequencies
- Find trace indices via meta
- Call `Plotly.restyle(chartDiv, { y: newY }, indices)`

### Phase 3: Trace Management (Higher Risk)

For changes that add/remove traces (aggregation type changes):
- Track trace indices persistently
- Use `Plotly.addTraces()` / `Plotly.deleteTraces()`
- Fall back to full refresh if state gets confused

## Questions for Decision

1. **Is the current lag acceptable?** For most users with <500 points, full refresh is fine. Is optimizing for 2000+ point charts worth the added complexity?

2. **Should we debounce instead?** A 100ms debounce on `DATA_CHART_REFRESH` would prevent rapid successive refreshes without architectural changes.

3. **Is Phase 1 (style-only updates) sufficient?** This gives the biggest UX win (instant style changes) with minimal risk.

4. **How do we handle state desync?** If incremental updates get out of sync, we need a way to detect and recover (force full refresh).
