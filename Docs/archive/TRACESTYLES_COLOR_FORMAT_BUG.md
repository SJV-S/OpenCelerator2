# traceStyles.js Color Format Bug

## Issue

Console warnings appear when loading a chart:

```
traceStyles.js:348 The specified value "black" does not conform to the required format.  The format is "#rrggbb" where rr, gg, bb are two-digit hexadecimal numbers.
traceStyles.js:349 The specified value "black" does not conform to the required format.  The format is "#rrggbb" where rr, gg, bb are two-digit hexadecimal numbers.
traceStyles.js:350 The specified value "black" does not conform to the required format.  The format is "#rrggbb" where rr, gg, bb are two-digit hexadecimal numbers.
```

## Location

`static/SCC/series/traceStyles.js` around lines 348-350, in the `loadConfigPanel` function called from `selectAggregation`.

## Cause

HTML `<input type="color">` elements only accept hex format (`#rrggbb`). The code is setting the value to a named color like `"black"` instead of `"#000000"`.

## Fix

Convert named colors to hex format before setting the input value, or ensure stored/default colors are always in hex format.

Example fix:
```javascript
// Before
input.value = colorValue;  // "black"

// After
input.value = colorValue.startsWith('#') ? colorValue : namedColorToHex(colorValue);
```

Or simply use hex values in the defaults/storage.
