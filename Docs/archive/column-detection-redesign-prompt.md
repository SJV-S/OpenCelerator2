# Research Prompt: Redesign Column Type Detection for Spreadsheet Import

## Context

I have a vanilla JavaScript (ES6 modules, no frameworks) web app that imports spreadsheet files (CSV, XLSX, XLS, ODS) using the **SheetJS (XLSX)** library loaded via script tag. The import module needs to classify each column as either a **date column** or a **numeric data column**, so it can populate mapping dropdowns in the UI. The user then confirms which column is their date column, which are data columns, etc.

## The Problem

The current detection logic (`detectColumnTypes` / `lazyCheck`) is a brittle multi-stage heuristic mess that keeps producing false positives — classifying numeric data columns as date columns. It has accumulated patches on patches and fundamentally does not work reliably. I need a **ground-up redesign**.

## How SheetJS Delivers Data

The file is read with:
```js
const workbook = XLSX.read(data, { type: 'array', codepage: 65001, cellDates: true });
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
```

With `cellDates: true`, SheetJS returns:
- **Date-formatted cells** → JavaScript `Date` objects
- **Numeric cells** → JavaScript `number` values
- **Text cells** → JavaScript `string` values
- **Empty cells** → `''` (due to `defval: ''`)

So by the time detection runs, each cell value has a JS type: `Date`, `number`, `string`, or `''`.

**Important caveat:** `cellDates: true` relies on SheetJS recognizing the cell as date-formatted. For well-formed XLSX files this works reliably. For CSV files, SheetJS infers formatting heuristically — common date formats (ISO, US, EU) are recognized, but unusual formats may arrive as strings. We cannot assume all dates will be `Date` objects — some may be date-like strings.

## What the Detection Must Do

Given an array of row objects (from `sheet_to_json`), classify each column into one of:
- **date** — the column contains dates (for the x-axis)
- **numeric** — the column contains numeric data values (for y-axis series)
- **other** — text labels, IDs, or unclassifiable columns (shown in dropdowns but not prioritized)

### Requirements

1. **Dates must never be confused with data, and data must never be confused with dates.** This is the #1 requirement. A column of values like `[18.93, 18.92, 18.94, ...]` (Gold prices) must NEVER be detected as dates, regardless of whether those values are integers, small floats, or happen to fall in some numeric range. Similarly, `[0, 0, 0, 3.37, 0, ...]` must not be flagged as dates.

2. **Date detection must be robust across formats.** Dates could arrive as:
   - `Date` objects (from `cellDates: true`) — this is the ideal/common case
   - ISO strings: `"2024-01-15"`, `"2024-01-15T00:00:00.000Z"`
   - US format strings: `"01/15/2024"`, `"1/15/2024"`
   - EU format strings: `"15.01.2024"`, `"15-01-2024"`
   - Partial dates: `"2024-01"`, `"Jan 2024"`, `"2024"`
   - Abbreviated: `"15-Jul-2024"`, `"Jul-2024"`
   - Historical dates going back to the 1800s (no lower year bound cutoff like 1900)

3. **Detection must be economical.** Don't scan every row. A sample of the first N rows (e.g., 10-20) is sufficient.

4. **One date column expected, many data columns expected.** In practice, the user's file has exactly one date column and 1-10+ numeric data columns. The detection should be biased toward finding exactly one strong date candidate, not flagging multiple columns as dates.

5. **No false positives on data columns.** If in doubt, classify as numeric, not date. A missed date column just means the user manually selects it from the dropdown (minor inconvenience). A data column falsely hidden from the data dropdowns means the user can't map their data at all (broken).

6. **The result feeds UI dropdowns.** `dateColumns` populate the date dropdown (with priority ordering). `numericColumns` populate the data dropdowns. Date columns are excluded from data dropdowns. So a false date classification directly removes a data column from the user's options.

## Current Broken Implementation (for reference — do NOT build on this)

The current code uses a function `lazyCheck` with 4 stages:

- **Stage 0**: `value instanceof Date` — checks for Date objects. Works but had a `year >= 1900` cutoff that rejected historical data.
- **Stage 1**: Checks if a number is an "Excel serial date" by range (`1 to 73050` or negative). **This is the main source of false positives** — any integer data value in that range gets flagged as a date. Values like 18 (Gold price), 6 (S&P500), etc.
- **Stage 2**: Regex pattern matching on stringified values. Works OK for well-formatted date strings.
- **Stage 3**: Fallback heuristics including `new Date(strValue)` which in Firefox treats `new Date("0")` as valid, causing all-zero columns to be flagged as dates.

The threshold is 70% of sampled cells must match. The fundamental flaw is that numeric ranges and native `Date()` parsing are way too permissive — they match ordinary data values.

## What I Want You to Design

A replacement `detectColumnTypes(rows)` function that:

1. **Uses type-first detection.** Since `cellDates: true` gives us actual JS types, the primary signal should be `instanceof Date`, not pattern matching on stringified numbers. If >70% of sampled values in a column are `Date` objects, it's a date column. Done. No ambiguity.

2. **Falls back to string pattern matching only for string values.** If a column's values are strings (not numbers, not Date objects), then and only then apply regex/heuristic date detection on those strings. Numbers should NEVER enter the date detection path.

3. **Never classifies a column of numbers as dates.** If the dominant type in a column is `number`, it's numeric data. Period. No checking numeric ranges, no converting to Date, no Excel serial number guessing. The `cellDates: true` option already handles that upstream.

4. **Handles mixed-type columns gracefully.** In edge cases a column might have a mix of types (some strings, some numbers, some empty). The detection should classify based on the dominant non-empty type.

5. **Returns `{ dateColumns: string[], numericColumns: string[] }`.** Same interface as current code — the rest of the import pipeline depends on this shape.

## Constraints

- Vanilla JavaScript, ES6 modules. No TypeScript, no npm packages, no build step.
- SheetJS is the only external dependency (loaded via `<script>` tag, available as global `XLSX`).
- The function receives `rows` as an array of plain objects (from `sheet_to_json`). Column names are the object keys.
- Must handle empty/sparse columns (skip empties, classify based on non-empty values).
- Keep it simple and readable. No over-engineering.

## Deliverable

Give me a complete replacement for `detectColumnTypes` and any helper functions it needs. Include clear comments explaining the logic. I'll drop it into the existing module as-is.
