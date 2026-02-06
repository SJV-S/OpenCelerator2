# Plotly Shapes: Data Model vs DOM Elements

## Two Different Representations

Plotly maintains shapes in two places:

1. **Data Model (`layout.shapes`)** - JavaScript array of shape definitions. Each shape has properties like `name`, `x0`, `y0`, `xref`, `yref`, `line`, etc.

2. **DOM Elements** - Actual SVG `<path>` and `<rect>` elements rendered in the browser. These are what you see on screen.

## The Relationship

The DOM is a **subset** of `layout.shapes`. Not all shapes in `layout.shapes` appear in a given DOM query.

Plotly organizes SVG elements into different layers and groups:
- `.layer-above .shapelayer` - shapes rendered above traces
- `.layer-below .shapelayer` - shapes rendered below traces
- Axis groups - tick marks, grid lines, spines
- Other structural elements

A shape's destination depends on its properties (`xref`, `yref`, `layer`, etc.) and Plotly's internal rendering logic.

## The Index Problem

`layout.shapes` indices do NOT correspond to DOM element indices.

### Example

```
layout.shapes (90 items):
[0]: axis tick      → rendered in axis group (NOT in .shapelayer)
[1]: axis tick      → rendered in axis group (NOT in .shapelayer)
[2]: grid line      → rendered in .shapelayer
[3]: grid line      → rendered in .shapelayer
...
[79]: fan-line-0    → rendered in .shapelayer
[80]: fan-line-1    → rendered in .shapelayer
...
[89]: cel-1234      → rendered in .shapelayer

DOM query '.layer-above .shapelayer path, rect' (88 items):
[0]: grid line      (from layout.shapes[2])
[1]: grid line      (from layout.shapes[3])
...
[77]: fan-line-0    (from layout.shapes[79])
[78]: fan-line-1    (from layout.shapes[80])
...
[87]: cel-1234      (from layout.shapes[89])
```

Two shapes from `layout.shapes` are not in `.shapelayer`, so the DOM array is 2 items shorter. All indices after position 0 are shifted.

## Why This Causes Problems

If you:
1. Look up a shape by name in `layout.shapes` → find it at index 79
2. Use that index to grab a DOM element → `domElements[79]`

You get the **wrong element**. Index 79 in the DOM is a different shape than index 79 in `layout.shapes`.

### Concrete Example: Fan Toggle Hiding Cel Lines

The celeration fan toggle code:
1. Finds fan shapes by name in `layout.shapes` → indices [79-88]
2. Grabs DOM elements at those indices
3. Sets `display: none` on them

But DOM[79] is actually a cel line, not a fan line. So toggling the fan hides the cel lines instead.

## Q&A

### Q: Why not look up by name in the DOM?

The DOM elements don't have names. Plotly doesn't copy the `name` property to the rendered SVG elements. There's no attribute to query.

```javascript
// This doesn't work - SVG elements have no 'name'
domElements.find(el => el.name === 'fan-line-0')  // undefined
```

### Q: Why does one array affect the other if they're separate?

They represent the same shapes in different forms. When you manipulate a DOM element (e.g., set `display: none`), you're hiding the visual rendering of that shape. If you grab the wrong DOM element, you hide the wrong shape.

### Q: Can we calculate an offset between the arrays?

You could count how many shapes are "missing" from the DOM and subtract. But this is fragile:
- The offset could vary by chart type
- Shapes could be missing from the middle, not just the start
- Adding/removing shapes shifts everything

### Q: How does Plotly.relayout avoid this problem?

`Plotly.relayout()` operates on the data model (`layout.shapes`). You modify shapes by name or index in that array, and Plotly handles the DOM update internally. It knows which DOM element corresponds to which shape.

```javascript
// This works - operates on data model, Plotly handles DOM
const updated = layout.shapes.map(s =>
    s.name?.startsWith('fan-') ? { ...s, visible: false } : s
);
Plotly.relayout(chartDiv, { shapes: updated });
```

### Q: When is direct DOM manipulation appropriate?

Only when:
1. Performance is critical (e.g., many updates per second during drag)
2. You can reliably identify the correct elements (e.g., cached at a known state)

For one-time operations like visibility toggle, use `Plotly.relayout`.

## The Solution: data-index Attribute

Plotly.js stamps each rendered shape SVG element with a `data-index` attribute matching its position in `layout.shapes`:

```html
<path data-index="79" d="M81 119 L119..." fill="red" stroke="black"></path>
```

This attribute is undocumented but stable across versions. Use it to find DOM elements:

```javascript
// Look up shape by name → get index
const index = layout.shapes.findIndex(s => s.name === 'my-shape');

// Query by data-index attribute → get correct DOM element
const element = chartDiv.querySelector(`[data-index="${index}"]`);
```

This works regardless of DOM ordering or layer differences.

## Guidelines

1. **Prefer Plotly.relayout** for modifying shapes. It's correct by design.

2. **Never assume index correspondence** between `layout.shapes` and DOM element array positions.

3. **Use `data-index` attribute** when you must manipulate DOM directly:
   ```javascript
   // Correct - uses data-index attribute
   chartDiv.querySelector(`[data-index="${shapeIndex}"]`)

   // Wrong - assumes DOM array order matches layout.shapes
   allShapes[shapeIndex]
   ```

4. **Use names in the data model**, not indices, when possible:
   ```javascript
   // Good - filter by name
   shapes.filter(s => s.name === 'my-shape')

   // Fragile - depends on array order
   shapes[42]
   ```
