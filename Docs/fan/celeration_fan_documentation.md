# Celeration Fan Implementation Documentation

This document provides complete details for recreating the Standard Celeration Chart (SCC) "celeration fan" in Plotly.js.

---

## Overview

The celeration fan is a visual reference tool on Standard Celeration Charts showing standard rates of change (celeration values). It consists of 9 lines radiating from a common center point, each representing a different celeration multiplier.

---

## Core Data

### Celeration Values and Labels

```javascript
const celValues = [16, 4, 2, 1.4, 1, 1/1.4, 1/2, 1/4, 1/16];
const labels = ['×16', '×4', '×2', '×1.4', '×1', '÷1.4', '÷2', '÷4', '÷16'];
```

**Note:** The `×1` line is horizontal (angle = 0). Values > 1 angle upward, values < 1 angle downward.

### Period Labels by Chart Type

| Chart Type     | Period Label    | Unit Value |
|----------------|-----------------|------------|
| Daily          | "per week"      | 7          |
| Weekly         | "per month"     | 5          |
| Monthly        | "per 6 months"  | 6          |
| Yearly         | "per 5 years"   | 5          |
| DailyMinute    | "per week"      | 7          |
| WeeklyMinute   | "per month"     | 5          |
| MonthlyMinute  | "per 6 months"  | 6          |
| YearlyMinute   | "per 5 years"   | 5          |

---

## Mathematical Formula

### The Critical Angle Calculation

For each celeration value, the angle is calculated using:

```javascript
function calculateAngle(cel) {
    // cel = celeration value (e.g., 16, 4, 2, 1.4, 1, 1/1.4, etc.)
    const angleRadians = Math.atan(
        Math.log10(cel) / (Math.log10(2) / Math.tan(34 * Math.PI / 180))
    );
    const angleDegrees = angleRadians * (180 / Math.PI);
    return { degrees: angleDegrees, radians: angleRadians };
}
```

**Explanation:**
- `34 degrees` is the reference angle for a doubling (×2) celeration
- The formula maps celeration values to angles on a logarithmic scale
- `×1` produces 0 degrees (horizontal)
- `×2` produces ~34 degrees
- `×16` produces ~68 degrees (steepest upward)
- `÷16` produces ~-68 degrees (steepest downward)

### Line Endpoint Calculation

Given a center point `(x_mid, y_mid)` and line length:

```javascript
function calculateLineEndpoint(x_mid, y_mid, cel, lineLength, unit) {
    const angle = calculateAngle(cel);

    // Horizontal displacement
    const dx = lineLength * Math.cos(angle.radians);

    // Y endpoint (logarithmic scale)
    const y_end = y_mid * Math.pow(10, Math.log10(cel) * dx / unit);

    // X endpoint (linear)
    const x_end = x_mid + dx;

    return { x: x_end, y: y_end, dx: dx };
}
```

**Important:** The Y-axis is logarithmic! The y-coordinate calculation accounts for this:
```
y_end = y_mid * 10^(log10(cel) * dx / unit)
```

---

## Positioning

### Fan Center Point

| Chart Type    | X Position           | Y Position |
|---------------|----------------------|------------|
| Minute charts | `xmax * -0.22`       | `0.01`     |
| Non-minute    | `xmax * 1.04`        | `1000`     |

- Minute charts: Fan is positioned to the LEFT of the chart (negative x)
- Non-minute charts: Fan is positioned to the RIGHT of the chart

### Line Length

```javascript
const fanSize = 0.09;  // proportion of chart width
const lineLength = (x_max - x_min) * fanSize;
```

### Text Label Positioning

Labels are positioned beyond the line endpoints:

```javascript
function calculateTextDistance(label) {
    const baseDistance = 1.1;
    const charAdjustment = 0.05 * label.length;  // 5% increase per character
    return baseDistance + charAdjustment;
}

// Text position
const distanceFactor = calculateTextDistance(label);
const text_dx = dx * distanceFactor;
const text_x = x_mid + text_dx;
const text_y = y_mid * Math.pow(10, Math.log10(cel) * text_dx / unit);
```

---

## Styling

### Colors and Fonts

| Property         | Value                                   |
|------------------|-----------------------------------------|
| Line color       | Custom grid color (e.g., `#6ad1e3`)     |
| Line width       | 1                                       |
| Text color       | Same as line color                      |
| Text weight      | bold                                    |
| Label font size  | `general_fontsize * 0.6`                |
| Header font size | `general_fontsize * 0.7`                |

### Text Labels

Two additional text elements above and below the fan:

1. **Standard Text** (above): "Standard\n[celeration label]"
   - Position: Midpoint of ×1 line, y = `y_mid * 22`

2. **Period Text** (below): e.g., "per week"
   - Position: Midpoint of ×1 line, y = `y_mid / 22`

---

## Complete Plotly.js Implementation Example

```javascript
function createCelerationFan(xMid, yMid, chartWidth, unit, gridColor) {
    const celValues = [16, 4, 2, 1.4, 1, 1/1.4, 1/2, 1/4, 1/16];
    const labels = ['×16', '×4', '×2', '×1.4', '×1', '÷1.4', '÷2', '÷4', '÷16'];

    const fanSize = 0.09;
    const lineLength = chartWidth * fanSize;

    const traces = [];
    const annotations = [];

    celValues.forEach((cel, i) => {
        // Calculate angle
        const angleRad = Math.atan(
            Math.log10(cel) / (Math.log10(2) / Math.tan(34 * Math.PI / 180))
        );
        const angleDeg = angleRad * (180 / Math.PI);

        // Line endpoints
        const dx = lineLength * Math.cos(angleRad);
        const xEnd = xMid + dx;
        const yEnd = yMid * Math.pow(10, Math.log10(cel) * dx / unit);

        // Create line trace
        traces.push({
            x: [xMid, xEnd],
            y: [yMid, yEnd],
            mode: 'lines',
            line: { color: gridColor, width: 1 },
            hoverinfo: 'skip',
            showlegend: false
        });

        // Text label position
        const distFactor = 1.1 + 0.05 * labels[i].length;
        const textDx = dx * distFactor;
        const textX = xMid + textDx;
        const textY = yMid * Math.pow(10, Math.log10(cel) * textDx / unit);

        // Create annotation for label
        annotations.push({
            x: textX,
            y: Math.log10(textY),  // log scale annotation
            xref: 'x',
            yref: 'y',
            text: labels[i],
            showarrow: false,
            font: { color: gridColor, size: 10, weight: 'bold' },
            textangle: -angleDeg  // negative for Plotly rotation
        });
    });

    // "Standard celeration" label (above fan)
    const midDx = lineLength * Math.cos(0) / 2;  // ×1 line is horizontal
    annotations.push({
        x: xMid + midDx,
        y: Math.log10(yMid * 22),
        text: 'Standard<br>celeration',
        showarrow: false,
        font: { color: gridColor, size: 11, weight: 'bold' }
    });

    // Period label (below fan)
    annotations.push({
        x: xMid + midDx,
        y: Math.log10(yMid / 22),
        text: 'per week',  // adjust based on chart type
        showarrow: false,
        font: { color: gridColor, size: 11, weight: 'bold' }
    });

    return { traces, annotations };
}
```

---

## Key Points for Plotly Implementation

1. **Y-Axis is Logarithmic**
   - Use `yaxis: { type: 'log' }` in layout
   - When placing annotations, use `Math.log10(y)` for the y coordinate

2. **Clip to Plot Area**
   - Set `cliponaxis: false` on traces to allow drawing outside the main plot area
   - The fan is typically positioned outside the data region

3. **Text Rotation**
   - Plotly uses `textangle` (negative of the calculated angle)
   - Labels should rotate to follow the line angle

4. **Coordinate System**
   - X-axis: linear (days/weeks/months)
   - Y-axis: logarithmic (count per minute or raw count)

5. **Interactive Dragging** (optional)
   - The original uses blitting for performance
   - In Plotly, use `Plotly.relayout()` to update positions
   - Throttle updates to ~25ms for smooth dragging

---

## Reference Angles for Verification

| Celeration | Approximate Angle |
|------------|-------------------|
| ×16        | 68°               |
| ×4         | 51°               |
| ×2         | 34°               |
| ×1.4       | 17°               |
| ×1         | 0°                |
| ÷1.4       | -17°              |
| ÷2         | -34°              |
| ÷4         | -51°              |
| ÷16        | -68°              |

---

## Source Files

- **Primary Implementation:** `FigureManager.py` lines 2120-2544 (`DraggableFanManager` class)
- **Legacy Implementation:** `new_scc.py` lines 50-131 (`add_cel_fan()` function)
