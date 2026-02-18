# Bug Fix: Year Corruption on Weekly Chart Date Input

## Problem

When setting a date on a count-per-week chart, the year field would show incorrect values — 1902, 1905, or 0000 — instead of the intended year (e.g. 2022). Once corrupted, the user could not correct it.

## Diagnosis

### Root cause

`parseLocalDate()` in `dates.js` parsed `YYYY-MM-DD` strings using the bare `Date` constructor:

```javascript
return new Date(year, month - 1, day);
```

JavaScript's `Date` constructor silently maps years 0–99 to 1900–1999. So year 2 becomes 1902, year 5 becomes 1905. The project already had a `createDate()` helper that avoids this by calling `setFullYear()`, but `parseLocalDate` didn't use the same pattern.

### Why weekly charts were affected

When the user interacts with the `<input type="date">` on a weekly chart, the browser fires a `change` event. The handler (`emitEntryDateChange` in `dataEntry.js`) runs the value through `snapToChartBoundary()`, which snaps the date to Monday. This snapping changes the date, so the code writes the result back into the input.

That write-back is the critical step: during normal browser interaction with the year field (typing, scrolling), the year can briefly be a small number like 2 or 5. The code parses it, corrupts it to 1902/1905, and writes it back — locking the user into the wrong year.

Daily charts didn't show this bug because snapping is a no-op (the date doesn't change), so the corrupted value was never written back to the input.

### The specific values

- **1902**: User typed "2" → browser value `0002-MM-DD` → `new Date(2, ...)` → year 1902
- **1905**: User typed "5" → browser value `0005-MM-DD` → `new Date(5, ...)` → year 1905
- **0000**: Browser's native display for an empty/zeroed year field before code runs

## Fix

One-line change in `parseLocalDate()` (`dates.js`). Replaced the bare constructor with the same `setFullYear()` pattern used by `createDate()`:

```javascript
// Before
return new Date(year, month - 1, day);

// After
const d = new Date(2000, month - 1, day);
d.setFullYear(year);
return d;
```

This ensures years 0–99 are preserved as-is instead of being mapped to 1900–1999.