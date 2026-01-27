# Project Rules

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
| `static/SCC/util/dates.js` | Date math, timestamp ↔ X-position conversion |
| `static/SCC/util/toaster.js` | Toast notifications and dialogs |
| `templates/SCC/chart.html` | Main chart page |
| `templates/SCC/menu/*.html` | 7 sidebar tabs (counter, data, credit, lines, series, chart, share) |

### Data Flow
1. Flask renders `chart.html` with Jinja: `{{ plot_json }}`, `{{ chart_type }}`
2. `main.js` initializes chart with `Plotly.newPlot()`
3. User submits data via `dataEntry.js` → emits `DATA_ENTRY_SUBMITTED`
4. `replot.js` subscribes → builds traces via `tracePipeline.js` → `Plotly.react()`

### Chart Types
- Daily, Weekly, Monthly, Yearly, FrequencyCollections
- Each has minute/count variants and resize logic in `util/resize_chart/`

### Line Types
- **Phase lines**: Vertical + horizontal + text label (3-phase drawing)
- **Aim lines**: Horizontal/diagonal trend lines
- **Cut lines**: Vertical segment boundaries for aggregation
- **Celeration lines**: Log-scale trend analysis

## File Handling
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
