# Start Date Selection Dialog - UX Specification

## Overview

A modal dialog allows users to set the chart's start date. The dialog dynamically displays different input controls depending on the current chart type. Each chart type has a specific granularity (day, month, year, decade), and the dialog only shows the relevant inputs for that granularity.

---

## Dialog Structure

### Window Properties
- **Title:** "Set Start Date"
- **Type:** Modal dialog (blocks interaction with parent window)
- **Layout:** Vertical stack of input rows, followed by action buttons

### Styling Guidelines
- Input controls (spinboxes, dropdowns) should be prominent:
  - Minimum height: ~45px
  - Minimum width: ~120px
  - Font size: 16px
  - Centered text alignment for numeric inputs
- Labels should be smaller (14px) and center-aligned
- Each input row is a horizontal layout: `[Label] [Input Control]`

---

## Chart-Type-Specific UI

The dialog determines which controls to show based on the chart type (case-insensitive matching).

### 1. DAILY Chart
Shows three inputs in vertical order:

| Row | Label    | Control Type | Description |
|-----|----------|--------------|-------------|
| 1   | "Sunday" | Dropdown     | Lists only Sundays in the selected month/year |
| 2   | "Month"  | Spinbox      | Range: 1-12 |
| 3   | "Year"   | Spinbox      | Range: 1679-2261 |

**Behavior:**
- When month or year changes, the Sunday dropdown repopulates with only the Sundays that exist in that month/year
- Sundays are calculated dynamically (day of week = 6 in zero-indexed weeks where Monday=0)
- Dropdown shows day numbers only (e.g., "5", "12", "19", "26")

### 2. WEEKLY Chart
Shows two inputs:

| Row | Label   | Control Type | Description |
|-----|---------|--------------|-------------|
| 1   | "Month" | Spinbox      | Range: 1-12 |
| 2   | "Year"  | Spinbox      | Range: 1679-2261 |

### 3. MONTHLY Chart
Shows one input:

| Row | Label  | Control Type | Description |
|-----|--------|--------------|-------------|
| 1   | "Year" | Spinbox      | Range: 1679-2261 |

### 4. YEARLY Chart
Shows one input:

| Row | Label    | Control Type | Description |
|-----|----------|--------------|-------------|
| 1   | "Decade" | Spinbox      | Range: 1600-2300, **step increment: 10** |

**Behavior:**
- Values snap to decade starts (1990, 2000, 2010, etc.)
- Displayed value is the decade start year

---

## Action Buttons

Two buttons at the bottom of the dialog, stacked vertically:

1. **"OK"** - Confirms selection and closes dialog
2. **"Cancel"** - Discards changes and closes dialog

---

## Date Initialization (Opening the Dialog)

When the dialog opens, it must convert the chart's internal start date to a user-visible date. The conversion differs by chart type:

### Internal Date → User-Visible Date

| Chart Type | Conversion Formula |
|------------|-------------------|
| Daily | Subtract `(dayOfWeek + 1)` days to get the previous Sunday |
| Weekly | Go back to the start of the previous month |
| Monthly | Go back to January 1st of the previous year |
| Yearly | Go back to the start of the current decade (`year - (year % 10)`) |

**Example for Daily:**
- Internal date: Wednesday, January 15, 2025
- dayOfWeek = 2 (Wednesday, where Monday=0)
- User-visible = January 15 - 3 days = **Sunday, January 12, 2025**

---

## Date Output (Closing the Dialog)

When the user clicks OK, convert the user-selected values back to an internal "antecedent" date:

### User Selection → Internal Date

| Chart Type | Conversion Formula |
|------------|-------------------|
| Daily | Selected Sunday + `(dayOfWeek + 1)` days (results in following Monday) |
| Weekly | First day of the **following** month |
| Monthly | January 1st of the **following** year |
| Yearly | January 1st of `(selected_decade + 9)` (last year of decade) |

**Examples:**

**Daily:** User selects Sunday, January 12, 2025
- dayOfWeek of Jan 12 = 6 (Sunday)
- Internal = Jan 12 + 7 days = **January 19, 2025**

**Weekly:** User selects March 2025
- Internal = **April 1, 2025**

**Monthly:** User selects 2024
- Internal = **January 1, 2025**

**Yearly:** User selects decade 2020
- Internal = **January 1, 2029** (2020 + 9)

---

## Sunday Population Algorithm

For Daily charts, populate the Sunday dropdown with all Sundays in the given month/year:

```
function getSundaysInMonth(year, month):
    sundays = []
    firstDay = new Date(year, month - 1, 1)  // month is 1-indexed
    lastDay = end of month

    for each day from firstDay to lastDay:
        if day.dayOfWeek == Sunday:  // Sunday = 0 in JS, 6 in Python (Monday=0)
            sundays.push(day.dayOfMonth)

    return sundays  // e.g., [6, 13, 20, 27]
```

---

## Integration Points

1. **Trigger:** A "Start Date" button in the settings panel opens this dialog
2. **On Accept:** Emit an event to update the chart's start_date with the converted internal date
3. **On Accept:** Trigger a chart refresh/redraw with the new start date

---

## Summary Table

| Chart Type | User Picks | User Sees | Internal Date Stored |
|------------|------------|-----------|---------------------|
| Daily | A specific Sunday | Sunday dropdown + Month + Year | The Monday after that Sunday |
| Weekly | A month | Month + Year | First day of next month |
| Monthly | A year | Year only | Jan 1 of next year |
| Yearly | A decade | Decade (step 10) | Jan 1 of decade's 10th year |

---

## Notes for Implementation

- The "minute" variants (DailyMinute, WeeklyMinute, etc.) follow the same rules as their base types
- All date arithmetic should handle edge cases (December → January, year boundaries)
- The spinbox year range (1679-2261) accommodates historical and future dates
- Decade spinbox enforces step=10 to prevent non-decade values
