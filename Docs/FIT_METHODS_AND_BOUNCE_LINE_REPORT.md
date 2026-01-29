# Fit Methods and Bounce Line Implementation Report

## Purpose

This document describes the trend fitting algorithms and bounce line calculations used in the OpenCelerator charting system. The goal is to provide sufficient detail for reproducing this functionality in JavaScript using Plotly.

---

## Overview

The system plots data on a **semi-logarithmic scale** (linear x-axis, logarithmic y-axis). All fitting calculations are performed in **log-space** on the y-values, then converted back to linear scale for display.

Key concept: **Celeration** is the rate of change (slope) expressed as a multiplication or division factor per time unit (e.g., "x2.5/week" means values multiply by 2.5 each week).

---

## Chart Structure

### Axes Configuration

```javascript
// Plotly equivalent configuration
const layout = {
    xaxis: {
        type: 'linear',
        // x values are sequential integers (0, 1, 2, ...) representing days/weeks
    },
    yaxis: {
        type: 'log',
        range: [Math.log10(ymin), Math.log10(ymax)]
        // Common ranges:
        // Daily chart: [0.69, 1000000]
        // Minute chart: [0.00069, 1000]
    }
};
```

### Data Point Structure

```javascript
// Each data point has:
const dataPoint = {
    x: 5,           // Sequential position (integer)
    y: 42,          // Count/measurement value (positive number)
    date: '2024-01-15'  // Actual date for reference
};
```

---

## Fit Methods (6 Total)

All fit methods work with data transformed to log-space:

```javascript
// Transform y values to log space before fitting
const y_log = y_values.map(v => Math.log10(v));

// After fitting, convert back
const trend_linear = trend_log.map(v => Math.pow(10, v));
```

### 1. Theil-Sen (Robust Non-Parametric)

**Description**: Uses the median of all pairwise slopes. Highly robust against outliers (up to 29.3% of data can be outliers without affecting the result).

**Algorithm**:

```javascript
function theilSenFit(x, y) {
    // x and y are arrays of equal length
    // y should already be in log-space: y = originalY.map(v => Math.log10(v))

    const n = x.length;
    const slopes = [];

    // Calculate all pairwise slopes
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const dx = x[j] - x[i];
            if (dx !== 0) {
                const dy = y[j] - y[i];
                slopes.push(dy / dx);
            }
        }
    }

    // Median slope
    slopes.sort((a, b) => a - b);
    const slope = median(slopes);

    // Calculate intercepts for each point, take median
    const intercepts = x.map((xi, i) => y[i] - slope * xi);
    const intercept = median(intercepts);

    return { slope, intercept };
}

function median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}
```

### 2. Least-Squares (Standard Linear Regression)

**Description**: Minimizes sum of squared residuals. Fast but sensitive to outliers.

**Algorithm**:

```javascript
function leastSquaresFit(x, y) {
    // y should already be in log-space
    const n = x.length;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
}

// Alternative using numpy-style polyfit equivalent:
// const [slope, intercept] = polynomialFit(x, y_log, 1);
```

### 3. Quarter-Intersect (Classic Celeration Method)

**Description**: Divides data into halves, finds median x and y for each half, draws line through those two points. Traditional method in Precision Teaching.

**Algorithm**:

```javascript
function quarterIntersectFit(x, y) {
    // y should already be in log-space

    // Find the midpoint
    const midX = median(x);

    // Split data into first and second halves
    const firstHalf = { x: [], y: [] };
    const secondHalf = { x: [], y: [] };

    for (let i = 0; i < x.length; i++) {
        if (x[i] < midX) {
            firstHalf.x.push(x[i]);
            firstHalf.y.push(y[i]);
        } else if (x[i] > midX) {
            secondHalf.x.push(x[i]);
            secondHalf.y.push(y[i]);
        }
        // Points exactly at midX are excluded
    }

    // Find median of each quarter
    const x1 = median(firstHalf.x);
    const y1 = median(firstHalf.y);
    const x2 = median(secondHalf.x);
    const y2 = median(secondHalf.y);

    // Calculate slope and intercept
    const slope = (y2 - y1) / (x2 - x1);
    const intercept = y1 - slope * x1;

    return { slope, intercept };
}
```

### 4. Split-Middle-Line (MAD-Optimized Quarter-Intersect)

**Description**: Starts with quarter-intersect, then adjusts the intercept so equal numbers of points fall above and below the line. Optimizes Mean Absolute Deviation.

**Algorithm**:

```javascript
function splitMiddleLineFit(x, y) {
    // y should already be in log-space

    // Start with quarter-intersect
    const { slope, intercept } = quarterIntersectFit(x, y);

    // Calculate the trend line at each x
    const trend = x.map(xi => slope * xi + intercept);

    // Calculate residuals (differences from trend)
    const differences = y.map((yi, i) => yi - trend[i]);

    // Find median difference - this ensures half above, half below
    const medianDiff = median(differences);

    // Adjust intercept by median difference
    return { slope, intercept: intercept + medianDiff };
}
```

### 5. Mean (Horizontal Line at Mean)

**Description**: Flat horizontal line at the mean of all y values. No slope (celeration = x1.0).

**Algorithm**:

```javascript
function meanFit(x, y) {
    // y should already be in log-space
    const meanY = y.reduce((a, b) => a + b, 0) / y.length;

    return { slope: 0, intercept: meanY };
}
```

### 6. Median (Horizontal Line at Median)

**Description**: Flat horizontal line at the median of all y values. More robust than mean.

**Algorithm**:

```javascript
function medianFit(x, y) {
    // y should already be in log-space
    const medianY = median(y);

    return { slope: 0, intercept: medianY };
}
```

---

## Complete Fitting Workflow

```javascript
function fitTrend(x, y_original, fitMethod = 'Quarter-intersect', forecast = 0) {
    // Step 1: Convert y to log-space
    const y_log = y_original.map(v => Math.log10(v));

    // Step 2: Select and apply fit method
    let result;
    switch (fitMethod) {
        case 'Theil-Sen':
            result = theilSenFit(x, y_log);
            break;
        case 'Least-squares':
            result = leastSquaresFit(x, y_log);
            break;
        case 'Quarter-intersect':
            result = quarterIntersectFit(x, y_log);
            break;
        case 'Split-middle-line':
            result = splitMiddleLineFit(x, y_log);
            break;
        case 'Mean':
            result = meanFit(x, y_log);
            break;
        case 'Median':
            result = medianFit(x, y_log);
            break;
        default:
            result = quarterIntersectFit(x, y_log);
    }

    const { slope, intercept } = result;

    // Step 3: Create extended x range (for forecast/projection)
    const xMin = Math.min(...x);
    const xMax = Math.max(...x) + forecast;
    const extended_x = [];
    for (let i = xMin; i <= xMax; i++) {
        extended_x.push(i);
    }

    // Step 4: Calculate trend line in log-space
    const trend_log = extended_x.map(xi => slope * xi + intercept);

    // Step 5: Convert back to linear scale
    const trend = trend_log.map(v => Math.pow(10, v));

    return { trend, extended_x, slope, intercept };
}
```

---

## Bounce Lines (5 Envelope Types)

Bounce lines show the variability/spread of data around the trend. They are calculated from **residuals** (differences between actual log-values and fitted trend).

### Core Bounce Calculation

```javascript
function calculateBounce(bounceEnvelope, y_original, slope, extended_x, intercept) {
    if (bounceEnvelope === 'None') {
        return null;
    }

    // Convert y to log-space
    const y_log = y_original.map(v => Math.log10(v));

    // Calculate fitted trend for original data points only
    // (use the portion of extended_x that corresponds to original data)
    const x_original = extended_x.slice(0, y_original.length);
    const trend_at_data = x_original.map(xi => slope * xi + intercept);

    // Calculate residuals in log-space
    const residuals = y_log.map((yi, i) => yi - trend_at_data[i]);

    // Calculate bounds based on envelope type
    let bounds;
    switch (bounceEnvelope) {
        case '5-95 percentile':
            bounds = {
                upper: percentile(residuals, 95),
                lower: percentile(residuals, 5)
            };
            break;

        case 'Interquartile range':
            const q75 = percentile(residuals, 75);
            const q25 = percentile(residuals, 25);
            const iqr = q75 - q25;
            bounds = {
                upper: q75,
                lower: q25 - iqr  // Extends below Q1 by one IQR
            };
            break;

        case 'Standard deviation':
            const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
            const std = standardDeviation(residuals);
            bounds = {
                upper: mean + std,
                lower: mean - std
            };
            break;

        case '90% confidence interval':
        default:
            const mean_ci = residuals.reduce((a, b) => a + b, 0) / residuals.length;
            const std_error = standardDeviation(residuals) / Math.sqrt(residuals.length);
            const margin = 1.645 * std_error;  // 90% CI z-score
            bounds = {
                upper: mean_ci + margin,
                lower: mean_ci - margin
            };
            break;
    }

    // Apply bounds to trend line (in log-space)
    const log_upper = extended_x.map(xi => slope * xi + intercept + bounds.upper);
    const log_lower = extended_x.map(xi => slope * xi + intercept + bounds.lower);

    // Convert back to linear scale
    const upper_bounce = log_upper.map(v => Math.pow(10, v));
    const lower_bounce = log_lower.map(v => Math.pow(10, v));

    // Calculate bounce ratio (spread factor)
    const bounceRatio = upper_bounce[0] / lower_bounce[0];

    return { upper_bounce, lower_bounce, bounceRatio };
}
```

### Helper Functions

```javascript
function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
        return sorted[lower];
    }

    // Linear interpolation
    const fraction = index - lower;
    return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function standardDeviation(arr) {
    const n = arr.length;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const squaredDiffs = arr.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(avgSquaredDiff);
}
```

### Bounce Envelope Descriptions

| Envelope | Upper Bound | Lower Bound | Use Case |
|----------|-------------|-------------|----------|
| **5-95 percentile** | 95th percentile of residuals | 5th percentile of residuals | Captures 90% of data spread |
| **Interquartile range** | Q3 (75th percentile) | Q1 - IQR | Robust, extends downward |
| **Standard deviation** | mean + 1 SD | mean - 1 SD | ~68% of data (normal dist) |
| **90% confidence interval** | mean + 1.645 * SE | mean - 1.645 * SE | Statistical inference |

---

## Celeration Label Calculation

The celeration value shown on the chart is the multiplication factor per time unit.

```javascript
function getCelerationLabel(slope, timeUnit = 'weekly') {
    // slope is in log-space per x-unit
    // Convert to multiplication factor per time unit

    const dayMultiples = {
        'daily': 1,
        'weekly': 7,
        'monthly': 28,       // 4 weeks
        'six-monthly': 182,  // 26 weeks
        'yearly': 365,
        'five-yearly': 1825  // 5 years
    };

    const daysPerUnit = dayMultiples[timeUnit] || 7;

    // Calculate celeration factor
    let cel = Math.pow(10, slope * daysPerUnit);

    // Format the label
    let symbol = 'x';
    if (cel < 1) {
        symbol = '÷';
        cel = 1 / cel;
    }

    // Get unit abbreviation
    const unitAbbrev = {
        'daily': 'd',
        'weekly': 'w',
        'monthly': '4w',
        'six-monthly': '26w',
        'yearly': 'y',
        'five-yearly': '5y'
    };

    const unit = unitAbbrev[timeUnit] || 'w';

    return `${symbol}${cel.toFixed(2)} / ${unit}`;
}
```

---

## Complete Plotly Implementation Example

```javascript
// Sample data
const rawData = [
    { x: 0, y: 5, date: '2024-01-01' },
    { x: 1, y: 8, date: '2024-01-02' },
    { x: 2, y: 6, date: '2024-01-03' },
    { x: 3, y: 12, date: '2024-01-04' },
    { x: 4, y: 15, date: '2024-01-05' },
    { x: 5, y: 18, date: '2024-01-06' },
    { x: 6, y: 14, date: '2024-01-07' },
    { x: 7, y: 22, date: '2024-01-08' },
    { x: 8, y: 28, date: '2024-01-09' },
    { x: 9, y: 25, date: '2024-01-10' }
];

// Extract x and y arrays
const x = rawData.map(d => d.x);
const y = rawData.map(d => d.y);

// Fit the trend
const fitMethod = 'Theil-Sen';
const forecast = 5; // Extend 5 units into future
const { trend, extended_x, slope, intercept } = fitTrend(x, y, fitMethod, forecast);

// Calculate bounce lines
const bounceEnvelope = '5-95 percentile';
const bounce = calculateBounce(bounceEnvelope, y, slope, extended_x, intercept);

// Create Plotly traces
const traces = [
    // Data points
    {
        x: x,
        y: y,
        mode: 'markers',
        type: 'scatter',
        name: 'Data',
        marker: { size: 10, color: 'blue' }
    },
    // Trend line
    {
        x: extended_x,
        y: trend,
        mode: 'lines',
        type: 'scatter',
        name: 'Trend',
        line: { color: 'green', width: 2 }
    }
];

// Add bounce lines if calculated
if (bounce) {
    traces.push(
        {
            x: extended_x,
            y: bounce.upper_bounce,
            mode: 'lines',
            type: 'scatter',
            name: 'Upper Bounce',
            line: { color: 'green', width: 1, dash: 'dot' }
        },
        {
            x: extended_x,
            y: bounce.lower_bounce,
            mode: 'lines',
            type: 'scatter',
            name: 'Lower Bounce',
            line: { color: 'green', width: 1, dash: 'dot' }
        }
    );
}

// Layout with log y-axis
const layout = {
    title: 'Celeration Chart',
    xaxis: {
        title: 'Days',
        type: 'linear'
    },
    yaxis: {
        title: 'Count',
        type: 'log',
        autorange: true
    },
    showlegend: true
};

// Add celeration label as annotation
const celLabel = getCelerationLabel(slope, 'weekly');
layout.annotations = [{
    x: extended_x[Math.floor(extended_x.length / 2)],
    y: Math.log10(trend[Math.floor(trend.length / 2)]) + 0.3,
    text: celLabel,
    showarrow: false,
    font: { size: 14, color: 'green', weight: 'bold' }
}];

// Render
Plotly.newPlot('chart', traces, layout);
```

---

## Important Mathematical Notes

### Why Log-Space?

1. **Multiplicative relationships**: In behavioral data, change is often proportional (doubling, halving) rather than additive
2. **Constant angle = constant celeration**: On a semi-log chart, a straight line represents consistent proportional growth/decay
3. **Symmetric errors**: In log-space, x2 and ÷2 are equidistant from the mean

### Converting Between Representations

```javascript
// From slope to celeration factor (weekly)
const weeklyFactor = Math.pow(10, slope * 7);

// From celeration factor to slope
const slope = Math.log10(weeklyFactor) / 7;

// Example: x2.0/week means slope = log10(2)/7 ≈ 0.043
```

### Handling Edge Cases

```javascript
// Minimum data points required
const MIN_POINTS = 3;

// Handle zeros (log(0) is undefined)
const y_safe = y.map(v => v <= 0 ? 0.001 : v);  // Replace with small positive value

// Handle all identical x values
if (new Set(x).size === 1) {
    // Cannot fit a line, use mean/median instead
}
```

---

## Summary Table

| Method | Robustness | Speed | Best For |
|--------|------------|-------|----------|
| Theil-Sen | Excellent | Slow (O(n²)) | Data with outliers |
| Least-squares | Poor | Fast (O(n)) | Clean, normal data |
| Quarter-intersect | Good | Fast | Traditional celeration |
| Split-middle-line | Good | Fast | Balanced fit |
| Mean | N/A | Fast | No trend, central tendency |
| Median | Good | Fast | No trend, robust central tendency |

---

## File References (Original Python Implementation)

- **Fit Methods**: `DataManager.py` lines 1458-1591 (class `TrendFitter`)
- **Bounce Calculation**: `DataManager.py` lines 1592-1623 (`_calculate_bounce`)
- **Trend Plotting**: `DataManager.py` lines 1222-1301 (`plot_cel_trend`)
- **Chart Templates**: `scc.py` lines 1-700+ (Daily, Weekly, Monthly, Yearly charts)
