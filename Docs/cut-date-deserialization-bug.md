# Bug Report: cut.date Deserialization (FrequencyCollections + Cut Lines)

**Error:** `TypeError: cut.date.getTime is not a function`
**Location:** `static/SCC/series/tracePipeline.js` — `createFrequencyTraces()`
**Symptom:** FrequencyCollections charts with cut lines crash on page load or when changing the start date.

---

## Root Cause

`cut.date` is not always a `Date` object when `tracePipeline.js` reads it.

### Why it was fine before

The old `chartStorage.js` used a recursive `serializeValue`/`deserializeValue` pair that traversed the entire chart state, encoding every `Date` as `{ __date__: '...' }` and restoring it on load. `cut.date` always came back as a `Date` regardless of how it arrived.

### Why it breaks now

After the storage refactoring, that recursive pair was removed. The new `serializeChart` does a shallow `{ ...state }` spread and stores directly to IndexedDB. IndexedDB's structured clone algorithm preserves `Date` objects — so the **local-only path** still works:

1. Draw cut lines → `cut.date` is a `Date` from `xPositionToDate()`
2. Auto-save → IndexedDB structured clone preserves the `Date`
3. Reload → `cut.date` is still a `Date` ✓

### The sync path breaks it

When a chart is **pushed to the server**, it's JSON-serialized. `Date` → ISO string. When **pulled back** via `syncChart()`:

```javascript
const chartData = await decrypt(chartKey, data);  // JSON-parsed — cut.date is now an ISO string
await db.put('charts', chartData);                 // stored as string in IndexedDB
```

On the next page load, `loadChart()` retrieves the chart from IndexedDB, and `cut.date` is now an ISO string. `.getTime()` is not a function on a string.

The same applies to `importChart()` — data arrives via JSON, `cut.date` is a string, and it's stored as a string.

### Why it "suddenly stopped working"

The FrequencyCollections chart with cut lines was only used locally until it was synced to the server. After the first push/pull cycle, `cut.date` became an ISO string permanently in IndexedDB.

---

## The Fix Applied

`tracePipeline.js` — defensive handling at the point of consumption:

```javascript
const cutTimestamps = Object.values(chartState.LineCuts).map(cut => {
    if (typeof cut.date === 'number') return cut.date;
    if (cut.date instanceof Date) return Math.floor(cut.date.getTime() / 1000);
    return Math.floor(new Date(cut.date).getTime() / 1000); // ISO string after JSON round-trip
});
```

---

## The Proper Fix (not yet done)

`deserializeChart()` in `chartStorage.js` normalizes `startDate` explicitly:

```javascript
chartState.startDate = deserializeDate(chartState.startDate);
```

`cut.date` should get the same treatment. After the `for (const key in data)` loop, add:

```javascript
if (chartState.LineCuts) {
    for (const cut of Object.values(chartState.LineCuts)) {
        if (cut.date && !(cut.date instanceof Date)) {
            cut.date = new Date(cut.date);
        }
    }
}
```

This fixes the problem at the source (load time) rather than defensively at every consumer. `lineClickHandler.js` also uses `cut.date` (via `dateToXPosition`, which happens to tolerate strings), but normalizing at load time is cleaner and safer for any future consumers.
