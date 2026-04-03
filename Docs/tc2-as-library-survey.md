# TC2 as a Charting Library — Feasibility Survey

## Goal

Use TC2 as a dependency in another application (a flashcard app) to generate Standard Celeration Charts. The flashcard app would copy TC2's charting engine the same way TC2 copies Plotly.js — as a library, not a service.

---

## Architecture Summary

TC2 is a browser-based behavioral data visualization tool. Flask serves static HTML; **all chart logic is client-side ES6 JavaScript**. The Flask server is a zero-knowledge encrypted storage layer — it never sees plaintext data, never processes charts, never renders anything.

The charting engine and the application UI are conceptually separate but not yet separated in code. There is no public API entry point.

---

## The Engine (What the Flashcard App Needs)

These files contain the charting logic with minimal or no DOM coupling:

| File | Role | External Dependencies |
|------|------|-----------------------|
| `config.js` | All constants, chart type config, defaults | None |
| `chartState.js` | Mutable state container | config.js |
| `eventBus.js` | Pub/sub communication | None |
| `util/agg.js` | Pure math: median, mean, rolling window, etc. | None |
| `util/format.js` | Value formatting, missing-data sentinel | config.js |
| `series/tracePipeline.js` | Data → Plotly traces (frequencies, aggregation, segmentation) | chartState, config, agg, format |
| `util/chartLayouts.js` | Plotly layout templates per chart type | chartState |
| `util/plotlyWrapper.js` | Thin Plotly wrapper + event emission | eventBus |
| `util/resize-chart.js` | Responsive chart scaling | config, chartState, eventBus, plotlyWrapper |
| `util/dates.js` | Timestamp ↔ X-position conversion | chartState, config (also has some DOM touches) |

### Pure computation (no DOM, no side effects)

- **`tracePipeline.js`** — the core. `calculateFrequencies()`, `applyAggregation()`, `applyRollingWindow()`, `createSegments()`, and all trace builder functions (`correctsTrace`, `errorTrace`, `miscTrace`, `timingFloorTrace`). Reads `chartState` but returns plain objects.
- **`agg.js`** — fully pure math functions.
- **`format.js`** — pure formatting utilities.
- **`config.js`** — static constants (one `isMobile()` function reads `window.innerWidth`).

---

## The Application (What the Flashcard App Does NOT Need)

| File/Area | What it does |
|-----------|-------------|
| `main.js` | Wires up all 7 sidebar tabs, form listeners, keyboard shortcuts, icon injection |
| `series/traceStyles.js` | Series config UI (form inputs, nav tabs) |
| `series/dataEntry.js` | Data entry form submission |
| `navigation.js` | Tab switching, counter overlay |
| `lines/*.js` | Interactive line drawing tools (phase, aim, cut, celeration) |
| `storage/chartStorage.js` | IndexedDB persistence |
| `ui/toaster.js`, `ui/crosshair.js` | Toast notifications, cursor tracking |
| `import/dataImport.js` | Spreadsheet import wizard |
| `import/openCeleratorImport.js` | OpenCelerator JSON import |
| All of `templates/` | TC2's HTML scaffold |
| `app.py` | Flask server, sync, sharing |

---

## What Blocks Copy-Paste Usage Today

### 1. No public entry point

The closest thing to `renderChart()` is `main.js:initializeChart()`, but it mixes engine calls with full UI setup (form listeners, icons, keyboard shortcuts). You can't call it without the TC2 HTML scaffold.

### 2. Singleton `chartState`

All pipeline functions read from the global `chartState` object rather than accepting data as arguments:

```javascript
// Current: reads global singleton
export function calculateFrequencies(sort) {
    const { corrects, errors, timing } = chartState.series;
    // ...
}

// Needed: accepts data as parameter
export function calculateFrequencies(series, chartType, minuteChart, options) {
    const { corrects, errors, timing } = series;
    // ...
}
```

### 3. `replot.js` couples rendering to DOM and events

`refreshChart()` calls `getChartDiv()` (which does `document.getElementById('chart')`), auto-mutates `chartState.traceStyles`, and emits events expecting UI subscribers to exist.

### 4. `dates.js` mixes pure date math with DOM updates

`timestampsToXPositions()` is pure, but it lives alongside `updateChartDateLabels()` which manipulates Plotly annotations directly.

---

## Desired API for the Flashcard App

```javascript
import { createChart } from 'tc2-engine';

// Initialize
const chart = createChart(document.getElementById('my-div'), {
    chartType: 'Daily',
    minuteChart: true,
    series: {
        xValues: [1708456000, 1708542400, 1708628800],
        corrects: [42, 38, 45],
        errors: [2, 5, 1],
        timing: [1.5, 2.0, 1.75],
        misc: {}
    }
});

// Add data later
chart.addPoint({ timestamp: 1708715200, corrects: 50, errors: 0, timing: 1.0 });
chart.render();

// Reconfigure
chart.setOption('placeZerosBelowFloor', false);
chart.render();
```

---

## Data Shape Reference

### Minimum input to create a chart

```javascript
{
    chartType: 'Daily',        // Daily | Weekly | Monthly | Yearly | FrequencyCollections
    minuteChart: true,         // true = responses/minute, false = raw counts
    series: {
        xValues: [...],        // Unix timestamps in seconds
        corrects: [...],       // integers or null (null = no observation)
        errors: [...],         // integers or null
        timing: [...],         // float minutes (minute charts) or omit (count charts default to 1)
        misc: {                // optional, up to 10 additional named series
            misc1: [...],
            misc2: [...]
        }
    }
}
```

### Flashcard app mapping

| TC2 Series | Flashcard Meaning |
|-----------|-------------------|
| `corrects` | Cards answered correctly |
| `errors` | Cards answered incorrectly |
| `timing` | Session duration (minutes) |
| `misc1` | Cards reviewed |
| `misc2` | New cards introduced |

### Chart types

| Type | Capacity | Y Range | Unit | Best for |
|------|----------|---------|------|----------|
| Daily | 280 | 0.69–1M | 7 days | Per-session tracking |
| Weekly | 200 | 0.001–1K | 5 weeks | Weekly rollups |
| Monthly | 240 | 0.001–1K | 6 months | Monthly rollups |
| Yearly | 200 | 0.001–1K | 5 years | Long-term trends |

---

## Rendering Pipeline (What Happens Inside)

```
Raw data (counts + timing per session)
    │
    ▼
calculateFrequencies()
    freq = count / timing (minute charts)
    freq = count (count charts)
    Handle zeros, floor thresholding
    │
    ▼
applyAggregation()                          ← per-position: raw/mean/median/sum/etc.
    │
    ▼
applyRollingWindow()                        ← cross-position: rolling mean/median
    │
    ▼
createSegments()                            ← split by cut lines
    │
    ▼
correctsTrace() / errorTrace() / miscTrace()  ← build Plotly trace objects
    │
    ▼
Plotly.react(div, traces, layout, config)   ← render
```

All steps above `Plotly.react()` are pure computation. The Plotly call is the only DOM-touching step.

---

## Refactor Plan to Enable Library Use

### Create one new file: `engine.js` (the facade)

This file would:

1. **Accept** a DOM element + options object (chart type, data, styling)
2. **Create** a local chart state from options (not the singleton)
3. **Call** `getTemplate()` + `resizeChartByHeight()` to build the Plotly layout
4. **Call** `tracePipeline` functions to build traces from the provided data
5. **Call** `Plotly.newPlot()` / `Plotly.react()` on the provided element
6. **Return** an object with `addPoint()`, `render()`, `setOption()`, `destroy()` methods

### Modify pipeline functions to accept state as a parameter

The core change: functions that currently do `chartState.series.corrects` would instead receive the state object as an argument. This is a find-and-replace level change — the function signatures grow by one parameter, and internal references change from `chartState.foo` to `state.foo`.

Affected functions:
- `tracePipeline.calculateFrequencies()`
- `tracePipeline.createFrequencyTraces()`
- `tracePipeline.createTimingTraces()`
- `tracePipeline.createFloorShadowTraces()`
- `dates.timestampsToXPositions()`
- `dates.alignStartDate()`

### Split `dates.js`

Separate pure date math (`timestampsToXPositions`, `alignStartDate`, `snapToChartBoundary`) from DOM-touching functions (`updateChartDateLabels`, `updateDateDisplay`). The engine only needs the pure functions.

### No changes needed to

- `config.js` — already standalone
- `agg.js` — already pure
- `format.js` — already pure
- `eventBus.js` — already standalone
- `chartLayouts.js` — already returns plain objects
- `plotlyWrapper.js` — already takes chartDiv as parameter

---

## Files to Copy to the Flashcard App

After the refactor, the flashcard app would copy this set:

```
tc2-engine/
├── engine.js              ← NEW: public API facade
├── config.js
├── chartState.js          ← used internally by engine.js
├── eventBus.js
├── util/
│   ├── agg.js
│   ├── format.js
│   ├── chartLayouts.js
│   ├── resize-chart.js
│   ├── dates.js           ← pure functions only (split)
│   └── plotlyWrapper.js
└── series/
    └── tracePipeline.js
```

Plus Plotly.js as a peer dependency (same as TC2 uses it today).

---

## First Implementation Attempt — What Went Wrong

`engine.js` was created and the files were copied to the flashcard app. The facade API was correct. But the underlying refactor described above was not completed properly, leaving a class of silent bugs throughout the pipeline.

### The pattern: fake dependency injection

Functions were given `state = chartState` signatures to look like they support passing local state:

```javascript
export function calculateFrequencies(sort = (arr) => arr, state = chartState) { ... }
```

But the function bodies were not updated — they still read from `chartState` directly:

```javascript
function dateToXPosition(date, state = chartState) {
    const chartType = (chartState.chartType || 'Daily').toLowerCase();  // ← ignores `state`
    const startDate = parseLocalDate(chartState.startDate);             // ← ignores `state`
}
```

This means `engine.js` could pass a local state object all the way down the call chain, but the state would be silently discarded partway through — with no error and no indication anything was wrong.

### Affected functions

- **`dates.dateToXPosition()`** — accepts `state`, ignores it entirely in the body. Since `timestampsToXPositions()` calls this internally, x-position calculation always reads the global singleton regardless of what was passed in.
- **`tracePipeline` functions** — signatures accept `state`, but the global `chartState` import remains active and some reads still target it directly.
- **`resize-chart.resizeChartByHeight()`** — no state parameter at all. Reads `chartState.id` and `chartState.chartWindow` unconditionally.

### Consequence

For a single chart on an otherwise empty page the implementation works fine. The global `chartState` happens to contain the right values. But the isolation promised by `engine.js` does not actually exist — any scenario with multiple chart instances, or a host app that also writes to `chartState`, will produce wrong x-positions and layout calculations with no visible error.

### What the refactor actually requires

Adding a `state` parameter to a function signature is not the refactor. The refactor is replacing every `chartState.foo` reference inside the function body with `state.foo`. Both steps are required.

---

## Open Questions

- **Line overlays**: Should the library API support adding phase/aim/celeration lines programmatically, or is that TC2-application-only? The flashcard app may want celeration trend lines without the interactive drawing UI.
- **Theming**: Should the facade accept style overrides (colors, marker symbols), or should the flashcard app just modify `traceStyles` in the options?
- **Image export**: Plotly's `downloadImage()` works client-side. Should the facade expose a `toImage()` method?
- **Bundle size**: `chartLayouts.js` is ~300KB of static layout templates. Could be trimmed if the flashcard app only uses one or two chart types.
