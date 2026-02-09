# `loadChart` vs `initializeChart` - Relationship Survey

## Summary

`loadChart` and `initializeChart` are complementary functions that handle two distinct phases of displaying a chart: **data hydration** and **visual rendering**. They always run sequentially — `loadChart` first, `initializeChart` second — and together form the complete chart startup sequence.

---

## `loadChart(id)` — Data Layer

**Defined in:** `static/SCC/storage/chartStorage.js:192`

**Role:** Fetches a serialized chart record from IndexedDB and hydrates `chartState` with its data.

**What it does:**
1. Reads the chart record from IndexedDB by ID
2. Runs `jsonBackwardsCompatibilityCheck()` to migrate old data formats
3. Calls `deserializeChart()` — walks the record and restores `Date` objects and `NaN` values, then copies every key into `chartState`
4. Sets `chartState.id`
5. If migrations occurred, writes the updated record back to IndexedDB
6. Emits `EVENTS.STORAGE_CHART_LOADED`

**What it does NOT do:**
- Touch the DOM
- Call Plotly
- Set up any event listeners
- Render anything visual

**Returns:** `Promise<boolean>` — `true` if the chart was found and loaded, `false` otherwise (triggers a redirect to `/` on failure).

---

## `initializeChart()` — Visual Layer

**Defined in:** `static/SCC/main.js:71`

**Role:** Reads the already-hydrated `chartState` and builds the full Plotly chart with all visual elements.

**What it does:**
1. Calls `updateTimingVisibility()` to show/hide timing inputs based on chart config
2. Calls `getTemplate()` to get a deep-cloned chart layout template for the current `chartState.chartType` and `chartState.minuteChart`
3. Calls `resizeChartByHeight()` to fit the template to the container dimensions
4. Calls `injectCelerationFan()` and `injectCredits()` to add overlay shapes
5. Runs `Plotly.newPlot()` — creates the chart DOM element
6. Sets up `plotly_afterplot` hook for visibility state syncing
7. Initializes chart capacity/window from config
8. Calls `setupPanConstraints()`, `initFanDrag()`, `initCreditClick()`
9. Sets `chartState.startDate` if not already set (from loaded data)
10. Calls `setupClickHandler()` for line drawing interactions
11. Calls `initGridToggle()`, `initializeDateInputs()`
12. Calls `refreshChart()` — runs the trace pipeline to render data points from `chartState.series`
13. Calls `renderCustomLegend()`
14. Sets up the pan slider

**What it does NOT do:**
- Fetch data from storage
- Modify `chartState` in any persistent way (aside from defaults like `startDate` and `chartCapacity`)

---

## Call Sequence in `chart.html`

The orchestration happens in the inline `<script type="module">` block at `templates/SCC/chart.html:248-291`:

```
async function init() {
    await initStorage();           // 1. Open IndexedDB
    await initServerSync();        // 2. Initialize server sync

    // (share link handling omitted for clarity)

    await loadChart(chartId);      // 3. DATA: hydrate chartState from IndexedDB
    setupEventListeners();         // 4. Bind all UI event listeners
    initializeChart();             // 5. VISUAL: build and render the Plotly chart
    startSyncWatch(chartId);       // 6. Begin watching for remote updates
}
```

The order is strict:
- `loadChart` **must** run before `initializeChart` because `initializeChart` reads `chartState.chartType`, `chartState.minuteChart`, `chartState.startDate`, and `chartState.series` — all populated by `loadChart`.
- `setupEventListeners` runs between them so that UI controls are wired up before the chart renders (the comment on line 116 of `main.js` confirms this: "setupEventListeners ran before initializeChart").

---

## Parallel Initialization in `main.js`

Separately from the `chart.html` orchestration, `main.js` has its own `DOMContentLoaded` listener (line 190) that runs module `init()` functions, initializes storage, sets up icons, gesture navigation, and other UI. This runs in parallel with the `chart.html` `init()` since both trigger on DOMContentLoaded. The module inits register eventBus subscribers, which must happen before `initializeChart` emits any events.

---

## Sync Update Path (Re-load Without Re-init)

When a remote sync update arrives, `chart.html` handles it differently:

```javascript
eventBus.subscribe(EVENTS.SYNC_CHART_UPDATED, async ({ chartId: updatedId }) => {
    await loadChart(chartId);       // Re-hydrate chartState with new data
    refreshChart();                 // Re-render traces only (no full re-init)
});
```

Here `loadChart` is called again but `initializeChart` is **not**. Instead, only `refreshChart()` runs, which updates the data traces via `Plotly.react()`. The chart skeleton (layout, fan, credits, constraints) persists from the original `initializeChart` call. This is the efficient update path — full re-initialization would destroy and rebuild the entire chart unnecessarily.

---

## `loadCharts()` in `menu_page.html` — Unrelated

The `loadCharts()` function in `templates/SCC/menu_page.html:542` is a completely separate function scoped to the menu page. It calls `listCharts()` (not `loadChart()`) to get metadata for all saved charts and renders the chart list UI. It never hydrates `chartState` or renders a Plotly chart.

---

## Relationship Diagram

```
┌─────────────────────────────────────────────────────┐
│                   chart.html init()                  │
│                                                      │
│  initStorage()                                       │
│       │                                              │
│       ▼                                              │
│  loadChart(id)          ◄── DATA LAYER               │
│  ┌──────────────────────────────────┐                │
│  │ IndexedDB.get(id)                │                │
│  │ jsonBackwardsCompatibilityCheck()│                │
│  │ deserializeChart() → chartState  │                │
│  │ emit STORAGE_CHART_LOADED        │                │
│  └──────────────────────────────────┘                │
│       │                                              │
│       ▼                                              │
│  setupEventListeners()  ◄── UI WIRING                │
│       │                                              │
│       ▼                                              │
│  initializeChart()      ◄── VISUAL LAYER             │
│  ┌──────────────────────────────────┐                │
│  │ getTemplate(chartType, minute)   │                │
│  │ resizeChartByHeight()            │                │
│  │ injectCelerationFan()            │                │
│  │ injectCredits()                  │                │
│  │ Plotly.newPlot()                 │                │
│  │ setupPanConstraints()            │                │
│  │ setupClickHandler()              │                │
│  │ refreshChart() → Plotly.react()  │                │
│  │ renderCustomLegend()             │                │
│  └──────────────────────────────────┘                │
│       │                                              │
│       ▼                                              │
│  startSyncWatch()                                    │
└─────────────────────────────────────────────────────┘

         ┌─────────── SYNC UPDATE ───────────┐
         │  loadChart(id)   ← re-hydrate     │
         │  refreshChart()  ← traces only    │
         │  (no initializeChart)             │
         └───────────────────────────────────┘
```