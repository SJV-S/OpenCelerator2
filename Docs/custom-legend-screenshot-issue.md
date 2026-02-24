# Custom Legend Not Included in Chart Screenshots

## Problem

`takeChartScreenshot()` in `static/SCC/ui/share.js` uses `Plotly.downloadImage()`, which only renders Plotly's own SVG canvas (traces, axes, shapes, annotations). The custom legend (`#custom-legend`) is an HTML `<div>` absolutely positioned on top of the chart div. Plotly has no awareness of it, so it is excluded from the exported PNG.

## Relevant Files

| File | Role |
|------|------|
| `static/SCC/ui/share.js` | `takeChartScreenshot()` — calls `Plotly.downloadImage()` |
| `static/SCC/ui/customLegend.js` | Renders `#custom-legend` as HTML/SVG overlay inside chart div |

## Possible Solutions

### 1. Canvas composite

Use `Plotly.toImage()` to get the chart as a data URL, draw it onto a `<canvas>`, render the legend on top (via `html2canvas` or by manually drawing the legend SVGs onto the canvas), then export the combined result.

### 2. Plotly-native legend for export only

Temporarily inject a Plotly `layout.legend` (or layout annotations/images) that mirrors the custom legend content, take the screenshot, then remove it.

### 3. Full-page screenshot via html2canvas

Replace `Plotly.downloadImage()` with `html2canvas` (or similar) targeting the entire chart container, which would capture all DOM children including the HTML legend overlay.
