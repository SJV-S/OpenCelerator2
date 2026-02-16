# Unified Mode Timeout System

## Problem

Users can activate drawing modes (phase, aim, cut, celeration lines) and forget they're active. If they navigate away or get distracted, unexpected clicks later can create unintended lines.

## Current State

| Mode | File | State Object | Deactivate Function |
|------|------|--------------|---------------------|
| Phase Lines | `lines/phaseLines.js` | `phaseLineState` | `deactivatePhaseLineMode()` |
| Aim Lines | `lines/aimLines.js` | `aimLineState` | `deactivateAimLineMode()` |
| Cut Lines | `lines/cutLines.js` | `cutLinesState` | `deactivateCutLinesMode()` |
| Cel Lines | `lines/celLine.js` | `celLineState` | `deactivateCelLineMode()` |

**Crosshair** (`util/crosshair.js`) is excluded - it auto-deactivates on Shift key release.

### Existing Infrastructure

- `EVENTS.MODE_ALL_DEACTIVATE` already broadcasts to all modes
- Each mode subscribes and calls its deactivate function if active
- Each mode has an `.active` boolean flag

## Proposed Solution

### New File: `static/SCC/util/modeTimeout.js`

```javascript
/**
 * Unified timeout system for drawing modes.
 * Auto-deactivates any active mode after period of inactivity.
 */

import { eventBus, EVENTS } from '../eventBus.js';
import { showToast, removeToast } from './toaster.js';

const TIMEOUT_DURATION = 45000;    // 45 seconds of inactivity
const WARNING_BEFORE = 10000;      // Show warning 10 seconds before timeout

let timeoutId = null;
let warningId = null;
let warningToast = null;
let activeModeName = null;

/**
 * Start or restart the inactivity timer
 */
function startTimer(modeName) {
    clearTimers();
    activeModeName = modeName;

    // Set warning timer
    warningId = setTimeout(() => {
        warningToast = showToast(
            `${activeModeName} mode will auto-cancel in 10 seconds`,
            'warning',
            WARNING_BEFORE
        );
    }, TIMEOUT_DURATION - WARNING_BEFORE);

    // Set deactivation timer
    timeoutId = setTimeout(() => {
        console.log(`[ModeTimeout] Auto-deactivating ${activeModeName} after inactivity`);
        eventBus.emit(EVENTS.MODE_ALL_DEACTIVATE);
        showToast(`${activeModeName} mode cancelled due to inactivity`, 'info', 3000);
        clearTimers();
    }, TIMEOUT_DURATION);
}

/**
 * Reset timer on user activity (keeps mode alive)
 */
function resetTimer() {
    if (timeoutId && activeModeName) {
        // Clear warning if shown
        if (warningToast) {
            removeToast(warningToast);
            warningToast = null;
        }
        startTimer(activeModeName);
    }
}

/**
 * Clear all timers (called on manual deactivation)
 */
function clearTimers() {
    if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
    }
    if (warningId) {
        clearTimeout(warningId);
        warningId = null;
    }
    if (warningToast) {
        removeToast(warningToast);
        warningToast = null;
    }
    activeModeName = null;
}

/**
 * Initialize the timeout system
 */
export function init() {
    const chartDiv = document.getElementById('annotated-chart');

    // Subscribe to mode activations
    eventBus.subscribe(EVENTS.MODE_PHASE_ACTIVATE, () => {
        startTimer('Phase line');
    });

    eventBus.subscribe(EVENTS.MODE_AIM_ACTIVATE, () => {
        startTimer('Aim line');
    });

    eventBus.subscribe(EVENTS.MODE_CUT_ACTIVATE, () => {
        startTimer('Cut line');
    });

    eventBus.subscribe(EVENTS.MODE_CEL_ACTIVATE, () => {
        startTimer('Celeration line');
    });

    // Clear timers when modes deactivate
    eventBus.subscribe(EVENTS.MODE_ALL_DEACTIVATE, () => {
        clearTimers();
    });

    // Reset timer on user interaction within chart
    if (chartDiv) {
        chartDiv.addEventListener('mousemove', resetTimer);
        chartDiv.addEventListener('click', resetTimer);
        chartDiv.addEventListener('touchstart', resetTimer);
    }

    // Also reset on keyboard activity (for text entry phases)
    document.addEventListener('keydown', resetTimer);
}
```

### Integration Steps

#### 1. Add to eventBus.js (if not present)

Verify these events exist in `EVENTS` object:
```javascript
MODE_PHASE_ACTIVATE: 'mode:phase:activate',
MODE_AIM_ACTIVATE: 'mode:aim:activate',
MODE_CUT_ACTIVATE: 'mode:cut:activate',
MODE_CEL_ACTIVATE: 'mode:cel:activate',
MODE_ALL_DEACTIVATE: 'mode:all:deactivate',
```

#### 2. Import and initialize in main.js

```javascript
import { init as initModeTimeout } from './util/modeTimeout.js';

// In initialization sequence:
initModeTimeout();
```

#### 3. Verify each mode emits activation event

Each mode should emit its activation event when activated. Check:

- `phaseLines.js`: `eventBus.emit(EVENTS.MODE_PHASE_ACTIVATE, { direction })`
- `aimLines.js`: `eventBus.emit(EVENTS.MODE_AIM_ACTIVATE, { direction })`
- `cutLines.js`: `eventBus.emit(EVENTS.MODE_CUT_ACTIVATE)`
- `celLine.js`: `eventBus.emit(EVENTS.MODE_CEL_ACTIVATE)`

## Configuration Options

Consider making these configurable via `chartState` or a settings panel:

| Setting | Default | Description |
|---------|---------|-------------|
| `TIMEOUT_DURATION` | 45000ms | Total inactivity before auto-cancel |
| `WARNING_BEFORE` | 10000ms | When to show warning before timeout |
| `enabled` | true | Allow users to disable feature |

## Edge Cases

1. **Multi-phase modes (phase lines have 3 phases)**: Timer resets on each click within the mode, so users have full timeout between each step.

2. **Text entry phase**: Keyboard events reset timer, so typing keeps mode alive.

3. **Cel line series selection**: Timer starts on mode activation, resets when series is selected and drag begins.

4. **Tab switching**: User might switch to data tab while in drawing mode. Timer continues - this is intentional (they may have forgotten).

5. **Window blur/focus**: Could optionally pause timer on blur, resume on focus. Current design: timer continues.

## Testing Checklist

- [ ] Phase line mode times out after inactivity
- [ ] Aim line mode times out after inactivity
- [ ] Cut line mode times out after inactivity
- [ ] Cel line mode times out after inactivity
- [ ] Mouse movement resets timer
- [ ] Clicks reset timer
- [ ] Keyboard input resets timer
- [ ] Warning toast appears 10 seconds before timeout
- [ ] Manual cancel clears timer (no duplicate toasts)
- [ ] Completing a line clears timer
- [ ] Crosshair mode is unaffected