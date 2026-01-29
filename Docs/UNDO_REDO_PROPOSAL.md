# Undo/Redo System Proposal

## Overview

Add undo/redo functionality to the chart application, allowing users to reverse and restore up to 10 previous states.

## Approach: Dirty Polling with Dual Snapshots

### Detection Strategy

Poll `chartState` every 500ms and compare JSON strings to detect changes. This avoids complex event bus modifications or module refactoring.

```javascript
let lastState = JSON.stringify(chartState);

function checkForChanges() {
    const current = JSON.stringify(chartState);
    if (current !== lastState) {
        // Change detected - push old state to undo stack
        undoStack.push({
            chartState: lastState,
            shapes: JSON.stringify(chartDiv.layout.shapes),
            annotations: JSON.stringify(chartDiv.layout.annotations)
        });
        lastState = current;
        redoStack = []; // Clear redo on new change
    }
}

setInterval(checkForChanges, 500);
```

### Why 500ms?

Human actions are slow:
- Form submission: seconds
- Drawing a line: multiple clicks over seconds
- Toggle clicks: ~200ms+ apart minimum

500ms captures all realistic user actions without performance concerns.

### What Gets Snapshotted

Two things must be captured together:

1. **`chartState`** - Source of truth for data, line metadata, settings
2. **`chartDiv.layout.shapes` + `chartDiv.layout.annotations`** - Plotly visuals (lines, labels)

Reason: Currently no function exists to rebuild Plotly shapes from `chartState` metadata. Capturing both avoids needing to write one.

### Undo/Redo Logic

```javascript
const MAX_UNDO = 10;
let undoStack = [];
let redoStack = [];

function undo() {
    if (undoStack.length === 0) return;

    // Save current state to redo stack
    redoStack.push(captureCurrentState());

    // Restore previous state
    const snapshot = undoStack.pop();
    restoreState(snapshot);
}

function redo() {
    if (redoStack.length === 0) return;

    // Save current state to undo stack
    undoStack.push(captureCurrentState());

    // Restore redo state
    const snapshot = redoStack.pop();
    restoreState(snapshot);
}

function restoreState(snapshot) {
    // 1. Restore chartState
    Object.assign(chartState, JSON.parse(snapshot.chartState));

    // 2. Restore Plotly visuals
    Plotly.relayout(chartDiv, {
        shapes: JSON.parse(snapshot.shapes),
        annotations: JSON.parse(snapshot.annotations)
    });

    // 3. Rebuild traces from restored data
    eventBus.emit(EVENTS.DATA_CHART_REFRESH);
}
```

### Persistence

Use `sessionStorage` to survive page refresh (but not tab close):

```javascript
// On every stack change
sessionStorage.setItem('undoStack', JSON.stringify(undoStack));
sessionStorage.setItem('redoStack', JSON.stringify(redoStack));

// On page load
const savedUndo = sessionStorage.getItem('undoStack');
if (savedUndo) undoStack = JSON.parse(savedUndo);
```

### UI

Floating buttons in bottom-right corner:
- **Undo button** - greyed when `undoStack` empty
- **Redo button** - greyed when `redoStack` empty (at latest state)

## File Structure

```
static/SCC/
├── undo/
│   └── undoManager.js    # Polling, stack management, restore logic
└── main.js               # Initialize undo manager, wire up UI
```

## Open Questions

1. **Stack size in sessionStorage**: With 10 states, each containing full chartState + shapes + annotations, how large could this get? May need to measure typical chart size.

2. **Restoring chartState properly**: `Object.assign()` does shallow copy. If chartState has nested objects that get mutated in place, may need deep merge or full property replacement loop (like `deserializeChart()` does).

3. **UI sync after restore**: Beyond `DATA_CHART_REFRESH`, what else needs updating?
   - Legend?
   - Form fields (chart name input, etc.)?
   - Visibility toggles?

4. **Fan and credits**: These are also in shapes/annotations. Capturing layout should preserve them, but need to verify they restore correctly.

5. **Excluding ephemeral state**: Should certain things be excluded from snapshots?
   - Drawing mode state (mid-draw)?
   - Entry date indicator line?
   - Temp/preview shapes?

6. **Clickable line traces**: Lines have invisible clickable traces added separately. After restore, do these need to be regenerated?

7. **What triggers a "change"?**: The polling approach captures ANY chartState change. Should some changes be excluded from undo history (e.g., pan position, zoom level)?

8. **Debouncing rapid changes**: If user types in chart name field, each keystroke could create a snapshot. May need to debounce or batch certain changes.