# Code Cleanup Opportunities

Survey conducted: 2026-02-01

## Completed Cleanup

### Dead Code Removed
- `rmGrid()` - grid.js
- `createSvgCursor()` - cursorIcon.js
- `formatCelerationLabelWithUnit()` - fit_lines.js
- `celLineMetadata()` - allLines.js
- Unused HTML IDs: `mobile-credit-0`, `mobile-credit-1`
- Misleading comment in main.js:450

### Pointless Comments Removed
- Section dividers in navigation.js (6 sections)
- Section dividers in main.js (3 sections)
- Redundant inline comments in navigation.js (~10 comments)
- Redundant inline comments in main.js (~5 comments)
- Excessive state object comments in aimLines.js and phaseLines.js

---

## Code Duplication

### High Priority

#### 1. Coordinate Conversion Functions

**Files:** `phaseLines.js`, `aimLines.js`, `cutLines.js`, `celLine.js`

Nearly identical `getPlotCoordinates*()` functions exist in all line modules:
- `getPlotCoordinates()` - phaseLines.js:404-460
- `getPlotCoordinatesForAimLine()` - aimLines.js:243-298
- `getPlotCoordinatesForCutLine()` - cutLines.js:211-236
- `getPlotCoordinatesForCelLine()` - celLine.js:566-591

All perform:
- Pixel-to-data coordinate conversion via `chartDiv._fullLayout.xaxis/yaxis`
- Log-scale y-axis conversion: `Math.pow(10, logYValue)`
- Bounding box retrieval via `getBoundingClientRect()`

**Recommendation:** Extract to `util/coordinates.js`

---

#### 2. Y-Value Rounding Function

**Files:** `phaseLines.js:358-374`, `aimLines.js:219-235`

Identical `roundYValue()` function allowing values `[0.01, 0.1, 1, 10, 100, 500]`.

**Recommendation:** Move to shared utility module

---

#### 3. Visibility Toggle Functions

**Files:** `phaseLines.js:928-957`, `aimLines.js:908-937`, `celLine.js:1293-1322`

Three nearly identical functions: `setPhaseLineVisibility()`, `setAimLineVisibility()`, `setCelLineVisibility()`

Only difference is the name prefix (`'phase-'`, `'aim-'`, `'cel-'`).

**Recommendation:** Create generic function:
```javascript
function setLineVisibility(prefix, visible) { ... }
```

---

#### 4. Event Listener Setup/Cleanup

**Files:** All line modules

Duplicated touch/click handler setup pattern:
```javascript
state.clickHandler = function(event) { handleClick(event, chartDiv); };
state.touchHandler = function(event) {
    event.preventDefault();
    if (event.touches && event.touches.length > 0) {
        const touch = event.touches[0];
        const syntheticEvent = { clientX: touch.clientX, clientY: touch.clientY, ... };
        handleClick(syntheticEvent, chartDiv);
    }
};
chartDiv.addEventListener('click', state.clickHandler);
chartDiv.addEventListener('touchstart', state.touchHandler);
```

**Recommendation:** Create helper in `util/` for touch/click handler setup

---

### Medium Priority

#### 5. Toast Click Handlers

**Files:** `phaseLines.js:847-866`, `aimLines.js:760-779`, `cutLines.js:387-419`, `celLine.js:1116-1153`

All `handle*LineClick()` functions follow identical pattern with different line type.

**Recommendation:** Create generic handler factory

---

#### 6. Shape/Annotation Removal

**Files:** `phaseLines.js:781-825`, `aimLines.js:694-738`

`removePhaseAnnotation()` / `removeAimAnnotation()` and `removePhaseShapes()` / `removeAimShapes()` are nearly identical.

**Recommendation:** Consolidate into generic removal functions

---

#### 7. DOM Overlay Creation

**Files:** `cutLines.js:272-308`, `celLine.js:627-674`

`getOrCreateCutLineOverlay()` and `getOrCreateOverlayContainer()` are ~95% identical.

**Recommendation:** Extract shared overlay creation utility

---

#### 8. Python Chart Type Classes

**Files:** `Daily.py`, `Weekly.py`, `Monthly.py`, `Yearly.py`

Duplicated code:
- Lines 18-29: Identical minute_type handling
- Lines 40-47: Same style constants (`style_color`, `grid_color`, `font_family`, `font_size`, `font_weight`, `grid_width`, `spine_width`)
- Margin calculations

**Recommendation:** Extract `ChartBase` class with common initialization

---

### Low Priority

#### 9. HTML Series Configuration Blocks

**File:** `templates/SCC/menu/series_tab.html`

~60 lines repeated 4 times for Corrects, Errors, Timing, Misc series config.

**Recommendation:** JavaScript-driven template generation or Jinja macro

---

#### 10. HTML Increment/Decrement Button Groups

**File:** `templates/SCC/menu/chart_tab.html`

Same SVG arrow buttons repeated 4 times for Monday/Month/Year/Decade controls.

**Recommendation:** Extract reusable component or Jinja macro

---

## Remaining Pointless Comments

### Stale TODOs (intentionally kept)

These provide useful context about incomplete features:

| File | Line | Comment |
|------|------|---------|
| `storage/chartStorage.js` | 330 | `// TODO: Remove test data` - Instructions for disabling test data |
| `misc/share.js` | 208 | `// TODO: Actual clipboard copy will go here` - Documents incomplete feature |

---

## Summary - Remaining Work

| Category | Count | Effort |
|----------|-------|--------|
| Coordinate conversion consolidation | 4 functions | Medium |
| roundYValue extraction | 2 functions | Low |
| Visibility toggle consolidation | 3 functions | Low |
| Event listener helpers | 4 modules | Medium |
| Toast handler factory | 4 functions | Low |
| Shape/annotation removal | 4 functions | Low |
| Overlay creation utility | 2 functions | Low |
| Python base class | 4 files | Medium |
| HTML template consolidation | 2 files | Medium |
