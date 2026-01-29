# Crosshair Feature Report

## Overview

The crosshair is an interactive overlay that appears on the chart when the user holds down a modifier key and moves the mouse. It provides visual tracking lines and displays detailed information about the data point nearest to the cursor.

---

## Visual Appearance

### Crosshair Lines

The crosshair consists of two perpendicular tracking lines:

| Property     | Value        |
|--------------|--------------|
| Color        | Gray         |
| Line Style   | Dashed (`--`) |
| Line Width   | 1 pixel      |

- **Vertical line**: Extends the full height of the chart, aligned with the cursor's x-position
- **Horizontal line**: Extends the full width of the chart, aligned with the cursor's y-position
- Lines can optionally be hidden while still showing other crosshair elements

### Data Point Markers

When hovering over data, colored markers highlight the data points at the current x-position:

| Data Type   | Marker Shape   | Color   | Size       |
|-------------|----------------|---------|------------|
| Corrects    | Circle         | Green   | 10px       |
| Incorrects  | Circle         | Red     | 10px       |
| Timing      | Triangle (down)| Purple  | 7px        |
| Other       | Square         | Orange  | 10px       |

All markers have 40% opacity (semi-transparent).

### Note Annotations

When the cursor hovers over a date that has attached notes, they appear as popup boxes:

| Property         | Value                     |
|------------------|---------------------------|
| Background Color | Light Yellow (`#FFFFA0`)  |
| Border Color     | Dark Goldenrod (`#B8860B`)|
| Corner Style     | Rounded                   |
| Padding          | 0.5 units                 |
| Text Color       | Black                     |
| Max Width        | 40 characters (with word wrap) |

Notes are connected to their data points with a solid black line (1px width).

---

## Info Panel

### Panel Appearance

A dedicated information panel appears in the sidebar when the crosshair is active:

| Property         | Value                          |
|------------------|--------------------------------|
| Width            | 199 pixels (fixed)             |
| Background       | White                          |
| Border           | 1px solid black                |
| Corner Radius    | 10px (top), 20px (bottom)      |
| Internal Padding | 10px on all sides              |

### Panel Title

| Property    | Value              |
|-------------|--------------------|
| Text        | "Crosshair Info"   |
| Font Weight | Bold               |
| Font Size   | 14px               |
| Alignment   | Center             |

### Info Label Text

| Property    | Value              |
|-------------|--------------------|
| Font Family | Monospace          |
| Font Size   | 12px               |
| Alignment   | Left, Top          |
| Word Wrap   | Enabled            |
| Min Height  | 100px              |
| Padding     | 5px                |

---

## Data Displayed in the Info Label

The info panel displays a structured breakdown of data at the cursor position:

### Date Section
- **Day**: Abbreviated day name and numeric date (e.g., "Mon | 15")
- **Month**: Abbreviated month name and numeric month (e.g., "Jan | 01")
- **Year**: Full four-digit year (e.g., "2024")

### Cursor Coordinates
- **x**: The x-coordinate position on the chart
- **y**: The y-coordinate value (formatted appropriately for the data type)

### Data Values (Per Column)

For each visible data column, the panel shows:

**For raw (non-aggregated) data:**
- Column name (bold header)
- Single value or list of values at that x-position

**For aggregated data:**
- Column name (bold header)
- Value(s) at the position
- Aggregation description (how the data was combined)
- Entry count label (number of entries in the aggregation)

**Special handling for Timing data:**
- Displays the timing floor value (reciprocal of frequency) rather than raw frequency values

---

## Activation Controls

| Key Held | Behavior                                      |
|----------|-----------------------------------------------|
| Shift    | Shows crosshair with tracking lines visible   |
| Alt      | Shows crosshair without tracking lines        |

The crosshair activates when the modifier key is pressed and the mouse moves over the chart. Releasing the key hides the crosshair and restores the normal sidebar tabs.

---

## Summary

The crosshair provides a sophisticated data inspection tool with:

- Gray dashed tracking lines for precise position reference
- Color-coded markers distinguishing different data types
- Yellow popup boxes for note display
- A clean white info panel with organized date, coordinate, and value information
- Keyboard-activated display with optional line visibility
