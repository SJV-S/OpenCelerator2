# Codebase Modularity Survey

This document provides a comprehensive analysis of the SCC application's JavaScript modularity, examining module structure, coupling patterns, event-driven architecture, and code organization.

---

## Executive Summary

The SCC codebase demonstrates **excellent modularity** with a well-implemented event-driven architecture. Key strengths include centralized state management, consistent pub/sub patterns, and clean layer separation. Minor improvements are possible in utility extraction and error boundaries.

| Aspect | Rating | Notes |
|--------|--------|-------|
| Module Structure | ★★★★★ | Clean ES6 imports/exports throughout |
| Event Bus Usage | ★★★★★ | 47 events, all properly subscribed |
| State Management | ★★★★☆ | Centralized, occasional direct mutation |
| Coupling | ★★★★☆ | Mostly loose, some justified tight coupling |
| File Organization | ★★★★★ | Logical directory structure |
| Code Reuse | ★★★★☆ | Good abstractions, minor duplication |
| Initialization | ★★★★★ | Clean ordered startup flow |

---

## 1. Module Structure & Import/Export Patterns

### Two-Tier Architecture

The codebase follows ES6 module standards with centralized dependencies:

```
           ┌─────────────┐
           │  eventBus   │ ← All 45+ modules depend on this
           └─────────────┘
                 │
    ┌────────────┼────────────┐
    ▼            ▼            ▼
┌────────┐  ┌─────────┐  ┌────────┐
│ config │  │chartState│  │ utils  │
└────────┘  └─────────┘  └────────┘
```

### Import Pattern: Explicit & Consistent

All modules use explicit ES6 imports at file top:

```javascript
// From main.js
import { chartState } from './chartState.js';
import { eventBus, EVENTS } from './eventBus.js';
import { submitEntry, init as dataEntryInit } from './series/dataEntry.js';
```

### Export Pattern: Named Exports with Init Convention

- **Named exports**: Modules export specific functions (`export { refreshChart, init }`)
- **Init convention**: Modules export `init()` for event subscription registration
- **No barrel exports**: Each module explicitly exports what it provides

---

## 2. Layer Architecture

### Layer 1: Core (Foundation)

| Module | Purpose | Lines |
|--------|---------|-------|
| `chartState.js` | Single source of truth for all data | 241 |
| `eventBus.js` | Pub/sub system with 47 named events | 150 |
| `config.js` | Colors, limits, timing constants | 200 |

### Layer 2: Utilities (Reusable)

| Module | Purpose |
|--------|---------|
| `util/dates.js` | Date conversions, timestamp handling |
| `util/toaster.js` | Notifications and dialogs |
| `util/agg.js` | Aggregation functions (mean, median, etc.) |
| `util/plotlyWrapper.js` | Surgical Plotly updates with events |
| `series/tracePipeline.js` | Data → Plotly trace creation |
| `series/traceStyles.js` | Visual style configuration |

### Layer 3: Feature Modules (Domain Logic)

| Directory | Modules | Responsibility |
|-----------|---------|----------------|
| `series/` | dataEntry, dataUpdate, replot, miscSeries | Data operations |
| `lines/` | phaseLines, aimLines, celLine, cutLines | Analytical line drawing |
| `misc/` | celerationFan, customLegend, grid, credit | Visual features |
| `storage/` | chartStorage | IndexedDB persistence |

### Layer 4: Application Root

| Module | Purpose |
|--------|---------|
| `main.js` | Entry point, startup orchestration, event listener setup |
| `navigation.js` | Tab switching, keyboard shortcuts, gestures |

---

## 3. Event Bus Architecture

### Event Catalog (47 Events)

```javascript
EVENTS = {
  // Data operations (6)
  DATA_ENTRY_SUBMITTED, DATA_CHART_REFRESH, DATA_REMOVED, ...

  // Line interactions (7)
  LINE_VISIBILITY_CHANGED, LINE_CLICK_PRIMARY, LINE_STYLE_CHANGED, ...

  // Drawing modes (8)
  MODE_PHASE_ACTIVATE, MODE_AIM_ACTIVATE, MODE_ALL_DEACTIVATE, ...

  // Navigation (4)
  NAV_TAB_CHANGED, NAV_COUNTER_TOGGLE, ...

  // Chart settings (3)
  CHART_TYPE_CHANGED, CHART_WINDOW_CHANGED, ...

  // Storage (4)
  STORAGE_SAVE_REQUESTED, STORAGE_LOAD_COMPLETED, ...

  // Plotly rendering (6)
  PLOTLY_RELAYOUT_COMPLETE, PLOTLY_REACT_COMPLETE, ...
}
```

### Event Flow Example: Data Entry → Chart Update

```
┌──────────────┐    emit(DATA_ENTRY_SUBMITTED)    ┌────────────┐
│ dataEntry.js │ ─────────────────────────────────▶│ eventBus   │
└──────────────┘                                   └─────┬──────┘
                                                         │
       ┌─────────────────────────────────────────────────┼────────┐
       │                                                 │        │
       ▼                                                 ▼        ▼
┌──────────────┐                                  ┌──────────┐  ┌────────────┐
│ replot.js    │ ← subscribes                     │storage.js│  │navigation.js│
│ refreshChart │                                  │ autoSave │  │updateCounter│
└──────────────┘                                  └──────────┘  └────────────┘
```

### Verification: No Dead Events

Every emitted event has corresponding subscribers:

| Event | Emitter | Subscriber(s) |
|-------|---------|---------------|
| `DATA_CHART_REFRESH` | dataEntry, dataUpdate | replot.js |
| `MODE_PHASE_ACTIVATE` | navigation | phaseLines.js |
| `MISC_SERIES_ADDED` | miscSeries | dataEntry.js |
| `LINE_VISIBILITY_CHANGED` | navigation | phaseLines, aimLines, cutLines |

---

## 4. State Management

### chartState Structure

```javascript
chartState = {
  // Identity
  id, chartType, minuteChart, chartName, tags

  // Raw data (append-only arrays)
  series: {
    xValues: [],
    corrects: [],
    errors: [],
    timing: [],
    misc: {}  // Dynamic series
  }

  // Chart dimensions
  chartCapacity, chartWindow

  // Visibility states
  lineVisibility: { phase, aim, change, grid }
  fanVisible, placeZerosBelowFloor

  // Line objects (analytical lines)
  PhaseLines: {}, AimLines: {}, CelLines: {}, LineCuts: {}

  // Styling
  lineStyles: { phase, aim, trend }
  traceStyles: { corrects, errors, timing, misc: {} }

  // Display
  credits, legend
}
```

### State Access Patterns

**Read access** (unrestricted, fine for immutable data):
```javascript
const chartType = chartState.chartType;
const corrects = chartState.series.corrects;
```

**Write access** (followed by event emission):
```javascript
// In dataEntry.js
chartState.series.xValues.push(timestamp);
chartState.series.corrects.push(value);
eventBus.emit(EVENTS.DATA_CHART_REFRESH);  // Always emit after mutation
```

### Observation

Direct mutations are acceptable because:
1. Mutations are always followed by appropriate events
2. All chart updates flow through `replot.js`
3. Storage auto-saves on `STATE_MUTATING` event category

---

## 5. Coupling Analysis

### Coupling Matrix

```
                 eventBus  chartState  config  dates  toaster
main.js            ●          ●          ●       ○       ●
dataEntry.js       ●          ●          ●       ●       ●
replot.js          ●          ●          ○       ●       ○
phaseLines.js      ●          ●          ●       ●       ●
aimLines.js        ●          ●          ●       ●       ●
customLegend.js    ●          ●          ●       ○       ○
chartStorage.js    ●          ●          ○       ○       ●

● = imports from   ○ = does not import
```

### Loosely Coupled (Good Design)

**Line drawing modules are independent:**
- `phaseLines.js` does not import `aimLines.js`
- `aimLines.js` does not import `phaseLines.js`
- Communication via `MODE_ALL_DEACTIVATE` event
- Each maintains own internal state

**Feature modules don't cross-import:**
- `navigation.js` has no imports from `series/` modules
- Uses events to trigger data operations

### Tightly Coupled (Justified)

**Data pipeline modules:**
```
replot.js ─────imports────▶ tracePipeline.js
    │                              │
    │                              ▼
    └──────imports──────▶ traceStyles.js
```
This coupling is necessary - these modules form a cohesive data processing unit.

**Line modules to allLines.js:**
```javascript
// phaseLines.js, aimLines.js both import from allLines.js
import { phaseLineMetadata, removeLine } from './allLines.js';
```
Shared metadata structure prevents duplication.

### main.js: Intentional Coordinator

`main.js` imports from 40+ modules by design:
- All imports are `init()` functions or setup functions
- No business logic in main.js
- Acceptable as application entry point

---

## 6. File Organization

### Directory Structure

```
static/SCC/
├── main.js                 # Entry point
├── eventBus.js             # Pub/sub system
├── chartState.js           # Global state
├── config.js               # Constants
├── debug.js                # Console debugging utilities
├── navigation.js           # UI state and gestures
│
├── series/                 # Data handling
│   ├── dataEntry.js        # Add new entries
│   ├── dataUpdate.js       # Edit/delete entries
│   ├── replot.js           # Chart refresh orchestration
│   ├── tracePipeline.js    # Trace generation
│   ├── traceStyles.js      # Style config UI
│   └── miscSeries.js       # Dynamic series management
│
├── lines/                  # Analytical lines
│   ├── lineClickHandler.js # Click dispatcher
│   ├── allLines.js         # Common metadata definitions
│   ├── phaseLines.js       # Phase line drawing
│   ├── aimLines.js         # Aim line drawing
│   ├── celLine.js          # Celeration line
│   └── cutLines.js         # Cut lines
│
├── misc/                   # Visual features
│   ├── celerationFan.js    # Fan visualization
│   ├── customLegend.js     # Legend rendering
│   ├── credit.js           # Credit text
│   ├── grid.js             # Grid lines
│   └── share.js            # Chart sharing
│
├── ui/                     # UI components (stateful, render UI)
│   ├── toaster.js          # Notifications and dialog system
│   ├── crosshair.js        # Cursor tracking with canvas
│   ├── startDateControls.js # Custom spinbox widgets
│   ├── tooltip.js          # Tooltip rendering
│   └── icons.js            # SVG icons + cursor utilities
│
├── import/                 # Data import feature
│   ├── dataImport.js       # Core import logic
│   ├── importUI.js         # Import tab UI
│   ├── openCeleratorImport.js # OpenCelerator format converter
│   └── jsonBackwardsCompatibility.js # Version compatibility
│
├── util/                   # True utilities (stateless, pure functions)
│   ├── agg.js              # Aggregation functions
│   ├── dates.js            # Date math (40+ functions)
│   ├── fit_lines.js        # Trend calculation
│   ├── format.js           # String formatting
│   ├── plotlyWrapper.js    # Surgical Plotly updates
│   ├── chartLayouts.js     # Chart layout templates
│   ├── resize-chart.js     # Responsive sizing
│   └── panning_controls.js # Pan constraints
│
├── storage/                # Persistence
│   └── chartStorage.js     # IndexedDB wrapper
│
├── tests/                  # Testing utilities
│   └── testMiscSeries.js
│
└── lib/                    # Third-party
    └── idb.js              # IndexedDB library
```

### Organization Quality

| Criterion | Assessment |
|-----------|------------|
| **Cohesion** | Related files grouped by domain (series, lines, misc, util) |
| **Naming** | Descriptive, consistent patterns (phaseLines, aimLines) |
| **File Size** | Most 300-1000 lines; utilities 50-200 lines |
| **Separation** | Clear distinction between features and utilities |

---

## 7. Code Reuse Patterns

### Well-Abstracted Utilities

**`util/agg.js`** - Aggregation functions:
```javascript
export { median, mean, min, max, first, last, sum, aggregateByX }
```
- Single responsibility
- Used by tracePipeline.js

**`util/dates.js`** - Date operations:
```javascript
export { parseLocalDate, alignStartDate, timestampsToXPositions, xPositionToDate, ... }
```
- 40+ functions centralized
- Called from 5+ modules

**`util/plotlyWrapper.js`** - Plotly abstraction:
```javascript
export async function relayout(chartDiv, updates)
export async function react(chartDiv, data, layout)
```
- Encapsulates Plotly API
- Emits events on render completion

### Identified Duplication

**Shape removal pattern** (appears in 3 modules):

```javascript
// phaseLines.js, aimLines.js, cutLines.js - nearly identical:
function removeShapes(chartDiv) {
    let currentShapes = chartDiv.layout.shapes || [];
    indicesToRemove.forEach(index => currentShapes.splice(index, 1));
    Plotly.relayout(chartDiv, { shapes: currentShapes });
}
```

**Impact**: ~40 lines of duplication
**Recommendation**: Extract to `util/plotlyWrapper.js`

---

## 8. Initialization Flow

### Startup Sequence

```javascript
// main.js - DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', () => {

    // PHASE 1: Register event subscriptions (ORDER MATTERS)
    lineClickHandlerInit();
    dataEntryInit();
    replotInit();           // Must subscribe before DATA_CHART_REFRESH
    dataUpdateInit();
    navigationInit();
    phaseLinesInit();       // Must subscribe before MODE events
    aimLinesInit();
    cutLinesInit();
    celLineInit();
    customLegendInit();
    crosshairInit();
    celerationFanInit();
    creditInit();

    // PHASE 2: Initialize storage
    initStorage().then(success => { ... });

    // PHASE 3: Initialize UI components
    initGestureNavigation();
    initFormKeyboardShortcuts();
    initializeShareTab();
    initImportUI();
    initializeAllSeriesInputs();

    // PHASE 4: Trigger initial chart render
    initializeChart();  // This emits DATA_CHART_REFRESH
});
```

### Critical Design: Subscriptions First

```
┌────────────────────┐
│ Register all       │
│ subscribers        │──▶ All modules ready to receive events
└────────────────────┘
          │
          ▼
┌────────────────────┐
│ initializeChart()  │──▶ Emits DATA_CHART_REFRESH
└────────────────────┘
          │
          ▼
┌────────────────────┐
│ All subscribers    │──▶ Chart renders correctly
│ respond            │
└────────────────────┘
```

**Result**: No race conditions, no missed events.

---

## 9. Improvement Opportunities

### Priority 1: Extract Shape Removal Utility

**Current state**: 3 modules duplicate shape removal logic

**Proposed addition to `util/plotlyWrapper.js`**:
```javascript
export async function removeShapesByIndices(chartDiv, indices) {
    const shapes = [...(chartDiv.layout.shapes || [])];
    indices.sort((a, b) => b - a).forEach(i => shapes.splice(i, 1));
    await relayout(chartDiv, { shapes });
}
```

**Impact**: Eliminates ~40 lines of duplication

### Priority 2: Add Event Error Boundaries

**Current state**: Errors in one subscriber could affect propagation

**Proposed improvement to `eventBus.js`**:
```javascript
emit(event, data = null) {
    for (const { callback, hasData } of subscribers) {
        try {
            result = hasData ? callback(data) : callback();
        } catch (error) {
            console.error(`Error in ${event} subscriber:`, error);
            // Continue to next subscriber
        }
    }
}
```

**Impact**: Prevents cascade failures, improves robustness

### Priority 3: Extract Line Drawing Base Class

**Current state**: `phaseLines.js` (991 lines) and `aimLines.js` (973 lines) share patterns:
- Mode activation/deactivation
- Click coordinate conversion
- Temporary shape management
- Text input dialog flow

**Proposed abstraction**:
```javascript
class LineDrawingMode {
    activate(mode) { /* common setup */ }
    deactivate() { /* common teardown */ }
    addTempShape(shape) { /* manage indices */ }
    handleClick(e) { /* common coordinate conversion */ }
}
```

**Impact**: Could reduce ~300 lines, clearer structure

### Priority 4: Document State Mutation Paths

**Recommendation**: Add state mutation map showing:
- Which functions can mutate chartState
- What events trigger mutations
- Mutation → event flow for each operation

---

## 10. Conclusion

### Strengths

1. **Event-Driven Architecture**: 47 well-organized events with no dead subscriptions
2. **Centralized State**: Single `chartState` object prevents scattered state
3. **Clean Layer Separation**: Core → Utilities → Features → Application
4. **Independent Feature Modules**: Line modules don't cross-import
5. **Ordered Initialization**: Subscription-first prevents race conditions
6. **Excellent Utility Abstraction**: Date, aggregation, and Plotly logic centralized

### Weaknesses

1. **Minor Code Duplication**: Shape removal in 3 modules
2. **Large Feature Modules**: Phase/aim lines ~1000 lines each
3. **No Error Boundaries**: Event chain could break on subscriber error
4. **Undocumented Mutation Paths**: State changes not formally mapped

### Overall Assessment

The SCC codebase is **well-modularized and production-ready**. The event-driven architecture successfully avoids tight coupling while maintaining clear data flow. The identified improvements are optimizations rather than architectural fixes - the foundation is solid.

---

*Survey conducted: 2026-02-01*
