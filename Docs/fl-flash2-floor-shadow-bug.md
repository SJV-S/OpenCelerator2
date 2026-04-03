# FL-Flash2: Below-Floor Shadow Markers Appearing Above Timing Floor

## The Problem

Zero (and below-floor) data points show up **above** the timing floor line in FL-Flash2.
The exact same data in TC2 shows them correctly **below** the timing floor line.

## Critical Facts (do not contradict these)

1. **Same data, same aggregation.** The user imports/views identical session data in both TC2 and FL-Flash2. The aggregation settings are the same. There is no difference in input.

2. **TC2 is correct.** TC2 production (`static/SCC/series/tracePipeline.js`) has NO special floor-correction logic. It calls `createFloorShadowTraces(xPositions, frequencies)` and passes the raw aggregated values through. This works correctly.

3. **The fix is in the plugin source but was never actually deployed.** `correctFloorY` was added to `src/SCC/series/tracePipeline.js` but `grep -c "correctFloorY" /home/owl/PycharmProjects/FL-Flash2/app/static/js/scc-chart.js` returns **0**. The dist was never rebuilt, or the rebuild didn't work.

4. **The user has explicitly rejected the "raw vs median aggregation" explanation** multiple times across multiple conversation sessions. Stop bringing it up. It is either wrong or irrelevant to the actual bug.

## What the Code Does (floor shadow pipeline)

In `replot.js`:
```
order = sort indices by xValues
sort = (arr) => order.map(i => arr[i])
allX = timestampsToXPositions(sort(xValues))
allFreq = calculateFrequencies(sort)       ← uses sorted timing
m = capacity filter (allX <= chartCapacity)
xPositions = m(allX)
frequencies.correctsFloor = m(allFreq.correctsFloor)
createFloorShadowTraces(xPositions, frequencies)
```

In `calculateFrequencies(sort)`:
- `timingMinutes = sort(chartState.series.timing)` — sorted timing
- For each session: `placeBelowFloor(freq, timing) = (1/floor(timing)) * 0.75` if below floor, else MISSING
- `frequencies.correctsFloor` = array of these per-session shadow y-values (sorted, capacity-filtered)

In `createFloorShadowTraces(xPositions, frequencies)`:
- Calls `applyAggregation(xPositions, frequencies.correctsFloor, onXAgg)` → `{x, y}`
- Creates trace with these y-values

In `createTimingTraces(xPositions)`:
- `timingFrequencies = timingToFrequency(chartState.series.timing)` — 1/timing, **NOT sorted, NOT filtered**
- Calls `applyAggregation(xPositions, timingFrequencies, onXAgg)` → `{x, y}`
- Timing floor LINE is rendered at these y-values

## Potential Root Cause (unverified — needs investigation)

**Misalignment between `calculateFrequencies` (sorted+filtered) and `createTimingTraces` (unsorted+unfiltered).**

`calculateFrequencies(sort)` applies the chronological sort to timing before computing floor shadows. `createTimingTraces` does NOT apply the sort — it uses `chartState.series.timing` raw. Both pass the same `xPositions` (sorted+filtered) to `applyAggregation`.

If `applyAggregation` pairs `xPositions[i]` with `timingFrequencies[i]`, and xPositions is sorted but timingFrequencies is not, the timing floor LINE is drawn at wrong y-values for each x-position.

If the floor LINE ends up lower than expected at a given x-position, the shadow (which is correctly positioned below the true floor) appears above the rendered floor line.

**This bug would be in the same form in TC2 production** — but TC2 data is entered manually in chronological order so the sort is always a no-op. FL-Flash2 gets session data from an API which may not guarantee order.

## What to Check Next

1. **Verify the build problem first.** The deployed `scc-chart.js` has 0 occurrences of `correctFloorY`. The fix was written but never built into the deployed file. Rebuild with `npm run build` (or whatever the build command is in `chart-interface/`) and copy dist to FL-Flash2.

2. **After verifying build works or doesn't fix it:** Add console.log to compare what y-values the floor shadow trace and timing floor trace actually have at the problem x-position. This will reveal whether the shadow y is too high or the floor line y is too low.

3. **If the floor line is too low:** The bug is in `createTimingTraces` using unsorted `chartState.series.timing` against sorted `xPositions`. Fix: apply the same `sort` to `timingFrequencies` before passing to `applyAggregation`. But this fix must be applied in `replot.js` (where `sort` is defined), not inside `createTimingTraces`.

## Files Involved

| File | Role |
|------|------|
| `src/SCC/series/tracePipeline.js` | Plugin source — `createFloorShadowTraces`, `createTimingTraces`, `calculateFrequencies` |
| `src/SCC/series/replot.js` | Calls pipeline with sorted+filtered xPositions and frequencies |
| `dist/scc-chart.js` | Built output — must be rebuilt after source changes |
| `FL-Flash2/app/static/js/scc-chart.js` | Deployed file — copy of dist |
| `TC2/static/SCC/series/tracePipeline.js` | TC2 production — reference implementation, no floor correction |

## What NOT to Do

- Do NOT add `correctFloorY` unless you've confirmed the build is actually deploying it
- Do NOT change TC2 production files (`static/SCC/`) — the bug is in the plugin only
- Do NOT explain the raw-vs-median aggregation difference as the cause — the user has confirmed this is not the issue
