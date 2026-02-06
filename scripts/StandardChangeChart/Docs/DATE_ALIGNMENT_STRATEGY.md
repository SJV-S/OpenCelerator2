# Date Alignment Strategy by Chart Type

This document describes how each chart type in `scc.py` aligns/converts the user-provided `start_date` to a standardized reference point for consistent chart rendering.

---

## Daily / DailyMinute

**Strategy:** Align to the **previous Sunday**

**Code location:** `DailyTemplate._setup_axes()` (line 175)

```python
self.first_sunday = self.start_date - pd.Timedelta(self.start_date.dayofweek + 1, unit="D")
```

**How it works:**
- Takes the provided start date
- Subtracts `(dayofweek + 1)` days to find the preceding Sunday
- `dayofweek` returns 0 for Monday through 6 for Sunday
- Adding 1 and subtracting ensures we always land on Sunday

**Example:**
- Input: Wednesday, January 15, 2025 (dayofweek = 2)
- Calculation: 15 - (2 + 1) = 15 - 3 = January 12, 2025 (Sunday)

**Rationale:** Daily charts span 140 days (20 weeks). Aligning to Sunday ensures weeks are displayed consistently with Sunday as the week boundary.

---

## Weekly / WeeklyMinute

**Strategy:** Align to the **first day of the previous month**, then map each position to **Sundays within months**

**Code location:** `WeeklyTemplate._setup_axes()` (line 391) and `get_sundays_for_months()` (line 369)

```python
self.weekday_of_previous_month = (self.start_date.replace(day=1) - pd.Timedelta(days=1)).replace(day=1).normalize()
```

**How it works:**
1. Take the start date and go to the 1st of that month
2. Subtract 1 day to get the last day of the previous month
3. Replace day with 1 to get the first day of the previous month
4. Generate 20 months from that starting point
5. For each month, find all Sundays within that month (up to 5 per month)

**Sunday extraction:**
```python
def get_sundays_for_months(self, months):
    for month in months:
        start_date = pd.to_datetime(month).normalize().replace(day=1)
        sundays = pd.date_range(start_date, periods=31, freq='W-SUN')
        sundays = [sunday for sunday in sundays if sunday.month == start_date.month]
```

**Example:**
- Input: March 15, 2025
- Step 1: March 1, 2025
- Step 2: February 28, 2025
- Step 3: February 1, 2025 (chart starts here)
- X-axis positions map to Sundays within each month starting from February

**Rationale:** Weekly charts show data across months. Starting from the previous month provides context, and using Sundays as reference points maintains weekly alignment.

---

## Monthly / MonthlyMinute

**Strategy:** Align to **January 1st of the previous year**

**Code location:** `MonthlyTemplate._setup_axes()` (line 632)

```python
self.start_date_of_previous_year = self.start_date.replace(year=self.start_date.year - 1, month=1, day=1).normalize()
```

**How it works:**
- Takes the year from the start date
- Subtracts 1 year
- Sets month to January and day to 1
- Creates 121 monthly positions from that starting point

**Example:**
- Input: March 15, 2025
- Output: January 1, 2024 (chart starts here)

**Rationale:** Monthly charts span 10 years (120 months). Starting from January of the previous year provides a full year of prior context and aligns with calendar year boundaries.

---

## Yearly / YearlyMinute

**Strategy:** Align to **January 1st of the current decade** (round down to nearest decade)

**Code location:** `YearlyTemplate._setup_axes()` (line 824)

```python
self.start_date_of_decade = self.start_date.replace(
    year=self.start_date.year - (self.start_date.year % 10),
    month=1,
    day=1
).normalize()
```

**How it works:**
- Takes the year from the start date
- Calculates `year % 10` to find how many years into the current decade
- Subtracts that value to get the decade start year
- Sets month to January and day to 1
- Creates 101 yearly positions from that starting point

**Example:**
- Input: March 15, 2025
- Calculation: 2025 - (2025 % 10) = 2025 - 5 = 2020
- Output: January 1, 2020 (chart starts here)

**Rationale:** Yearly charts span 100 years (10 decades). Aligning to decade boundaries provides clean groupings for long-term trend visualization.

---

## Summary Table

| Chart Type | Alignment Strategy | Reference Point |
|------------|-------------------|-----------------|
| Daily | Previous Sunday | `start_date - (dayofweek + 1) days` |
| Weekly | Previous month's Sundays | 1st of month before start_date, then Sundays |
| Monthly | Previous year start | January 1 of (year - 1) |
| Yearly | Decade start | January 1 of (year - year%10) |

---

## Date-to-Position Mapping

All chart types create a `date_to_pos` dictionary that maps actual dates to x-axis positions:

```python
self.date_to_pos = {self.all_dates[i]: i for i in range(len(self.all_dates))}
```

This allows data points with arbitrary dates to be placed at the correct x-coordinate on the chart.
