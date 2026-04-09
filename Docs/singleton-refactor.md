# SCC Singleton Refactor

## Goal

Eliminate the two module-level singletons — `eventBus` (from `eventBus.js`) and `chartState` (from `chartState.js`) — from every module in `static/SCC/`. Replace them with per-instance factory functions so that multiple `SCCChart` instances can coexist on a page and `destroy()` cleanup works correctly.

## The Pattern

**Before:**
```js
// chartState.js
export const chartState = { series: {...}, CelLines: {}, ... };

// someModule.js
import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';

let myLocalState = 'initial';

eventBus.subscribe(EVENTS.SOMETHING, () => { ... chartState.foo ... });
export function doThing() { ... chartState.foo ... eventBus.emit(...) ... }
```

**After:**
```js
// chartState.js
export function createChartState() { return { series: {...}, CelLines: {}, ... }; }

// someModule.js
import { EVENTS } from '../eventBus.js';

export function createSomeModule(bus, state) {
    let myLocalState = 'initial';   // closure, not module-level

    bus.subscribe(EVENTS.SOMETHING, () => { ... state.foo ... });

    function doThing() { ... state.foo ... bus.emit(...) ... }

    return { doThing };
}
```

**Rules:**
- Module-level `let`/`var` state → factory closure
- `chartState.X` → `state.X`
- `eventBus.emit/subscribe` → `bus.emit/bus.subscribe`
- Top-level `eventBus.subscribe()` calls (outside any function) → must move inside the factory body
- `EVENTS` stays as a named module-level export from `eventBus.js` — it is static, not instance-specific
- Pure stateless helpers (pure functions, constants) may stay at module level

## Supporting Documents

- `Docs/modularity-survey.md` — original survey of module dependencies and coupling
- `Docs/plotting-architecture-analysis.md` — data flow overview
- `Docs/EVENT_BUS_GUIDE.md` — event bus usage patterns
- `CLAUDE.md` in the project root — architecture rules, Plotly shape update rules, JS module rules

## What Has Been Done

### Phase 1 — Foundation
| File | Change |
|------|--------|
| `eventBus.js` | Removed singleton `export const eventBus`. Added `clear()` method. `EventBus` class + `EVENTS` + `EVENT_CATEGORIES` remain as named exports. |
| `chartState.js` | Replaced `export const chartState = {...}` with `export function createChartState() { return {...} }` |

### Phase 2 — UI & Series Modules
| File | Factory signature |
|------|-------------------|
| `ui/tooltip.js` | `createTooltip()` |
| `series/miscSeries.js` | `createMiscSeries(bus, state)` |
| `series/tracePipeline.js` | `createTracePipeline(state)` — pure trace functions stay at module level |
| `ui/celSettingsModal.js` | `createCelSettingsModal(bus, state)` |
| `ui/lineEditorFactory.js` | `createLineEditor(bus, state, config)` — `buildLabelSection(state, stateKey)` signature change |
| `ui/celLineEditor.js` | `createCelLineEditor(bus, state)` |
| `ui/phaseLineEditor.js` | `createPhaseLineEditor(bus, state)` |
| `ui/aimLineEditor.js` | `createAimLineEditor(bus, state)` |
| `series/grid.js` | `createGrid(bus, state, plotlyWrapper)` |
| `ui/panSlider.js` | `createPanSlider(bus, state, plotlyWrapper)` |
| `util/panning_controls.js` | `createPanningControls(bus, state, plotlyWrapper)` |
| `ui/customLegend.js` | `createCustomLegend(bus, state, plotlyWrapper)` |
| `ui/startDateModal.js` | `createStartDateModal(bus, state)` — named handlers for stable `removeEventListener` refs |
| `ui/celerationFan.js` | `createCelerationFan(bus, state, plotlyWrapper)` — `generateFanElements` stays at module level as pure export |
| `lines/lineHover.js` | `createLineHover(bus, state, plotlyWrapper, celSettingsModal)` |

### Phase 3 — Settings & Styles
| File | Factory signature |
|------|-------------------|
| `ui/lineSettingsModal.js` | `createLineSettingsModal(celSettingsModal)` — delegates `cel` category to `celSettingsModal.showCelSettingsModal()` |
| `series/traceStyles.js` | `createTraceStyles(bus, state, miscSeries)` — 4 top-level `eventBus.subscribe()` calls moved inside factory; `truncateTabName` and `isMiscSeries` stay at module level |

### Phase 4 — Lines & Replot
| File | Factory signature |
|------|-------------------|
| `lines/allLines.js` | `createAllLines(bus, state, lineSettingsModal)` |
| `series/replot.js` | `createReplot(bus, state, tracePipeline, traceStyles)` |

### Phase 5 — Line Drawing Modes
| File | Factory signature |
|------|-------------------|
| `lines/lineClickHandler.js` | `createLineClickHandler(bus, state, allLines, celLineEditor, phaseLineEditor, aimLineEditor)` |
| `lines/cutLines.js` | `createCutLines(bus, state)` |
| `lines/phaseLines.js` | `createPhaseLines(bus, state, allLines)` — `roundHorizontalX` moved inside factory; `buildPhaseLineElements`, `roundYValue`, `getPhaseStepText` stay at module level |
| `lines/aimLines.js` | `createAimLines(bus, state, allLines)` — same pattern |
| `lines/celLine.js` | `createCelLines(bus, state, traceStyles, celSettingsModal)` — `getCelLineColor`, `buildCelLineElements`, DOM overlay helpers stay at module level |

## What Remains

### Still importing singletons (16 files)

These files still contain `import { chartState }` and/or `import { eventBus, EVENTS }` with the old singleton. Each needs the same factory treatment.

| File | Likely factory signature | Notes |
|------|--------------------------|-------|
| `series/dataEntry.js` | `createDataEntry(bus, state)` | Form submission, data append |
| `series/dataUpdate.js` | `createDataUpdate(bus, state)` | Unknown — read before writing |
| `import/dataImport.js` | `createDataImport(bus, state)` | Import pipeline |
| `import/importUI.js` | `createImportUI(bus, state, dataImport)` | Import UI |
| `storage/chartStorage.js` | `createChartStorage(bus, state)` | Large — IDB persistence, save/load |
| `navigation.js` | `createNavigation(bus, state)` | Tab switching, keyboard shortcuts |
| `ui/credit.js` | `createCredit(bus, state)` | Small |
| `ui/crosshair.js` | `createCrosshair(bus, state)` | Small |
| `ui/resetSettings.js` | `createResetSettings(bus, state)` | Small |
| `ui/share.js` | `createShare(bus, state)` | Small |
| `util/dates.js` | Probably just remove `chartState` reads, thread `state` as a param to the few functions that need it | Check which functions actually use `chartState` |
| `util/plotCoordinates.js` | Same — likely just a few reads | Check first |
| `util/resize-chart.js` | `createResizeChart(bus, state, plotlyWrapper)` | Medium |
| `chartPage.js` | Entry point — composes all factories | Read carefully |
| `main.js` | Entry point / `ChartController` class | Composes everything, calls `init()` on all modules |
| `debug.js` | Trivial — update `window.chartState` reference to receive `state` instance | One exception to "no window" rule per CLAUDE.md |

### Final Phase — Entry Point Wiring

`main.js` (or `chartPage.js`) becomes the composition root. It:

1. Calls `createChartState()` and `new EventBus('SCC')` to get per-instance `state` and `bus`
2. Instantiates every factory in dependency order, passing `bus` and `state` plus any peer dependencies
3. Calls `.init()` on each module that has one
4. Exposes a `destroy()` method that calls `bus.clear()` and tears down DOM listeners

The dependency order for instantiation (leaf → root):

```
createChartState()
new EventBus()
createTooltip()
createMiscSeries(bus, state)
createTracePipeline(state)
createCelSettingsModal(bus, state)
createLineSettingsModal(celSettingsModal)
createTraceStyles(bus, state, miscSeries)
createLineEditor / createCelLineEditor / createPhaseLineEditor / createAimLineEditor (bus, state)
createAllLines(bus, state, lineSettingsModal)
createReplot(bus, state, tracePipeline, traceStyles)
createLineHover(bus, state, plotlyWrapper, celSettingsModal)
createPhaseLines(bus, state, allLines)
createAimLines(bus, state, allLines)
createCelLines(bus, state, traceStyles, celSettingsModal)
createCutLines(bus, state)
createLineClickHandler(bus, state, allLines, celLineEditor, phaseLineEditor, aimLineEditor)
createGrid(bus, state, plotlyWrapper)
createPanSlider(bus, state, plotlyWrapper)
createPanningControls(bus, state, plotlyWrapper)
createCustomLegend(bus, state, plotlyWrapper)
createStartDateModal(bus, state)
createCelerationFan(bus, state, plotlyWrapper)
createNavigation(bus, state)
createDataEntry(bus, state)
createDataUpdate(bus, state)
createDataImport(bus, state)
createImportUI(bus, state, dataImport)
createChartStorage(bus, state)
createCredit(bus, state)
createCrosshair(bus, state)
createResetSettings(bus, state)
createShare(bus, state)
createResizeChart(bus, state, plotlyWrapper)
```

`dates.js` and `plotCoordinates.js` may not need factories at all — check whether they use `chartState` for only a few property reads that can be threaded as explicit parameters to the relevant functions instead.
