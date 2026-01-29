# TODO: Chart Date Labels for Non-Daily Charts

## Issue

`updateChartDateLabels()` in `static/SCC/util/dates.js` has hardcoded `idx * 28` for date label positioning:

```javascript
currentDate.setDate(startDate.getDate() + (idx * 28));
```

This assumes 28-day intervals (4 weeks) which is specific to Daily charts.

## Affected Chart Types

- Weekly: needs different interval calculation
- Monthly: needs month-based intervals
- Yearly: needs year-based intervals

## Location

`static/SCC/util/dates.js` - `updateChartDateLabels()` function

## Related

This was noted during implementation of X-position binning for aggregation (Jan 2026). The binning in `timestampsToXPositions()` and `xPositionToDate()` now handles chart type correctly, but the date label rendering still assumes Daily chart intervals.
