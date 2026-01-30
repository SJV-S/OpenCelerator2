# Crosshair Issues Analysis

## Issues Reported

1. Series names display as "misc1", "misc2" instead of custom names
2. Only 2 of 5 series showing in crosshair info panel
3. CPU runs hot when using crosshair

---

## Issue 1: Series Names Not Showing Custom Names

### Root Cause

`formatSeriesName()` in `crosshair.js:608-615` had a hardcoded map:

```javascript
function formatSeriesName(name) {
    const nameMap = {
        'corrects': 'Correct',
        'errors': 'Incorrect',
        'timing': 'Timing'
    };
    return nameMap[name] || name;  // misc series fall through unchanged
}
```

For misc series (and any series with custom names), it returned the raw ID like "misc1" instead of looking up the actual name.

### Fix

Look up `seriesName` from `chartState.traceStyles[seriesId].raw.seriesName` for ALL series:

```javascript
function formatSeriesName(seriesId) {
    let config;
    if (seriesId && seriesId.startsWith('misc')) {
        config = chartState.traceStyles.misc[seriesId];
    } else if (seriesId) {
        config = chartState.traceStyles[seriesId];
    }

    if (config && config.raw && config.raw.seriesName) {
        return config.raw.seriesName;
    }

    // Fallback defaults
    const fallbackMap = {
        'corrects': 'Correct',
        'errors': 'Incorrect',
        'timing': 'Timing'
    };
    return fallbackMap[seriesId] || seriesId;
}
```

### Status: FIXED

---

## Issue 2: Only 2 of 5 Series Showing

### Possible Causes

1. **Data gaps** - Series only show if they have data within 0.5 of current x position (line 563: `closestDist <= 0.5`)

2. **Missing trace metadata** - Traces without `.meta` are skipped (line 541: `if (!trace.meta) return`)

3. **NaN/null values filtered** - Values that are null or NaN are excluded (line 565)

### Diagnostic Questions

- Do all 5 series have data at the same x positions?
- Are any series showing NaN in their data arrays?
- Check browser console: add `console.log(traces.map(t => t.meta))` in `updateInfoPanel()` to see what traces exist

### Status: NEEDS INVESTIGATION

---

## Issue 3: CPU Running Hot

### Root Cause

Two performance problems in `crosshair.js`:

#### A. Linear Search O(n) on Every Mouse Move

Both `updateDataMarkers()` (lines 460-466) and `updateInfoPanel()` (lines 554-560) use linear search:

```javascript
for (let i = 0; i < xArray.length; i++) {
    const dist = Math.abs(xArray[i] - xRounded);
    if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
    }
}
```

With 5 series × 100+ points × 30fps = 15,000+ iterations per second.

#### B. Duplicate Work

The same search runs twice per frame - once for markers, once for info panel.

#### C. DOM Thrashing

`container.innerHTML = ''` clears and recreates all markers every frame (line 424).

### Proposed Fix

1. **Binary search** - X arrays are sorted, so use O(log n) instead of O(n):

```javascript
function binarySearchClosest(arr, target) {
    if (!arr || arr.length === 0) return { index: -1, dist: Infinity };

    let left = 0, right = arr.length - 1;
    while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (arr[mid] < target) left = mid + 1;
        else right = mid;
    }

    let closestIdx = left;
    let closestDist = Math.abs(arr[left] - target);

    if (left > 0) {
        const leftDist = Math.abs(arr[left - 1] - target);
        if (leftDist < closestDist) {
            closestIdx = left - 1;
            closestDist = leftDist;
        }
    }
    return { index: closestIdx, dist: closestDist };
}
```

2. **Single search pass** - Compute results once and share between markers and info panel:

```javascript
function findTraceDataAtX(xRounded, chartDiv) {
    const traces = chartDiv.data || [];
    const result = new Map();

    for (const trace of traces) {
        if (!trace.meta) continue;
        const { seriesName, aggType } = trace.meta;
        if (!seriesName || seriesName.includes('FloorShadow')) continue;

        const { index, dist } = binarySearchClosest(trace.x, xRounded);
        if (index >= 0 && dist <= 0.5) {
            const value = trace.y[index];
            if (value !== null && !isNaN(value)) {
                result.set(`${seriesName}-${aggType}`, { seriesName, aggType, value });
            }
        }
    }
    return result;
}
```

3. **Pass pre-computed data** to both functions:

```javascript
const traceData = findTraceDataAtX(xRounded, chartDiv);
updateDataMarkers(xRounded, chartDiv, traceData);
updateInfoPanel(coords.x, coords.y, chartDiv, traceData);
```

### Status: NOT YET FIXED

---

## Files Involved

| File | Lines | Purpose |
|------|-------|---------|
| `static/SCC/util/crosshair.js` | 608-615 | `formatSeriesName()` - series name display |
| `static/SCC/util/crosshair.js` | 460-466 | Linear search in `updateDataMarkers()` |
| `static/SCC/util/crosshair.js` | 554-560 | Linear search in `updateInfoPanel()` |
| `static/SCC/chartState.js` | 217-228 | `traceStyles` - where custom names are stored |
| `static/SCC/series/tracePipeline.js` | 464 | Where trace `.meta` is set |
