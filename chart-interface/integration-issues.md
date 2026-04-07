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

## 2026-04-07 — Celeration fan inconsistent in plugin context: not draggable, labels missing, sometimes invisible

### Symptom

The celeration fan behaves incorrectly in the FL-Flash2 consumer. Three related symptoms, each occurring to varying degrees depending on how the chart was initialized:

- The fan is sometimes entirely invisible on first load.
- The rate labels (×16, ×4, ×2, etc.) are not shown even when the fan lines are visible.
- The fan is not draggable — hovering over it does not trigger the grab cursor, and clicking and dragging does nothing.

All three behaviors work correctly in TC2's standalone app.

### Root cause — fan positions computed from container dimensions at render time

The celeration fan's position and all element coordinates are computed in `generateFanElements()` (`src/SCC/ui/celerationFan.js`) using `layout.width`, `layout.height`, and `layout.margin.*`. These values are set by `resizeChartByHeight()` in `initializeChart()`, which reads the container dimensions via `chartContainer.clientWidth` and `chartContainer.clientHeight`.

In the plugin context, `new SCCChart()` and its internal `initializeChart()` may be called while the chart's container element is not yet visible in the DOM — for example, if the Charts tab is not the active tab when the first deck is loaded. Hidden elements return `clientWidth = 0` and `clientHeight = 0`. When these are 0:

- `resizeChartByHeight()` sets `layout.width` and `layout.height` to 0 or near-0.
- `generateFanElements()` computes fan paper coordinates using these values:
  - `plotWidth = layout.width - layout.margin.l - layout.margin.r` → near 0 or negative
  - `pxPerDataUnit`, `lineLength`, `fanOffsetPx` all derived from this → NaN or 0
  - All `toPaper()` calls produce `x = NaN, y = NaN` or result from divide-by-zero
- Plotly silently ignores shapes and annotations with NaN coordinates — the entire fan disappears.

When the container becomes visible later (the Charts tab is opened), no re-render is triggered, so the fan remains absent for the session unless `initializeChart()` is called again (which only happens on chart-type change or fullscreen toggle).

This also explains the occasional visibility — if the Charts tab happens to be the active tab when `new SCCChart()` is first called, the container has correct dimensions and the fan renders normally.

### Root cause — label clipping from insufficient margin

Even when the fan is rendered at non-zero dimensions, the rate labels (annotations) may be missing while the lines are visible. The fan is intentionally positioned outside the plot area in the margin space. The margin expansion that creates room for the fan is performed inside `resizeChartByHeight()`. If the container dimensions are partially wrong (e.g., some but not all margin values are computed correctly), the label positions in paper space may fall outside Plotly's SVG viewport bounds and get clipped.

The labels use `xref: 'paper', yref: 'paper'` with coordinates outside the [0, 1] range (negative x for minute charts, x > 1 for count charts). Plotly renders these into the SVG margin area only when the chart was initially drawn with sufficient margin for those coordinates. If the margin at `newPlot` time was too small (due to bad initial dimensions), the labels are clipped even after the chart is later resized.

### Root cause — drag hit detection fails when fan is mispositioned

The fan drag system (`initFanDrag()`) works by detecting mouse position in paper coordinates and comparing it to the `fan-hitarea` shape's stored `x0, y0, x1, y1` values in `layout.shapes`. Both the mouse conversion (`pixelToPaper()`) and the stored hit area use the same paper coordinate system, so they should agree when the chart is correctly initialized.

When the fan was initialized at 0 dimensions (NaN positions), the `fan-hitarea` shape either has NaN coordinates or is absent from the layout. The `isPointOnFan()` function finds no valid hit area and returns false for every mouse position. The drag handler in `handleMouseDown()` never activates — no grab cursor, no drag starts, fails silently.

If the fan was initialized correctly but the chart is subsequently resized (e.g., via `applyChartWindow()`), the fan's paper-space coordinates remain stable — they are defined in paper space, not pixel space — so drag should continue to work after a resize. The drag failure is specific to the bad-dimensions-at-init path.

### Why this doesn't affect TC2 standalone

In TC2, the chart is always rendered into a full-page layout that is visible from the very first render. `clientWidth` and `clientHeight` are always valid when `initializeChart()` is called. There is no tab-switching or deferred visibility.

### What is not yet confirmed

- Exactly when in the FL-Flash2 lifecycle `new SCCChart()` is called relative to the Charts tab becoming visible. If the tab is always visible at construction time, the 0-dimensions theory doesn't apply, and another cause must be sought — a CSS `display: none` or `visibility: hidden` on a parent, or a parent with explicit `height: 0` — `clientWidth/clientHeight` return 0 for all of these.
- Whether the margin expansion inside `resizeChartByHeight()` is being passed the correct `fanVisible: true` option consistently. `initializeChart()` currently passes `fanVisible: true` unconditionally (`src/main.js` lines 75–78), then `syncVisibilityState()` CSS-hides the fan afterward if `chartState.fanVisible` is false. If the margin was not expanded (because `fanVisible: false` was the saved value), the fan's annotations would be clipped even when later made visible by toggling the fan-toggle checkbox.

### Relationship to the `plotly_click` issue

The fan drag's `handleMouseDown` uses capture phase on `chartDiv`, which fires before Plotly's bubbling handlers. This is intentional and should work even with `dragmode: "pan"`. The `plotly_click` issue (drag layer consuming click events) does not apply here — the fan drag uses a different mechanism specifically to avoid it. The drag failure is not caused by the Plotly drag layer.

### Fix direction

The fix belongs on the plugin side. `initializeChart()` should detect when the container has 0 or near-0 dimensions and defer the render until dimensions are valid. The most robust approach is a `ResizeObserver` on the `chart-container` element: when the observed size transitions from 0 to a positive value, call `initializeChart()`. This would handle the deferred-visibility case automatically without requiring consumer-side changes.

---
