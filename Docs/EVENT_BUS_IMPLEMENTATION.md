# Event Bus Implementation Summary

## Overview

This document summarizes the comprehensive refactoring of the SCC (Standard Celeration Chart) JavaScript modules to use a centralized pub/sub event bus pattern, eliminating circular dependencies and decoupling peer modules.

## Architecture

### Core Components

```
static/SCC/
├── eventBus.js      # EventBus class - pub/sub system
├── events.js        # EVENTS catalog - all event names
├── main.js          # Coordinator - wires up all init() functions
└── [modules]        # Emit/subscribe to events
```

### Event Flow

```
[Publisher Module]
       │
       ▼ eventBus.emit(EVENTS.X, data)
       │
   [EventBus]
       │
       ▼ subscribers.get(EVENTS.X).forEach(callback)
       │
[Subscriber Modules]
```

## Events Catalog

### Data Events
| Event | Description | Emitted By | Subscribed By |
|-------|-------------|------------|---------------|
| `data:entry_submitted` | Data entry form submitted | dataEntry.js | navigation.js |
| `data:start_date_changed` | Chart start date changed | dates.js | dataEntry.js |
| `data:chart_refresh` | Request chart replot | dataEntry.js, traceStyles.js, cutLines.js, celLine.js | replot.js |

### Line Click Events
| Event | Description | Emitted By | Subscribed By |
|-------|-------------|------------|---------------|
| `line:phase_clicked` | Phase line clicked | lineClickHandler.js | phaseLines.js |
| `line:aim_clicked` | Aim line clicked | lineClickHandler.js | aimLines.js |
| `line:cel_clicked` | Cel line clicked | lineClickHandler.js | celLine.js |
| `line:cut_clicked` | Cut line clicked | lineClickHandler.js | cutLines.js |

### Mode Events
| Event | Description | Emitted By | Subscribed By |
|-------|-------------|------------|---------------|
| `mode:phase_activate` | Activate phase line mode | navigation.js | phaseLines.js |
| `mode:aim_activate` | Activate aim line mode | navigation.js | aimLines.js |
| `mode:cut_activate` | Activate cut line mode | navigation.js | cutLines.js |
| `mode:cel_activate` | Activate cel line mode | navigation.js | celLine.js |
| `mode:all_deactivate` | Deactivate all drawing modes | phaseLines.js, aimLines.js, cutLines.js, celLine.js | All line modules |

### UI Events
| Event | Description | Emitted By | Subscribed By |
|-------|-------------|------------|---------------|
| `ui:legend_render` | Render custom legend | replot.js, traceStyles.js, celLine.js, main.js | customLegend.js |

## Module Changes

### lineClickHandler.js
- **Before**: Imported handler functions from all line modules
- **After**: Emits `LINE_*_CLICKED` events with `{ lineName }` data
- **Circular dependency eliminated**: No longer imports from line modules

### dataEntry.js
- **Before**: Imported `hideCounter` from navigation.js
- **After**: Emits `DATA_ENTRY_SUBMITTED` event
- **Added**: `init()` function subscribing to `DATA_START_DATE_CHANGED`

### dates.js
- **Before**: Imported `setStartDate` from dataEntry.js (circular!)
- **After**: Emits `DATA_START_DATE_CHANGED` event with `{ date }` data
- **Circular dependency eliminated**: dates.js ↔ dataEntry.js

### traceStyles.js
- **Before**: Imported `refreshChart` from replot.js, `renderCustomLegend` from customLegend.js
- **After**: Emits `DATA_CHART_REFRESH` and `UI_LEGEND_RENDER` events
- **Removed**: Unused `renderCustomLegend` import (was dead code)

### replot.js
- **Before**: Exported `refreshChart` for direct calls
- **After**: Subscribes to `DATA_CHART_REFRESH`, emits `UI_LEGEND_RENDER`
- **Added**: `init()` function

### navigation.js
- **Before**: Imported activation functions from all 4 line modules (phaseLines, aimLines, cutLines, celLine)
- **After**: Emits `MODE_*_ACTIVATE` events, subscribes to `DATA_ENTRY_SUBMITTED`
- **Circular dependencies eliminated**: navigation.js was a "super-peer" importing 10+ modules

### phaseLines.js
- **Before**: No event bus usage
- **After**: Subscribes to `MODE_PHASE_ACTIVATE`, `LINE_PHASE_CLICKED`, `MODE_ALL_DEACTIVATE`
- **Emits**: `MODE_ALL_DEACTIVATE` when activating

### aimLines.js
- **Before**: Had dead code trying to call deactivate functions (lines 62-70)
- **After**: Subscribes to `MODE_AIM_ACTIVATE`, `LINE_AIM_CLICKED`, `MODE_ALL_DEACTIVATE`
- **Removed**: Dead code that was never working (functions were never imported)

### cutLines.js
- **Before**: Imported `refreshChart` from replot.js
- **After**: Subscribes to `MODE_CUT_ACTIVATE`, `LINE_CUT_CLICKED`, `MODE_ALL_DEACTIVATE`
- **Emits**: `DATA_CHART_REFRESH`, `MODE_ALL_DEACTIVATE`

### celLine.js
- **Before**: Imported `renderCustomLegend` from customLegend.js
- **After**: Subscribes to `MODE_CEL_ACTIVATE`, `LINE_CEL_CLICKED`, `MODE_ALL_DEACTIVATE`
- **Emits**: `UI_LEGEND_RENDER`, `MODE_ALL_DEACTIVATE`

### customLegend.js
- **Before**: Exported `renderCustomLegend` for direct calls
- **After**: Subscribes to `UI_LEGEND_RENDER`
- **Added**: `init()` function

### main.js (Coordinator)
- **Added**: Imports for all `init` functions
- **Added**: Event bus subscription initialization block
- **Changed**: Legend position handler now emits `UI_LEGEND_RENDER` instead of direct call
- **Removed**: Unused `renderCustomLegend` import

## Initialization Order

In `main.js` DOMContentLoaded:

```javascript
// Initialize event bus subscriptions for all modules
// Order matters: subscribers must register before events are emitted
dataEntryInit();
replotInit();
navigationInit();
phaseLinesInit();
aimLinesInit();
cutLinesInit();
celLineInit();
customLegendInit();
```

## Benefits

1. **No Circular Dependencies**: Modules only import `eventBus` and `EVENTS`
2. **Loose Coupling**: Publishers don't know about subscribers
3. **Easy Testing**: Can mock eventBus to test modules in isolation
4. **Debuggable**: `eventBus.setDebug({ all: true })` logs all events
5. **Extensible**: New modules can subscribe without modifying publishers
6. **Clean Imports**: Each module has minimal, clear dependencies

## Debugging

Enable event bus debugging in browser console:

```javascript
// Import eventBus from the module
import { eventBus } from './static/SCC/eventBus.js';

// Enable all logging
eventBus.setDebug({ all: true });

// Or selective logging
eventBus.setDebug({ emit: true, subscribe: false });
```

## Files Modified

- `static/SCC/events.js` (created)
- `static/SCC/eventBus.js` (moved from project root)
- `static/SCC/main.js`
- `static/SCC/navigation.js`
- `static/SCC/series/dataEntry.js`
- `static/SCC/series/replot.js`
- `static/SCC/series/traceStyles.js`
- `static/SCC/lines/lineClickHandler.js`
- `static/SCC/lines/phaseLines.js`
- `static/SCC/lines/aimLines.js`
- `static/SCC/lines/cutLines.js`
- `static/SCC/lines/celLine.js`
- `static/SCC/misc/customLegend.js`
- `static/SCC/util/dates.js`
