# SCCChart Plugin — Multi-Instance Refactor Proposal

## Before Reading This

Read these three files first, in this order:

1. `Docs/plugin-proposal.md` — the original proposal to extract TC2's chart as a portable plugin, and the questions it raised
2. `chart-interface/consumer-contract.md` — the rules consumers must follow when using the current plugin
3. `chart-interface/integration-issues.md` — bugs discovered during FL-Flash2 integration

Then read:

4. `chart-interface/modularization-strategy.md` — the full set of architectural issues identified from that first integration attempt

This proposal addresses the highest-priority issue from that strategy document: the singleton event bus and chartState.

---

## Important: Scope of This Work

**The `chart-interface/` plugin is being abandoned.** It was a first attempt and the integration issues it produced revealed that the architecture needs to change before any plugin can be built cleanly.

The refactor described in this document happens inside **TC2's own codebase** — specifically `static/SCC/`. The goal is to make TC2's own modules work correctly as independent, multi-instance-capable units. Once that is done, extracting a new plugin becomes straightforward because the hard architectural work is already done.

Do not attempt to continue developing or fixing `chart-interface/`. Start from TC2's source.

---

## The Problem

The plugin currently has one `EventBus` instance and one `chartState` object, both created at module load time and shared across the entire page:

```javascript
// eventBus.js
export const eventBus = new EventBus('SCC');  // one, forever

// chartState.js
export const chartState = { ... };  // one, forever
```

Every module imports these directly. This means:

- Only one `SCCChart` can exist per page
- `destroy()` cannot clean up event subscriptions — they live forever in the shared bus
- Creating a second `SCCChart` instance layers duplicate event handlers on top of the first set, causing every event to fire twice and state to corrupt between instances
- The "singleton constraint" documented in `consumer-contract.md` is a workaround for this limitation, not a design decision

---

## The Goal

Any number of `SCCChart` instances should be creatable on the same page simultaneously, or in sequence via destroy/recreate, without interference.

---

## The Solution

### One bus and one state per chart instance

Instead of module-level singletons, each `SCCChart` constructor creates fresh instances of both:

```javascript
const bus = new EventBus('SCC');   // new object, belongs to this chart only
const state = createChartState();  // new object, belongs to this chart only
```

`EventBus` is already a class — it just needs to stop being exported as a singleton. `chartState` needs a `createChartState()` factory function that returns a fresh copy of the default state object.

### Modules receive bus and state instead of importing them

Each module currently imports the shared singletons at the top of the file. Instead, each module becomes a factory function that receives `bus` and `state` as parameters:

```javascript
// Before
import { eventBus } from './eventBus.js';
import { chartState } from './chartState.js';

export function init() {
    eventBus.subscribe(EVENTS.MODE_PHASE_ACTIVATE, phaseTextTop);
}
export function phaseTextTop() { /* uses eventBus, chartState */ }

// After
export function createPhaseLines(bus, state) {
    function phaseTextTop() { /* uses bus and state from the parameter above */ }
    bus.subscribe(EVENTS.MODE_PHASE_ACTIVATE, phaseTextTop);
    return { phaseTextTop };
}
```

`bus` and `state` are passed in once when the factory is called. Every function defined inside the factory can use them directly — no need to pass them into each individual function call. This works because functions defined inside another function can see that function's variables automatically.

`EVENTS` (the dictionary of event name strings) is not an instance and never changes — every module keeps importing it normally.

### main.js becomes a class

`main.js` currently exports flat functions (`runModuleInits`, `initializeChart`, `setupEventListeners`) that use the shared singletons internally. These become methods on a `ChartController` class that holds the instance-specific `bus` and `state`:

```javascript
export class ChartController {
    constructor(bus, state, container) {
        this.bus = bus;
        this.state = state;
        this.container = container;
    }

    runModuleInits() {
        this.phaseLines = createPhaseLines(this.bus, this.state);
        this.aimLines = createAimLines(this.bus, this.state);
        // ... all modules
    }

    initializeChart() { /* uses this.bus, this.state */ }
    setupEventListeners() { /* uses this.container, this.modules */ }

    destroy() {
        this.bus.clear();           // removes all subscriptions
        this.container.innerHTML = '';
    }
}
```

### sccChart.js ties it together

```javascript
constructor(container, options) {
    const bus = new EventBus('SCC');
    const state = createChartState();
    this._ctrl = new ChartController(bus, state, container);
    this._ctrl.runModuleInits();
    this._ctrl.initializeChart();
}

destroy() {
    this._ctrl.destroy();
}
```

Two charts on the page means two constructors ran: two `bus` objects, two `state` objects, two `ChartController` instances. Each chart's modules hold references to their own pair and never touch the other chart's. `destroy()` calls `bus.clear()` — all subscriptions vanish, nothing leaks to a future instance.

---

## Scope and Complexity

### Straightforward modules (mechanical change)

These modules have no direct calls to other modules and convert cleanly:

- `lines/phaseLines.js`
- `lines/aimLines.js`
- `lines/lineHover.js`
- `series/tracePipeline.js`
- `series/grid.js`
- `ui/customLegend.js`
- `ui/startDateModal.js`
- `ui/panSlider.js`
- `ui/celerationFan.js`
- `util/panning_controls.js`
- `util/plotlyWrapper.js`

### Modules with cross-module dependencies (require care)

Several modules call functions from other modules directly — not via the event bus. These create dependency chains that must be resolved in order:

- **`series/traceStyles.js`** calls into `series/miscSeries.js`. Both need to be converted, with `miscSeries` done first so its result can be passed to `traceStyles`.
- **`series/replot.js`** calls directly into `tracePipeline.js` and `traceStyles.js`. Their factory results need to be passed in.
- **`lines/celLine.js`** and **`ui/crosshair.js`** both call functions from `traceStyles.js`.
- **`lines/lineClickHandler.js`** calls into three UI editor modules (`celLineEditor`, `phaseLineEditor`, `aimLineEditor`) and `allLines.js`. This is the most connected module — its factory will need those modules' results passed in as dependencies.
- **`ui/lineSettingsModal.js`** calls into `ui/celSettingsModal.js`.
- **`navigation.js`** calls into `ui/tooltip.js`.

Note: `tracePipeline.js` and `traceStyles.js` contain many functions that are purely computational — they take data as arguments and return results without using `chartState` or `eventBus`. Those specific functions may not need to change at all.

### What does NOT change

- `EVENTS` — just a constant dictionary of strings, imported normally by all modules
- `config.js` — pure constants, no instance state
- All utility math functions that take inputs and return outputs with no side effects

---

## Amount of New Code

Very little. This is almost entirely restructuring existing code:

- Each module: wrap existing functions inside a factory function, remove two import lines at the top, add a return statement at the bottom
- `chartState.js`: add a `createChartState()` function wrapping the existing object literal
- `eventBus.js`: remove the singleton export line
- `main.js`: convert to a class (~20–30 lines of new boilerplate)
- `sccChart.js`: minor changes to constructor and destroy

Net new code: minimal. The total line count of the codebase changes very little.

---

## Risk Assessment

**Not purely mechanical, but complications are specific and locatable.** The risk is not scattered unknowns — it is getting the dependency order wrong in `ChartController.runModuleInits()`, or missing a cross-module call somewhere. Both failure modes produce an immediate, clear runtime error rather than a silent bug.

The singleton constraint warning in `consumer-contract.md` should be removed once this refactor is complete — it will no longer apply.

---

## What This Does Not Fix

This proposal addresses only the singleton problem. The other issues from `modularization-strategy.md` remain separate work:

- Spurious backend writes on `loadData()` (load/user event distinction)
- `plotly_click` never firing for line click-to-edit
- Gated chartState mutations to prevent silent event misses
