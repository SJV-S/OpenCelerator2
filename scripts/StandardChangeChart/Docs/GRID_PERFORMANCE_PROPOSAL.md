# Grid Performance Optimization Proposal

## Problem Statement

Users experience high CPU usage and fan activity when panning the chart. Firefox Profiler analysis revealed that Plotly's internal rendering consumes ~40% CPU during pan operations, with an additional 39% spent on browser layout/reflow.

This makes aggressive panning feel sluggish and causes unnecessary system resource consumption.

## Investigation Summary

### Initial Hypotheses (Disproven)

1. **Unthrottled mousemove handlers** - We optimized `celLine.js` and `cutLines.js` to use DOM overlays instead of Plotly calls. This improved line drawing performance but did not affect panning.

2. **Shape layer visibility** - We tested hiding the `.shapelayer` via CSS `visibility: hidden` during pan. This had **zero effect** on CPU usage, disproving the theory that shape rendering was the bottleneck.

### Root Cause (Confirmed via Deep Research)

Plotly.js handles **traces** and **shapes** fundamentally differently during pan:

| Element Type | During Pan | Performance |
|--------------|-----------|-------------|
| **Traces** | CSS `transform: translate()` applied to container | O(1) - single attribute update |
| **Shapes** | Full DOM removal and recreation | O(n) - n DOM operations |

The critical code path for shapes during pan:
```
Pan event → Plotly.relayout() → Registry.getComponentMethod('shapes', 'draw')
  → selectAll('path').remove()      // DELETE all shape DOM elements
  → calcToPaper() for each shape    // RECALCULATE pixel positions
  → Create new SVG path elements    // RECREATE all DOM elements
```

### Why Our Chart Is Affected

The SCC chart templates (Daily, Weekly, Monthly, Yearly, FrequencyCollections) draw the **entire grid as individual Plotly shapes** via `fig.add_shape()`. This provides precise visual control over the logarithmic chart appearance but creates a massive performance burden:

| Grid Component | Shape Count (Daily) |
|----------------|---------------------|
| `minor_vertical_grid()` | 280 shapes |
| `major_vertical_grid()` | ~40 shapes |
| `minor_horizontal_grid()` | ~50 shapes |
| `major_horizontal_grid()` | ~13 shapes |
| Tick marks, spines, etc. | ~50 shapes |
| **Total** | **~430 shapes** |

During pan, Plotly performs **430 DOM deletions + 430 coordinate calculations + 430 DOM creations** per frame. The browser then recalculates layout for all these elements, causing the 39% layout/reflow overhead observed in profiling.

### Why CSS Visibility Didn't Help

Setting `visibility: hidden` on the shape layer prevents the browser from **painting** the shapes, but Plotly's JavaScript still:
- Removes all shape DOM elements
- Recalculates all coordinates via `calcToPaper()`
- Creates new DOM elements

The CPU cost is in Plotly's JavaScript execution, not browser rendering.

## Proposed Solution

### Convert Grid Shapes to Scatter Traces

Replace individual `fig.add_shape()` calls with **scatter traces using null separators**. This makes grid lines behave like trace data, receiving the efficient CSS transform optimization during pan.

#### Before (Current Implementation)
```python
def minor_vertical_grid(self):
    for i in range(0, self.xmax):  # 280 iterations
        self.fig.add_shape(
            type="line",
            x0=i, x1=i,
            yref='paper', y0=0, y1=1,
            line=dict(color=self.grid_color, width=self.grid_width * 0.5),
            layer='below',
            name='minor_vertical_grid'
        )
```

#### After (Proposed Implementation)
```python
def minor_vertical_grid(self):
    x_vals = []
    y_vals = []
    for i in range(0, self.xmax):
        x_vals.extend([i, i, None])  # None creates visual break
        y_vals.extend([0, 1, None])  # Paper coordinates (0-1)

    self.fig.add_trace(go.Scatter(
        x=x_vals,
        y=y_vals,
        mode='lines',
        line=dict(color=self.grid_color, width=self.grid_width * 0.5),
        hoverinfo='skip',
        showlegend=False,
        yaxis='y',  # or appropriate axis reference
        name='minor_vertical_grid'
    ))
```

#### Performance Impact

| Metric | Before (Shapes) | After (Traces) |
|--------|-----------------|----------------|
| DOM elements | 430 individual paths | 4-6 path groups |
| Pan operation | O(430) DOM rebuild | O(1) CSS transform |
| Expected improvement | - | 10-50x per research |

### Trace Grouping Strategy

Group grid lines by visual style (color + width) into separate traces:

| Trace | Contents | Line Style |
|-------|----------|------------|
| `grid-major-vertical` | Major vertical lines (every 7 days) | thick, grid_color |
| `grid-minor-vertical` | Minor vertical lines (every day) | thin, grid_color |
| `grid-major-horizontal` | Major horizontal lines (decade values) | thick, grid_color |
| `grid-minor-horizontal` | Minor horizontal lines | thin, grid_color |
| `grid-sub-horizontal` | Sub-major horizontal lines | medium, grid_color |

This converts ~430 shapes into ~5 traces.

## Implementation Plan

### Phase 1: Prototype in Daily.py

1. Create new grid methods that generate traces instead of shapes
2. Test with both minute and count variants
3. Profile panning performance
4. Verify visual appearance matches current implementation

### Phase 2: Update Grid Visibility Toggle

**File:** `static/SCC/misc/grid.js`

Current implementation filters shapes by name:
```javascript
const shapes = chartDiv.layout.shapes || [];
const gridShapes = shapes.filter(shape => !isNonGridShape(shape));
```

New implementation will toggle trace visibility:
```javascript
const gridTraceIndices = [];
chartDiv.data.forEach((trace, i) => {
    if (trace.name?.startsWith('grid-')) {
        gridTraceIndices.push(i);
    }
});
Plotly.restyle(chartDiv, { visible: false }, gridTraceIndices);
```

### Phase 3: Update Resize Logic

**File:** `static/SCC/util/resize-chart.js`

Review and update any code that references grid shapes by name. Trace-based grid may require different handling for:
- Line width scaling
- Color updates
- Visibility toggling during resize

### Phase 4: Roll Out to Other Chart Types

Apply the same changes to:
- `charts/types/Weekly.py`
- `charts/types/Monthly.py`
- `charts/types/Yearly.py`
- `charts/types/FrequencyCollections.py`

### Phase 5: Clean Up

1. Remove unused shape-based grid methods
2. Update any documentation
3. Test all chart types thoroughly

## Files Affected

### Python (Chart Templates)
- `charts/types/Daily.py` - Grid generation methods
- `charts/types/Weekly.py` - Grid generation methods
- `charts/types/Monthly.py` - Grid generation methods
- `charts/types/Yearly.py` - Grid generation methods
- `charts/types/FrequencyCollections.py` - Grid generation methods

### JavaScript (Runtime)
- `static/SCC/misc/grid.js` - Grid visibility toggle
- `static/SCC/util/resize-chart.js` - Resize handling
- `static/SCC/util/panning_controls.js` - May need updates for dynamic spines

### Templates (If Any Reference Grid)
- Review for any grid-related logic

## Technical Considerations

### Coordinate System for Horizontal Lines

Vertical grid lines use data x-coordinates (so they pan with data) and paper y-coordinates (0-1 for full height).

Horizontal grid lines need **data y-coordinates** (specific values like 1, 10, 100 on log scale) and paper x-coordinates (0-1 for full width). This requires careful axis reference configuration:

```python
# Horizontal line at y=100
self.fig.add_trace(go.Scatter(
    x=[0, 1],           # Paper coordinates
    y=[100, 100],       # Data coordinate (log scale value)
    xaxis='x',
    yaxis='y',
    # ...
))
```

Note: Traces with `xref='paper'` may require a secondary axis or creative positioning. Testing will reveal the best approach.

### Layer Ordering

Shapes have explicit `layer='below'` to render behind data. Traces render in order of creation. Grid traces must be added **before** data traces to appear behind them, or use `legendrank` for ordering.

### Logarithmic Y-Axis

The y-axis uses logarithmic scale. Trace y-values for horizontal grid lines must be the actual data values (1, 10, 100, 1000), not log-transformed values - Plotly handles the transformation.

### Hover Behavior

Grid traces should not interfere with data hover. Set:
```python
hoverinfo='skip',
hovertemplate=None,
```

### Legend

Grid traces should not appear in legend:
```python
showlegend=False,
```

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Visual differences from current grid | Medium | Low | Careful testing, match line styles exactly |
| Horizontal lines don't work with paper x-coords | Medium | High | Test early in Phase 1, find alternative if needed |
| Grid toggle breaks | Low | Medium | Update grid.js before removing old implementation |
| Resize behavior changes | Low | Medium | Thorough testing across viewport sizes |
| Performance doesn't improve | Low | High | Profile in Phase 1 before full rollout |

## Success Criteria

1. **Performance**: Panning CPU usage reduced by at least 50%
2. **Visual parity**: Grid appearance identical to current implementation
3. **Functionality**: Grid toggle, resize, and all chart types work correctly
4. **No regressions**: All existing features continue to work

## References

- Plotly.js GitHub Issue #7384: Shapes performance with large datasets
- Plotly.js GitHub Issue #7151: Coordinate recalculation during pan
- Plotly.js PR #2623: Pan performance optimization (traces only)
- Firefox Profiler analysis showing 40% CPU in redrawComponents
