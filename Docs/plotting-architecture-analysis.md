# Plotting Architecture Analysis

## Overview

This report examines the files involved in plotting data to the SCC chart, their interactions, code quality, and opportunities for consolidation.

---

## Files Involved in Plotting

| File | Purpose | Lines |
|------|---------|-------|
| `series/tracePipeline.js` | Core trace building, frequency calculation, segmentation | ~510 |
| `series/replot.js` | Orchestrates chart refresh, coordinates trace creation | ~120 |
| `series/dataEntry.js` | Form submission, appends data to chartState | ~250 |
| `series/traceStyles.js` | Trace appearance config, UI ↔ state sync | ~270 |
| `series/miscSeries.js` | Dynamic misc series management | ~150 |
| `chartState.js` | Centralized state (series data, styles, config) | ~200 |
| `util/agg.js` | Aggregation functions (median, mean, min, max, etc.) | ~100 |
| `util/dates.js` | Date math, timestamp ↔ X-position conversion | ~400 |
| `util/plotlyWrapper.js` | Wrapped Plotly operations with event emission | ~80 |

**Total: 9 files, ~2,080 lines**

---

## Data Flow

```
User submits form (dataEntry.js)
         │
         ▼
chartState.series arrays updated
         │
         ▼
eventBus.emit(DATA_CHART_REFRESH)
         │
         ▼
replot.js → refreshChart()
         │
         ├─► tracePipeline.js → createFrequencyTraces()
         │         │
         │         ├─► dates.js (timestampsToXPositions)
         │         ├─► agg.js (applyAggregation)
         │         └─► traceStyles (config from chartState)
         │
         └─► Plotly.react() renders traces
```

---

## Code Quality Assessment

### Strengths

1. **Clean state centralization** - `chartState.js` provides a single source of truth with frozen default configs

2. **Event bus pattern** - Consistent use across all data modules prevents circular dependencies

3. **Aggregation pipeline** - Well-abstracted with modular functions (`median`, `mean`, `min`, `max`, etc.)

4. **Segmentation logic** - Clean handling of line cuts splitting traces into segments

5. **Plotly wrapper** - Good abstraction for reliable event signaling

### Issues

1. **High duplication (~25%)** - Identical loop patterns repeat across series types

2. ~~**Fragmented config structures**~~ - **FIXED**: All series now use standardized property names defined in `config.js`:
   - `markerSize` - Size of marker or text
   - `markerColor` - Primary color (fill for markers, color for text)
   - `markerEdgeColor` - Outline color
   - `markerSymbol` - Shape

3. ~~**Date conversion duplicated**~~ - **FIXED**: `dataEntry.js` now imports `dateToXPosition` from `dates.js`

4. **Magic numbers without constants** - Permanent trace count (7) hardcoded in replot.js

5. **Auto-aggregation side effects** - `_autoAggNotified` tracking feels hacky

---

## Low-Hanging Fruit for Code Reduction

### 1. Consolidate Floor Trace Functions

**Current:** Three nearly identical functions (30 lines)
```javascript
function correctsFloorTrace(x, y, config) {
    const trace = correctsTrace(x, y, config);
    trace.mode = trace.mode.replace('lines+', '').replace('+lines', '');
    trace.showlegend = false;
    return trace;
}
// Repeated for errorsFloorTrace, miscFloorTrace
```

**Proposed:** Single generic function (5 lines)
```javascript
function createFloorShadowTrace(baseTraceFunction, x, y, config) {
    const trace = baseTraceFunction(x, y, config);
    trace.mode = trace.mode.replace('lines+', '').replace('+lines', '');
    trace.showlegend = false;
    return trace;
}
```

**Savings:** ~25 lines

### 2. Extract Unified Frequency Calculation

**Current:** Same floor/frequency logic repeated 4+ times across tracePipeline.js (lines 243-298)

**Proposed:** Single `buildFrequencyArrays(countArray, timingMinutes)` function returning `{ main, floor }`

**Savings:** ~50 lines → ~25 lines

### 3. Remove Duplicated Date Conversion

**Current:** `dataEntry.js` (lines 175-202) reimplements `dateToXPosition()` locally

**Proposed:** Import from `dates.js` instead

**Savings:** ~30 lines

### 4. Merge Trace Creation Loops

**Current:** `createFrequencyTraces()` and `createFloorShadowTraces()` have identical iteration patterns

**Proposed:** Single `createTracesForSeries(frequencies, traceTemplateMap, segmentOptions)` function

**Savings:** ~60 lines

### 5. Extract Misc Input Generator Utility

**Current:** `dataEntry.js` and `dataUpdate.js` generate nearly identical misc series inputs

**Proposed:** Shared utility function

**Savings:** ~30 lines

**Total potential reduction: ~150-200 lines (7-10%)**

---

## File Reduction Opportunities

### Immediate Merges (Low Risk)

| Current | Proposed | Rationale |
|---------|----------|-----------|
| None recommended | — | Current file separation follows logical boundaries |

### Future Refactoring (Medium Risk)

**Split `tracePipeline.js` into three focused modules:**

```
tracePipeline/
├── frequency.js      # Frequency calculation, floor logic
├── segmentation.js   # Line cut segmentation
└── builders.js       # Trace template functions
```

This would **increase** file count but **improve** maintainability by separating concerns.

### Not Recommended

Merging files like `replot.js` + `tracePipeline.js` or `traceStyles.js` + `chartState.js` would create bloated files with mixed responsibilities.

---

## Recommendations

### Phase 1: Quick Wins (< 1 day)

1. ✅ Consolidate 3 floor trace functions → 1 generic
2. ✅ Extract `calculateAllFrequencies()` function
3. ✅ Remove `dateToXPosition()` from dataEntry.js, import from dates.js
4. ✅ Add named constants for magic numbers

### Phase 2: Medium Effort (2-3 days)

1. Introduce `TRACE_CONFIG_SPEC` mapping to eliminate series-specific if/else blocks
2. Merge floor and main trace creation into generic loop
3. Extract misc input generation utility

### Phase 3: Major Cleanup (1 week)

1. Split tracePipeline.js into focused sub-modules
2. Standardize trace config property names across all series types
3. Add test suite for tracePipeline.js

---

## Conclusion

The plotting codebase is **moderately clean** with good architectural patterns (event bus, centralized state, separation of concerns) but suffers from **significant duplication** in loop patterns and series-specific handling.

**File count is appropriate** - the current 9 files represent logical boundaries. Reducing file count would harm readability.

**Code reduction opportunity: 150-200 lines (7-10%)** through consolidating duplicate patterns, primarily in tracePipeline.js and traceStyles.js.

The most impactful improvement would be introducing a data-driven approach to trace configuration that eliminates the per-series-type conditionals scattered throughout the codebase.
