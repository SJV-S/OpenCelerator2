# SCCChart Plugin — Consumer Contract

Notes on requirements and constraints that consumers of the SCCChart plugin must respect.

---

## Timing Data

**On minute charts (`minuteChart: true`), timing values must always be valid positive numbers.**

The plugin was designed with TC2's data entry form, which enforces that a timing value is always provided before a data point can be submitted. As a result, `chartState.series.timing` never contains `null` or `undefined` in normal TC2 usage.

Consumers that construct `initialData` or call `loadData()` programmatically must apply the same guarantee. Passing `null` for a timing entry on a minute chart causes `calculateFrequencies()` to return `MISSING` for that data point — making it completely invisible on the chart, with no floor marker either.

**Rule**: Never pass `null` or `undefined` in the `timing` array when `minuteChart: true`. All timing values must be **whole positive integers (minutes)**. The plugin's floor logic uses `Math.floor(timing)` throughout — fractional values like `1.5` produce an inconsistent floor position. Consumers with automatically-recorded fractional durations must round to the nearest whole minute before passing to the plugin (minimum 1).

---

## Singleton Constraint

**One SCCChart instance per page. Never destroy and recreate.**

The plugin's event bus is a module-level singleton. Calling `destroy()` removes the container HTML but does not unregister event bus subscriptions. Instantiating a second `SCCChart` on the same page will cause duplicate event handlers and undefined behaviour.

**Rule**: Create one instance on first render. For subsequent data changes (e.g. the user switches to a different deck), call `loadData()` on the existing instance. Guard against re-initialization by checking whether the instance already exists.

---

## Saving and Restoring State (`onStateChanged` / `loadData`)

**`onStateChanged` fires for both data mutations and presentation changes.**

The plugin distinguishes two event categories internally:
- **STATE_MUTATING** — data entry, line draws/edits, style changes, imports
- **PRESENTATION** — grid visibility, zeros-below-floor toggle, series visibility, legend, fan

Both categories trigger `onStateChanged`. Consumers must persist the full snapshot and restore it in full — otherwise presentation preferences (grid on/off, zeros below floor, etc.) silently revert to defaults on every page load.

**Rule**: Persist the complete object returned by `onStateChanged`. Do not pick individual keys (e.g. only `PhaseLines`) — that discards all display settings.

---

## Restoring State When Series Data Comes from an External Source

TC2 stores the complete chart state (including `series`) in its own persistence layer and passes it back verbatim via `loadData()`. Consumers that maintain an authoritative series data source elsewhere (e.g. a session database) must merge on load rather than choosing one or the other.

**Correct pattern** — spread the full saved snapshot, then override the data fields with fresh values:

```javascript
const chartData = {
    ...savedSnapshot,           // restores all display settings and annotations
    chartType: 'Daily',
    minuteChart: true,
    startDate: computedStartDate,
    series: freshSeriesFromDB,  // authoritative data always wins
};
```

Passing only the fresh series (without `...savedSnapshot`) silently drops every saved display preference. Passing only the saved snapshot (without overriding `series`) shows stale data.

**Always include a non-null `id` in `initialData`** — even on first load before any state has been saved. The plugin's `initializeChart()` contains:

```javascript
if (!chartState.id) {
    chartState.chartWindow = chartState.chartCapacity / 2;
}
```

A null `id` causes `chartWindow` to be silently reset to the default on every render, regardless of what was passed in `initialData`. Use any stable, non-null string (e.g. a deck or record identifier). Once a state snapshot has been saved and restored, the `id` from the snapshot takes over and this is no longer an issue — but it must be set from the very first render to avoid the reset.

---

## Guidance for AI Implementors

The plugin's `chartState` defaults reflect TC2's own conventions (a precision teaching tool). They are not neutral. Before wiring up a new consumer, clarify the following with the user — do not assume TC2's defaults are appropriate:

**Interactive menu**
- Should the plugin's built-in UI panel (data entry tabs, line drawing tools, series settings, etc.) be visible at all, or should the consumer suppress or hide it? Some consumers only want the chart surface, not the full TC2 editing interface.

**Grid**
- Should any grid lines be shown by default? The default is all off (`lineVisibility.grid: { dateLines: false, countLines: false, minorGrid: false }`). Ask whether date lines, count lines, and/or minor grid should be on at first render — especially if the chart is read-only and the user cannot toggle it themselves.

**Zeros below floor**
- `placeZerosBelowFloor` defaults to `true` (zero counts appear as a special marker below the timing floor). Confirm this is the desired behaviour. If the consumer prefers zeros to be invisible, it must be set to `false` in `initialData`.

**Data aggregation**
- Both `onXAgg` (same-day aggregation) and `acrossXAgg` (rolling window) default to `raw` / `null` — no aggregation. If the consumer's data has multiple data points per time unit (e.g. multiple sessions per day), ask whether they should be aggregated and by what method (`median`, `mean`, `min`, `max`, etc.), and whether a rolling window across days is wanted.

**Chart window**
- The visible X range defaults to 140 positions (half of the 280-position Daily capacity). Ask whether a different default window width makes sense for the consumer's typical data density.

**Celeration fan**
- `fanVisible` defaults to `true`. Ask whether the celeration fan should be shown.

**Legend**
- The legend defaults to visible at top-right. Ask whether it should be shown and where.

**Chart type and minute vs count**
- Confirm `chartType` (`Daily`, `Weekly`, `Monthly`, `Yearly`) and `minuteChart` (`true` = frequency per minute, `false` = raw counts). These fundamentally change what the chart displays and cannot be changed after the chart is rendered without calling `loadData()`.

Any preference that differs from the default should be set in the `initialData` passed to the constructor (or in the first `loadData()` call if no saved state exists yet), so the user sees the right thing before they ever interact with the chart.

**Overriding `traceStyles` requires the full trace config, not just the changed property.** `loadData()` / `initialData` do a shallow `Object.assign` into `chartState` — passing a partial `traceStyles` (e.g. only `{ onXAgg: 'median' }`) replaces the entire object and drops all other trace properties (colors, marker shapes, line widths). Copy the full default config from `src/SCC/config.js` (`defaultCorrectTraceConfig`, `defaultErrorTraceConfig`, `defaultTimingTraceConfig`) and change only the properties you need. Place this object before the `savedChartJson` spread so user changes always win.

---
