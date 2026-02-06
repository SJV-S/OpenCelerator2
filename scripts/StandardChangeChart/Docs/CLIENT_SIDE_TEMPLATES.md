# Client-Side Chart Templates

## Goal

Simplify the chart URL from `/chart/Daily/minute?load=abc123` to `/chart?load=abc123`.

Currently, the URL path tells Flask which chart type to render. But the chart type is already stored in IndexedDB with the chart data. The URL is redundant.

## Current Flow

1. User navigates to `/chart/Daily/minute?load=abc123`
2. Flask reads URL path, selects template based on:
   - Chart type (Daily, Weekly, etc.)
   - Minute type (minute or count)
   - Container dimensions (picks largest template that fits)
3. Flask loads template JSON from `charts/layouts/`
4. Flask renders `chart.html` with `plot_json` embedded
5. JS loads chart data from IndexedDB
6. JS renders chart with Plotly

## Proposed Flow

1. User navigates to `/chart?load=abc123`
2. Flask serves minimal `chart.html` (no embedded template)
3. JS loads chart data from IndexedDB (includes chartType, minuteChart)
4. JS determines which template is needed based on container dimensions
5. JS fetches template (from where? see open questions)
6. JS renders chart with Plotly

## Open Questions

### 1. Where do templates live?

**Option A: Keep in `charts/layouts/`, add API route**
- Templates stay where they are
- Add `/api/template/<type>/<minute>?width=X&height=Y` endpoint
- Flask still does template selection logic
- Simpler migration, but still server round-trip

**Option B: Move to `/static/` as JSON files**
- Templates become static assets
- JS fetches directly, no Flask logic
- Template selection logic moves to JS
- Faster (static file serving), but need to move files

**Option C: Convert to JS modules**
- Templates become ES6 modules
- Bundled with app or lazy-loaded
- No fetch needed, but increases JS bundle size
- Templates are large JSON - may not be practical

### 2. Template selection logic

Currently in Flask (`app.py`):
- Calculates required width for each template given container height
- Picks largest template that fits container width
- Falls back to smallest if none fit

This logic needs to move to JS if we go with Option B or C.

### 3. Are templates static or dynamic?

If templates are purely static configurations (axis ranges, margins, etc.), they can be client-side.

If they contain any server-generated content, they need to stay server-side.

## Recommendation

Start with **Option A** (API route) as incremental step:
- Minimal changes to existing code
- Validates the `/chart?load=id` URL pattern works
- Can migrate to Option B later if needed

## Related Changes

This is part of simplifying the storage architecture:
- Removed localStorage, using IndexedDB only
- Charts must be named before creation (no drafts)
- Auto-save on mutations
- Single `/chart` route instead of per-type routes
