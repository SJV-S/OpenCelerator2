# Misc Series Change Line Bug - Status

## Two Bugs Identified

### Bug 1: Lines Land on Wrong Series
No matter which misc series is selected in the toaster menu, lines may land on the same data series.

**Suspected causes:**
- Trace meta.seriesName values not distinct across misc series
- Button closure not capturing miscId correctly
- Series matching logic in getDataInRangeForSeries

### Bug 2: Position Shift (Timezone Issue)
Change lines appear shifted from where user placed them.

**Root cause:** Date round-trip through storage
1. `xPositionToDate(56)` creates date, stored as ISO string
2. ISO strings like `"1946-12-31T23:00:00.000Z"` shift across timezone boundaries
3. `parseLocalDate` fallback parses ISO and can shift to next day in UTC+1
4. `dateToXPosition()` returns wrong x value

## Current Debug Logging

All `[CEL DEBUG]` logs are captured by `debug.js`. Use:
- `window.downloadDebugLog()` - download log file
- `window.clearDebugLog()` - clear collected logs

### Key Debug Points:

**For Bug 1 (series selection):**
- `selectSeriesAndEnableDrag called with:` - shows which series button was clicked
- `Looking for series: X | All trace seriesNames:` - shows target vs available
- `Matched N traces, found M points` - shows if matching worked

**For Bug 2 (position shift):**
- `DATE STORAGE: x1=N -> date1=ISO` - when line is created
- `DATE RETRIEVAL: stored=ISO -> x1=N` - when line is redrawn
- `parseLocalDate ISO fallback:` - when ISO string triggers fallback parsing

## Files Modified
- `static/SCC/util/dates.js` - `parseLocalDate` debug for ISO fallback
- `static/SCC/lines/celLine.js` - Streamlined debug, added date round-trip logging
- `static/SCC/debug.js` - Updated prefixes to `[CEL DEBUG]`, `[STORAGE]`

## Key Functions
1. `xPositionToDate()` - dates.js:303 - converts x-position to Date
2. `dateToXPosition()` - dates.js:344 - converts Date back to x-position
3. `parseLocalDate()` - dates.js:161 - parses dates, has ISO fallback issue
4. `getDataInRangeForSeries()` - celLine.js:736 - matches traces by seriesName
5. `redrawCelLines()` - celLine.js:1051 - rebuilds lines from stored metadata

## Next Steps
1. Test with debug logging to confirm which bug is primary
2. For Bug 1: Check if trace seriesNames are distinct in console
3. For Bug 2: Check if ISO strings are being stored and causing shifts
4. Potential fix: Store x-positions directly instead of dates
