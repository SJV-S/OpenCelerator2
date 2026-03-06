# UI Variant Strategy: SCC vs OpenCelerator

## Problem

Standard Change Chart (SCC) and OpenCelerator (OC) share the same backend and chart logic, but their UIs are expected to increasingly diverge. SCC targets a simplified experience; OC exposes advanced tools. Today the only differences are cosmetic (app name, manifest), handled by sed replacements at deploy time. That approach won't scale as the UIs diverge further.

## Constraints

- One codebase, one repo — no forks or long-lived branches
- Backend routes, chart engine, sync, storage, and line logic stay shared
- Deploy scripts already set the variant (SCC vs OC) at build time
- Divergence is UI-only: templates, menus, controls, possibly different default settings

## Options

### Option 1: Template-level branching

Add `app_variant` (`'scc'` or `'oc'`) to the Jinja context alongside `app_name`. Use `{% if app_variant == 'oc' %}` blocks in shared templates.

**Pros:**
- Zero new infrastructure — works with what exists today
- Fine for small differences (labels, showing/hiding a button)

**Cons:**
- Templates become hard to read as divergence grows
- Every template change requires thinking about both variants
- No clean separation — both UIs are interleaved in every file

**Best for:** Early stage, fewer than ~10 divergence points across all templates.

### Option 2: Template override directories

Flask checks an override folder first, then falls back to the shared base.

```
templates/
    base.html              ← shared
    SCC/
        welcome.html       ← shared default
        view_chart.html    ← shared default
        menu/
            data.html      ← shared default
            lines.html     ← shared default
    OC/
        welcome.html       ← OC-specific override (only if different)
        menu/
            lines.html     ← OC-specific override (only if different)
```

A config flag or deploy-time switch controls which override folder is active. Templates that are identical between variants exist only in `SCC/` (the base). Templates that diverge get an `OC/` copy.

**Pros:**
- Clean separation — each variant's differences are in their own directory
- Shared templates stay shared with zero duplication
- Easy to see at a glance what differs between variants

**Cons:**
- Duplicated templates can drift — changes to shared logic in an overridden template must be applied in both places
- Requires a template loader change in `app.py` (straightforward but non-trivial)

**Best for:** Moderate divergence — different page layouts, different menu structures, different data entry flows.

### Option 3: Separate JS UI entry points

The chart core (`chartState`, `tracePipeline`, lines, series, storage, sync) stays in `static/SCC/`. A new `static/OC/` directory holds OpenCelerator-specific UI modules. Each variant has its own `main.js` that imports the shared core but wires up different UI.

```
static/
    SCC/
        main.js            ← SCC entry point (simplified UI)
        chartState.js      ← shared core
        series/            ← shared core
        lines/             ← shared core
        ui/                ← SCC-specific UI modules
    OC/
        main.js            ← OC entry point (advanced UI)
        ui/                ← OC-specific UI modules
```

The template (or deploy script) controls which `main.js` is loaded.

**Pros:**
- JS-level separation matches how the codebase is already modular
- Shared chart logic has zero duplication
- Each variant can have completely different UI wiring

**Cons:**
- More complex module graph to reason about
- Shared UI utilities may need to be extracted to a common location
- Two entry points to maintain

**Best for:** Significant UI divergence at the JavaScript level — different toolbars, different interaction patterns, different event handling.

### Option 4: Feature flags

Define capabilities in config rather than branching by variant name:

```python
# config.py
FEATURES = {
    'advanced_celeration_tools': False,
    'advanced_series_management': False,
    'simplified_data_entry': True,
    # ...
}
```

SCC enables the simple set, OC enables everything. Flags are available in both Jinja (via context processor) and JS (via config.js).

**Pros:**
- Most granular control — mix and match features freely
- No file duplication at all
- Easy to A/B test or gradually introduce features

**Cons:**
- Flag sprawl as divergence grows — every difference needs a flag
- Conditional logic scattered across templates and JS
- Harder to reason about the overall UX of each variant

**Best for:** Divergence is primarily about which features are visible, not how pages are structured.

## Recommendation

**Options 2 + 3 combined**, introduced incrementally:

1. **Now:** Continue with the current approach (config-driven `app_name`, deploy-time sed). It works for cosmetic differences.
2. **When templates start diverging:** Introduce template override directories (Option 2). Only duplicate the templates that actually differ.
3. **When JS UI logic diverges:** Introduce separate entry points (Option 3). Keep the chart engine shared, split the UI wiring.

The decision point for each step is when `{% if variant %}` blocks start making templates hard to read, or when you find yourself wanting entirely different page structures rather than just showing/hiding elements.

Option 4 (feature flags) can complement any of the above for fine-grained toggles, but shouldn't be the primary mechanism if the UIs diverge structurally.
