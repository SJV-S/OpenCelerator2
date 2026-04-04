# SCCChart Plugin — Integration Issues Log

A record of bugs discovered during integration with external consumers. Each entry documents what broke, why, and what was fixed on each side.

---

## 2026-04-04 — Chart type change not persisting across page loads

### Symptoms
Changing chart type (e.g. Daily → Weekly) appeared to work visually, but reverted to Daily on every page refresh.

### Root causes (three separate failures, all required to persist chart type correctly)

**1. Plugin: `CHART_TYPE_CHANGED` event not emitted (TC2 bug)**

The chart-type-select change handler in `src/main.js` mutated `chartState.chartType` and called `initializeChart()` but never emitted any event. The `SCCChart` class wires `onStateChanged` exclusively to the `STATE_MUTATING` and `PRESENTATION` event categories — no event means no save notification.

Fix: added `CHART_TYPE_CHANGED: 'chart:type_changed'` to `EVENTS` and registered it under `STATE_MUTATING` in `EVENT_CATEGORY_MAP` (`src/SCC/eventBus.js`). Emitted it after `initializeChart()` in the confirm handler (`src/main.js`).

**2. Consumer: `chartType` hardcoded as a hard override, wiping the saved value on load**

The consumer (`scc_chart.js`) spread `savedChartJson` over defaults in `_buildChartData`, which would correctly restore the saved `chartType` — but then a "hard overrides" block unconditionally set `chartType: 'Daily'`, stomping on it. The saved type was discarded on every load regardless of what was stored.

Fix: moved `chartType: 'Daily'` and `minuteChart: true` into `consumerDefaults` (the fallback block), removed them from the hard overrides. Saved state now wins; defaults only apply when no state has been saved.

**3. Plugin: `loadData` does not re-initialize the chart template on type change (TC2 bug)**

`loadData` calls `Object.assign(chartState, data)` then emits `DATA_CHART_REFRESH`. `DATA_CHART_REFRESH` only replots data traces on the **existing** Plotly template — it does not call `newPlot` with a new template. Switching from a deck with a saved Weekly type to a deck with a Daily type left the Weekly template rendered. Every subsequent deck, regardless of its saved type, displayed using whatever template was last initialized.

Additionally, the `#chart-type-select` UI element is set once in `setupEventListeners()` and never updated by `loadData`, leaving the dropdown showing a stale type after any deck switch.

Fix: `loadData` now detects when `chartType` or `minuteChart` changes relative to the current rendered state. If the template changed, it calls `initializeChart()` (full re-render) instead of just emitting `DATA_CHART_REFRESH`. In both cases it queries `#chart-type-select` from the container and syncs its value to `chartState.chartType` (`src/sccChart.js`).

### Rule going forward

Any `chartState` property that controls which Plotly **template** is used (`chartType`, `minuteChart`) requires a full `initializeChart()` call to take effect — not just a `DATA_CHART_REFRESH`. `loadData` now handles this automatically, but be aware of it when adding new template-affecting properties.

Any new settings handler added to `src/main.js` that mutates `chartState` **must** emit an event registered in `EVENT_CATEGORY_MAP` under `STATE_MUTATING` or `PRESENTATION`, or the consumer's `onStateChanged` will never fire and the change will be silently lost. See `src/SCC/eventBus.js` for the full list.

---

## 2026-04-04 — Chart loading is expensive; deck switching causes unnecessary network writes

### Context

In FL-Flash2's learner dashboard, a single `SCCChart` instance is reused across all decks. When the user selects a deck and opens the Charts tab, `sccChart.init(deckId)` is called. If the deck differs from the current one, `_render(deckId)` executes the full load sequence.

### Problems

**1. Every deck switch triggers a backend write**

`loadData()` always emits `CHART_WINDOW_CHANGED`, which is registered as `STATE_MUTATING`. This fires `onStateChanged`, which schedules a `POST /learner/api/deck/{id}/chart-json` 1500ms later. This happens on every deck switch — even when the user has changed nothing. A user browsing through five decks generates five write requests for zero user-initiated changes.

**2. No session data is cached on the client**

Every call to `_render()` makes a `GET` request to fetch sessions and `chart_json` from the server, even for a deck the user has already viewed in the same session. Navigating away from a deck and back is as expensive as the first load.

**3. `initializeChart()` is called on deck switches where chart type differs**

This is the correct fix for template bleed-through (see entry above), but it comes with a cost: `initializeChart()` calls `Plotly.newPlot()`, which is the most expensive Plotly operation — it tears down and recreates the entire SVG chart from scratch. This is unavoidable when switching between decks with different saved chart types, but the frequency depends on how varied the user's saved chart types are.

**4. The full `chartState` (including `series`) is serialized on every save**

`getState()` returns `{...chartState}`, which includes the complete `series` arrays (all session data), all line objects, all trace style configs, etc. The `series` data is already stored authoritatively in the sessions table — it is hard-overridden with fresh DB data on every `_buildChartData` call, meaning the copy inside `chart_json` is never actually read back. It is dead weight being serialized, transmitted, and stored on every save, scaling with the number of sessions.

**5. Plugin bundle is 750KB unminified**

`scc-chart.js` bundles all chart logic, the full Plotly template JSON, the plugin UI HTML, and all drawing tools. It is loaded on the learner dashboard page regardless of whether the user ever opens the Charts tab.

### Notes on severity

Issue 1 (spurious writes on deck switch) is the most actionable — it generates constant backend traffic with no user benefit. Issue 2 (no caching) compounds it. Issues 3–5 are inherent to the current architecture and would require more significant structural changes to address.

Issue 4 could be partially addressed by stripping `series` from the state object in `_saveChartJson` before sending the POST, since the data is redundant with the sessions DB. This would reduce payload size on every save without any change to the load path.

---

## 2026-04-04 — Line click-to-edit (`plotly_click`) never fires in plugin context — UNRESOLVED

### Symptom

When the user enables line edit mode (the checkbox for phase/aim/cut/cel lines), clickable traces are added to the chart and the `plotly_click` handler is registered, but clicking an existing line does nothing. The handler never fires.

### What is confirmed

- Clickable traces **are** being added correctly. `chartDiv.data.length` increases from 7 to 13+ when edit mode is enabled, confirming the traces exist.
- `plotly_click` **never fires**. Debug logging at the handler entry point never appears.
- The chart template has `dragmode: "pan"` and `xaxis.fixedrange: true`. The template JSON also sets `yaxis.fixedrange: true`.
- The **drawing modes** (aim, cut, cel line creation) work correctly. They explicitly call `relayout(chartDiv, { dragmode: false })` before capturing draw-clicks via raw DOM events — they do not use `plotly_click`.
- The **line click-to-edit path** (`toggleLineCategoryEdit`) relies entirely on `plotly_click` and never sets `dragmode: false`.

### What has been tried and failed

- Setting `dragmode: false` before enabling edit mode — user confirmed this did not fix it.
- A DOM-click workaround (mapping raw click coordinates to the nearest trace) — rejected as architecturally wrong.

### What is not yet confirmed

- Whether `plotly_click` fires at all in this chart's configuration (both axes `fixedrange`, `dragmode: "pan"`). It fires in TC2's standalone app, but the precise configuration at the moment of clicking has not been diffed against the plugin's configuration.
- Whether something is intercepting clicks before Plotly's trace-level proximity detection — an overlay element, a `pointer-events: none` CSS rule on the drag layer, or something the plugin injects on top of the chart div.
- Whether `dragmode: false` was actually applied to the live chart at the right moment (before the click, not after), or whether it was overwritten by a subsequent relayout.

### What is needed to go further

The root cause must be confirmed in a running browser before any further code changes. The first thing to verify is whether `plotly_click` fires at all on this chart — attach a raw `plotly_click` listener in the browser console and click anywhere on the chart surface (not on a trace). If it fires on blank areas but not on traces, the issue is proximity detection or z-ordering of the clickable traces. If it never fires anywhere, the issue is at the Plotly drag-layer level and `dragmode` or an overlay is blocking all click events from reaching Plotly.

### Hypothesis (unconfirmed)

The Plotly drag layer element (`.drag` / `.nsewdrag`) sits on top of all traces and captures pointer events for panning. With `dragmode: "pan"`, this layer consumes clicks before Plotly's hit-testing can attribute them to a specific trace. Setting `dragmode: false` should disable this layer — but only if applied before the click, and only if nothing re-enables pan mode afterward. The drawing modes that work set `dragmode: false` at activation time for exactly this reason. The click-to-edit path skipping this step is the most likely cause.

---

## Architectural constraint — Singleton instance; destroy/recreate is broken

### Problem

The plugin's event bus is a module-level singleton — one object shared across the entire JS module scope. `destroy()` clears the container HTML and decrements the instance counter, but **does not unregister any event bus subscriptions**. Every `eventBus.subscribe()` call made during `runModuleInits()`, `setupEventListeners()`, and the constructor accumulates permanently for the lifetime of the page.

Calling `destroy()` and then `new SCCChart(...)` a second time re-runs all of those subscriptions on top of the still-live ones from the first instance. The result is duplicate event handlers firing for every event: data entry is processed twice, lines are drawn twice, saves fire twice, and state mutations from one instance corrupt the other. The behaviour is undefined and difficult to debug because the symptoms vary by which events happen to fire first.

### How FL-Flash2 works around it

A single `SCCChart` instance is created on first render and kept alive for the page session. Deck switches call `loadData()` on the existing instance rather than destroying and recreating. The instance is guarded:

```javascript
if (this.currentDeckId === deckId && this.chartHandle) return;  // same deck, skip
if (this.chartHandle) {
    this.chartHandle.loadData(chartData);   // different deck, reuse instance
} else {
    this.chartHandle = new SCCChart(...);   // first render only
}
```

### Root cause in the plugin

`runModuleInits()` is called unconditionally in the constructor. Each module init registers `eventBus.subscribe()` calls. The event bus has no mechanism to scope subscriptions to an instance or to clean them up on `destroy()`. Fixing this properly would require either scoping the event bus per instance (breaking the singleton) or tracking all subscriptions and unregistering them in `destroy()`.

---
