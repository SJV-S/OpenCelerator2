# Project Rules

## Interaction Rules

**Answer questions before writing code.** When the user asks a question, answer it. A question is never an invitation to start coding just because auto-edit is enabled. Respond to what was asked, then wait for direction.

**Never tell the user to refresh the page.** The user manages their own browser and server. Suggesting a page refresh is obvious and unhelpful. If stale state is a problem, fix it in the code (e.g., trigger a redraw programmatically) rather than telling the user to refresh.

## Codebase Overview

**Single-Case Chart (SCC) Application** - A behavioral data visualization tool displaying time-series data (correct/incorrect responses, timing) on logarithmic charts with analytical line drawing tools.

**Stack**: Flask 3.0 backend + ES6 JavaScript modules + Plotly.js 2.35 + Tailwind CSS

### Key Files

| File | Purpose |
|------|---------|
| `app.py` | Flask server, routes (`/`, `/chart/<type>/<minute_type>`), template selection |
| `static/SCC/main.js` | Entry point, chart initialization, event listener setup |
| `static/SCC/chartState.js` | Centralized state (series data, line objects, styles, credits) |
| `static/SCC/eventBus.js` | Pub/sub system for module communication |
| `static/SCC/navigation.js` | Tab switching, counter overlay, keyboard shortcuts |
| `static/SCC/series/dataEntry.js` | Form submission, appends data to series |
| `static/SCC/series/replot.js` | Orchestrates chart refresh via tracePipeline |
| `static/SCC/series/tracePipeline.js` | Data aggregation, Plotly trace creation |
| `static/SCC/series/traceStyles.js` | Trace appearance config |
| `static/SCC/series/miscSeries.js` | Dynamic misc series management (max 10) |
| `static/SCC/lines/*.js` | Phase/aim/cut/celeration line drawing |
| `static/SCC/ui/toaster.js` | Toast notifications and dialogs |
| `static/SCC/ui/crosshair.js` | Cursor tracking with canvas rendering |
| `static/SCC/util/dates.js` | Date math, timestamp ↔ X-position conversion |
| `templates/SCC/chart.html` | Main chart page |
| `templates/SCC/menu/*.html` | 7 sidebar tabs (counter, data, credit, lines, series, chart, share) |

### Data Flow
1. Flask renders `chart.html` with Jinja: `{{ plot_json }}`, `{{ chart_type }}`
2. `main.js` initializes chart with `Plotly.newPlot()`
3. User submits data via `dataEntry.js` → emits `DATA_ENTRY_SUBMITTED`
4. `replot.js` subscribes → builds traces via `tracePipeline.js` → `Plotly.react()`

### Chart Types
- Daily, Weekly, Monthly, Yearly, FrequencyCollections
- Each has minute/count variants and resize logic in `util/resize-chart.js`

### Line Types
- **Phase lines**: Vertical + horizontal + text label (3-phase drawing)
- **Aim lines**: Horizontal/diagonal trend lines
- **Cut lines**: Vertical segment boundaries for aggregation
- **Celeration lines**: Log-scale trend analysis

## Execution Rules

**NEVER run the application.** Do not attempt to start the Flask server, import `app`, or execute any Python command that boots the application. The user manages their own server and virtual environment. Your job is to write code, not verify it runs.

## File Handling
- **NEVER create new directories** - always use existing project structure. If unsure where a file belongs, ASK first.
- **Documentation goes in `Docs/`** (capital D) - NOT `docs/`
- **NEVER read .json template files** - they are extremely large and will cause errors
- **NEVER attempt to read files in charts/ directory** - always assume they exist and are too large
- Always ask before reading any .json file anywhere in the project

## Learning
- When explaining code involving JavaScript, HTML, and Flask/Jinja:

1. Always explicitly trace variable and function accessibility across boundaries (client/server, file scope, global scope)
2. State WHERE each variable/function is defined and WHERE it becomes accessible
3. Explain the mechanism that makes something accessible (script tags, window object, Jinja templating, fetch/responses, etc.)
4. For cross-boundary data flow, trace the complete path from origin to destination
5. Distinguish between server-time rendering (Jinja) and client-time execution (JavaScript)
6. Flag scope issues proactively if code assumes accessibility that doesn't exist
7. Identify the type/nature of variables (objects, arrays, primitives, DOM elements, etc.) and relate to Python equivalents when applicable (e.g., "JavaScript object literal = Python dict", "array = list", "undefined/null ≠ None", "Promise = similar to async/await")

Example format:
- Variable X defined in server.py → passed to render_template() → injected into HTML via {{ X }} → accessible in <script> tag as JavaScript variable
- Function Y defined in script.js → attached to window object → callable from inline HTML onclick handlers
- Data Z sent from client via fetch() → received in Flask route → processed → returned in JSON response → parsed in .then() → accessible in JavaScript

## CSS Styling

**Always use Tailwind CSS classes** - this project uses Tailwind as the primary styling approach. Vanilla CSS in `<style>` blocks should only be used for:
- Plotly/chart-specific positioning that Tailwind can't handle
- Complex selectors or pseudo-elements not available in Tailwind
- Third-party library overrides

For responsive design, use Tailwind breakpoint prefixes (`sm:`, `md:`, `lg:`, `xl:`) directly in HTML classes rather than writing `@media` queries in vanilla CSS.

## SVG Icon Sizing - CRITICAL

**Always use fixed `rem` values for SVG dimensions, never percentages.** The Tailwind CDN (`cdn.tailwindcss.com`) preflight interferes with percentage-based SVG sizing inside buttons/containers. SVGs with `width: 100%; height: 100%` will render as invisible.

```css
/* WRONG - SVG renders invisible */
.my-icon svg {
    width: 100%;
    height: 100%;
}

/* RIGHT - fixed rem values, matches existing pattern */
.my-icon svg {
    width: 1rem;
    height: 1rem;
}
```

This matches the existing `.chart-menu-icon-btn svg { width: 5rem; }` pattern. All icon containers in this project size their SVGs with fixed units.

## JavaScript Architecture - STRICT RULES

**This project uses ES6 modules. NEVER violate the architecture:**

1. **NO inline onclick handlers** - Never add `onclick="..."` attributes to HTML elements
2. **NO global/window functions** - Never attach functions to `window` object for HTML access
3. **NO breaking module encapsulation** - All event handling must use `addEventListener` within the module scope
4. **Use proper event delegation** - When handling dynamic elements, attach listeners to stable parent elements or re-attach after DOM updates

These patterns are FORBIDDEN:
```javascript
// WRONG - inline handler
<button onclick="doSomething()">

// WRONG - global function
window.myFunction = function() { ... }

// WRONG - mixing paradigms
<button onclick="window.moduleFunction()">
```

Correct pattern:
```javascript
// RIGHT - addEventListener in module scope
element.addEventListener('click', (e) => { ... });

// RIGHT - event delegation
parentElement.addEventListener('click', (e) => {
    if (e.target.closest('.target-class')) { ... }
});
```

## Event Bus Architecture

This project uses a centralized event bus (`static/SCC/eventBus.js`) for module communication. **Always follow this pattern:**

1. **When adding new events**: Add them to the `EVENTS` object in eventBus.js
2. **When emitting events**: Always set up corresponding subscribers - events without subscribers are useless
3. **Complete the circuit**: If you emit an event, you must also:
   - Identify which modules need to react
   - Add `eventBus.subscribe()` calls in those modules
   - Test that the subscription actually fires
4. **Avoid direct imports for cross-module communication** - use the event bus instead to prevent circular dependencies

Example pattern:
```javascript
// In moduleA.js - EMIT
eventBus.emit(EVENTS.SOMETHING_HAPPENED, { data });

// In moduleB.js - SUBSCRIBE (must exist or the emit is pointless)
eventBus.subscribe(EVENTS.SOMETHING_HAPPENED, (data) => {
    // React to the event
}, true);
```

## Plotly Shape Management - CRITICAL

**Always use surgical updates for shapes and annotations.** When adding/removing individual shapes, target them by index - never replace the entire array.

```javascript
// WRONG - replaces entire array, redraws ALL shapes
const filtered = chartDiv.layout.shapes.filter(s => s.name !== 'my-shape');
Plotly.relayout(chartDiv, { shapes: filtered });

// RIGHT - use the wrapper with name=true to remove by name
import { relayout } from './util/plotlyWrapper.js';
await relayout(chartDiv, 'my-shape', true);
```

**Why this matters:** Passing `shapes: [array]` tells Plotly to redraw every shape from scratch. This destroys existing SVG elements and creates new ones, which breaks any CSS modifications (like visibility toggling) applied to those elements.

**Always use the plotlyWrapper** for Plotly operations. It emits events through the eventBus and supports name-based shape removal.

You may suggest (but never add without permission) additional helper functions for the wrapper when a pattern emerges, similar to the `name=true` parameter for shape removal.

See `Docs/plotly-shape-surgical-updates.md` for full context.

## Plotly DOM Element Selection - CRITICAL

**Never assume `layout.shapes` indices match DOM element order.** Plotly renders shapes to different SVG layers based on properties. A `querySelectorAll` returns elements in DOM order, which differs from `layout.shapes` array order.

```javascript
// WRONG - assumes DOM order matches layout.shapes order
const allShapes = chartDiv.querySelectorAll('.shapelayer path');
allShapes[79]  // Gets wrong element

// RIGHT - use data-index attribute (Plotly stamps each shape with its layout.shapes index)
chartDiv.querySelector('[data-index="79"]')  // Gets correct element
```

**Pattern for finding shape DOM elements by name:**
```javascript
// 1. Look up by name in layout.shapes → get index
const index = layout.shapes.findIndex(s => s.name === 'my-shape');

// 2. Query by data-index attribute → get correct DOM element
const element = chartDiv.querySelector(`[data-index="${index}"]`);
```

See `Docs/plotly-shapes-vs-dom.md` for full explanation.

## Sync Architecture

Two sync mechanisms for server communication, both user-action-triggered (no background polling).

### Files

| File | Role |
|------|------|
| `static/Server/init.js` | `syncEnabled` flag (IndexedDB-backed), `isSyncEnabled()` / `setSyncEnabled()` |
| `static/Server/syncClient.js` | `pushChart()`, `checkForUpdates()`, `startSyncWatch()` (shared only) |
| `static/SCC/storage/chartStorage.js` | Push after save, push queue (`queuePush` / `drainPushQueue`) |
| `templates/SCC/menu_page.html` | Sync checkbox UI, pull + drain queue on page load |
| `templates/SCC/chart.html` | Pull on load (non-shared), `startSyncWatch` (shared) |
| `app.py` | `/api/sync` — manifest comparison, upload/download |

### Push Flow
- **Shared charts** (`chartState.shared`): push immediately after every 1s save debounce
- **Sync-enabled non-shared charts**: same — push immediately after save
- **Offline**: failed pushes queued in localStorage, drained on next successful push or menu page load

### Pull Flow
- **Menu page load**: drain push queue → send `local_manifest` timestamps → server returns only newer charts
- **Chart page load** (non-shared, sync enabled): single-chart manifest check → replot if newer
- **Shared charts**: `startSyncWatch()` opens a WebSocket (Socket.IO) for real-time push notifications; HTTP fetch on `/api/chart/{id}/poll` used only as reconnect fallback

### Timestamp Standard
All stored timestamps use **Unix seconds** (`Math.floor(Date.now() / 1000)`). Convert at point of consumption: `new Date(timestamp * 1000)`. See `static/SCC/util/dates.js` header for full policy.

## Schema Migration System

Chart data evolves over time. Migrations handle upgrading stored charts to the current schema.

### Key File
`static/SCC/import/jsonBackwardsCompatibility.js` — migration runner + all migration functions

### How It Works
- `chartState._schemaVersion` integer tracks the current schema version
- Charts without `_schemaVersion` are treated as version 0
- `migrateChart(data)` runs all needed migrations in order (0→1, 1→2, etc.)
- Called from `loadChart()` and `importChart()` in `chartStorage.js`

### When chartState Schema Changes
1. Bump `CURRENT_SCHEMA_VERSION` in `jsonBackwardsCompatibility.js`
2. Add a new `async function migrate_N_to_N+1(chart)` that makes the targeted change
3. Append it to the `migrations` array
4. The function receives the raw chart object, mutates it in place, returns `boolean` (whether it changed anything)
5. Use explicit default values from `config.js` — never reference the live `chartState` object
6. Document what changed in the migration function's JSDoc comment

### Rules
- **Never import chartState** in the migration file — migrations must use explicit defaults
- **Never use fillMissing / recursive backfill** — every field change must be a targeted migration
- **Keep migrations idempotent** — safe to re-run if already applied

## Debugging

`static/SCC/debug.js` exposes internals to `window` for console access. This is the ONE exception to the "no window object" rule - debugging utilities are allowed.

Available in browser console:
- `window.chartState` - Full chart state object
- `window.testToaster()` - Creates multiple stacked notifications to test toaster behavior
- `window.nuke()` - Wipes all charts, BIP39 passphrase, and localStorage, then reloads
