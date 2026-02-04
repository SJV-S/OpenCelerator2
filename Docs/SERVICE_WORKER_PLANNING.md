# Service Worker Planning Report

A comprehensive analysis of the SCC application for implementing offline-first PWA functionality with a simple, robust, and lean service worker.

---

## Implementation Progress

### Phase 1: Install Experience (COMPLETE)

**Status**: Done

**Files created/modified**:
- `service-worker.js` - Minimal SW (no caching, just install/activate) - in project root
- `static/manifest.json` - PWA manifest with app name, icons, theme
- `static/SCC/icons/icon-192.png` - App icon (192x192)
- `static/SCC/icons/icon-512.png` - App icon (512x512)
- `static/SCC/icons/celeration.svg` - Source SVG with #05c3de fill
- `app.py` - Added `/service-worker.js` route using `send_from_directory(app.root_path, ...)`
- `templates/SCC/base.html` - Refactored as generic base template with manifest link, theme-color meta, SW registration
- `templates/SCC/menu_page.html` - Refactored to extend base.html, added install button
- `templates/SCC/new_chart.html` - Refactored to extend base.html
- `templates/SCC/chart.html` - Updated to include chart-specific scripts via blocks
- `static/SCC/pwaInstall.js` - Install button handler (beforeinstallprompt)

---

### Phase 2: Offline Caching (COMPLETE)

**Status**: Done

**DEVELOPMENT NOTE**: Verbose console logging (`[SW]` prefix) is intentional for debugging during development. These logs should be reduced or removed before production deployment.

**Files modified**:
- `service-worker.js` - Added caching with two strategies:
  - **Network-first** for HTML pages (3s timeout, cache fallback)
  - **Cache-first** for static assets and CDN resources
- `static/SCC/debug.js` - Added `[SW]` to DEBUG_PREFIXES for log capture

**Caching strategy**:
- Precaches: `/`, `/new`, manifest, icons
- CDN caching: Tailwind, Plotly.js, Google Fonts (cached on first fetch)
- Static assets: All `/static/*` files (cached on first fetch)
- Chart pages: Cached per-URL, with fallback to `/` if uncached

**Testing**:
1. Load the app and navigate to a chart
2. Open DevTools > Application > Cache Storage to verify assets cached
3. Check DevTools Console for `[SW 2.0.0]` logs showing cache hits/misses
4. Enable "Offline" in DevTools > Network tab
5. Refresh - app should load from cache
6. Navigate between pages - should work offline

**Next Phase**: Phase 3 - manifest.json enhancements, offline fallback page (optional)

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Static Asset Inventory](#2-static-asset-inventory)
3. [Data Architecture](#3-data-architecture)
4. [Flask Considerations](#4-flask-considerations)
5. [CDN Dependencies](#5-cdn-dependencies)
6. [Template Loading](#6-template-loading)
7. [Routes and Navigation](#7-routes-and-navigation)
8. [Caching Strategy Options](#8-caching-strategy-options)
9. [Open Questions](#9-open-questions)
10. [Recommendations](#10-recommendations)

---

## 1. Application Overview

### What Is This Application?

Single-Case Chart (SCC) is a behavioral data visualization tool that displays time-series data (correct/incorrect responses, timing) on logarithmic charts with analytical line drawing tools.

### Use Case for Offline

Users need to:
- View and edit existing charts without internet connection
- Create new charts offline
- Have all tools (line drawing, data entry, export) available offline
- Sync changes when connectivity returns (future feature, see `PWA_SYNC_PROPOSAL.md`)

### Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Flask 3.0 (Python) |
| Frontend | ES6 JavaScript modules |
| Charting | Plotly.js 2.35.2 |
| Styling | Tailwind CSS (CDN) |
| Data Storage | IndexedDB |
| Import/Export | xlsx.full.min.js |

---

## 2. Static Asset Inventory

### JavaScript Modules (46 files, ~150KB excluding libraries)

```
static/SCC/
├── main.js                      # Entry point
├── eventBus.js                  # Pub/sub event system
├── chartState.js                # Centralized state
├── config.js                    # Constants
├── debug.js                     # Console debugging
├── navigation.js                # Tab switching, keyboard shortcuts
│
├── series/
│   ├── dataEntry.js             # Form submission
│   ├── dataUpdate.js            # Data editing
│   ├── replot.js                # Chart refresh
│   ├── tracePipeline.js         # Plotly trace creation
│   ├── traceStyles.js           # Trace appearance
│   └── miscSeries.js            # Dynamic misc series
│
├── lines/
│   ├── allLines.js              # Line aggregation
│   ├── phaseLines.js            # Phase line drawing
│   ├── aimLines.js              # Aim/trend lines
│   ├── cutLines.js              # Cut line segments
│   ├── celLine.js               # Celeration lines
│   └── lineClickHandler.js      # Line interactions
│
├── misc/
│   ├── grid.js                  # Grid toggle
│   ├── customLegend.js          # Legend rendering
│   ├── celerationFan.js         # Celeration fan
│   ├── credit.js                # Credit lines
│   └── share.js                 # Sharing
│
├── util/
│   ├── dates.js                 # Date math
│   ├── toaster.js               # Toast notifications
│   ├── format.js                # Data formatting
│   ├── icons.js                 # Icon definitions
│   ├── crosshair.js             # Crosshair
│   ├── cursorIcon.js            # Cursor icons
│   ├── tooltip.js               # UI tooltips
│   ├── agg.js                   # Aggregation helpers
│   ├── fit_lines.js             # Line fitting
│   ├── panning_controls.js      # Pan constraints
│   ├── chartLayouts.js          # Chart templates (~306KB!)
│   ├── startDateControls.js     # Start date
│   ├── dataImport.js            # Import functionality
│   ├── importUI.js              # Import UI
│   ├── openCeleratorImport.js   # Celerator format
│   ├── jsonBackwardsCompatibility.js
│   ├── plotlyWrapper.js         # Plotly abstraction
│   └── resize-chart.js
│
├── storage/
│   └── chartStorage.js          # IndexedDB persistence
│
├── lib/
│   ├── idb.js                   # IndexedDB wrapper (3.6KB)
│   └── xlsx.full.min.js         # Excel support (952KB)
│
└── tests/
    └── testMiscSeries.js        # Tests
```

### Critical Discovery: Embedded Templates

**`chartLayouts.js` is 306KB** because it embeds all chart templates as JavaScript objects. This is a single file that must be cached for the app to work.

### CSS (1 file)

```
static/SCC/css/
└── chart_menu.css               # Sidebar/menu styles (~10KB)
```

### Icons (10 SVG files)

```
static/SCC/temp/icons/
├── camera-solid-full.svg
├── celeration.svg
├── crosshairs-solid-full.svg
├── flag-solid-full.svg
├── gear-solid-full.svg
├── images-solid-full.svg
├── phase_text_bottom.svg
├── phase_text_top.svg
├── scissors-solid-full.svg
└── trash-solid-full.svg
```

### Size Summary

| Category | Count | Size |
|----------|-------|------|
| JS modules | 46 | ~150KB |
| chartLayouts.js (templates) | 1 | ~306KB |
| idb.js | 1 | ~3.6KB |
| xlsx.full.min.js | 1 | ~952KB |
| CSS | 1 | ~10KB |
| SVG icons | 10 | ~15KB |
| **Local Total** | **60** | **~1.4MB** |

---

## 3. Data Architecture

### IndexedDB (Primary Storage)

All chart data is stored client-side in IndexedDB:

```javascript
// Database: SCC_Charts, Version: 1, Store: charts
{
    id: "uuid",
    chartName: "My Chart",
    chartType: "Daily",      // Daily, Weekly, Monthly, Yearly, Timing, FrequencyCollections
    minuteChart: true,
    series: { xValues: [], corrects: [], errors: [], timing: [], misc: {} },
    lines: { phase: [], aim: [], cut: [], cel: [] },
    credits: { 0: "Line 1", 1: "Line 2" },
    tags: ["tag1", "tag2"],
    _createdAt: 1706400000000,
    _updatedAt: 1706500000000
}
```

### What This Means for Offline

- **IndexedDB is already persistent** - chart data survives page reloads and browser restarts
- **No server-side data** - Flask only serves static files and HTML templates
- **All state mutations trigger auto-save** with 1000ms debounce
- **Service worker does NOT need to cache chart data** - IndexedDB handles this

### Future Sync

`PWA_SYNC_PROPOSAL.md` describes a future cloud sync system:
- Zero-knowledge encryption with BIP39 passphrases
- Server stores encrypted blobs only
- Sync triggers: app startup, after save, visibility change
- Explicitly states: "Do not rely on service worker background sync"

---

## 4. Flask Considerations

### Current Route Structure

```python
# app.py
@app.route('/')
def index():
    return render_template('SCC/menu_page.html')

@app.route('/new')
def new_chart():
    return render_template('SCC/new_chart.html')

@app.route('/chart/<chart_id>')
def chart(chart_id):
    return render_template('SCC/chart.html', chart_id=chart_id)
```

### Service Worker Scope Issue

**Problem**: Service workers can only control pages within their scope. A SW at `/static/sw.js` can only intercept requests to `/static/*`.

**Solution Options**:

| Option | Placement | Scope | Can Intercept |
|--------|-----------|-------|---------------|
| A | `/service-worker.js` | `/` | All routes |
| B | `/static/service-worker.js` | `/static/` | Static assets only |

**Option A is required** to intercept HTML pages (`/`, `/new`, `/chart/*`).

### Flask Static File Configuration

Flask serves files from `/static/` by default:

```python
app = Flask(__name__)
# Default: static_folder='static', static_url_path='/static'
```

**To serve SW from root**, you need one of:

1. **Add a route** (simple, but adds a Python handler):
   ```python
   from flask import make_response, send_file

   @app.route('/service-worker.js')
   def sw():
       response = make_response(send_file('static/service-worker.js', mimetype='application/javascript'))
       # Critical: Ensure browser always checks for SW updates
       response.headers['Cache-Control'] = 'max-age=0'
       return response
   ```

2. **Flask's `send_from_directory`** in a route (same Cache-Control header needed)

3. **Reverse proxy** (nginx/Apache) serves SW from root (configure Cache-Control there)

4. **Static file override** - configure Flask differently

**Critical Header**: Chrome Developers recommends: *"It's still a good idea to continue setting the `Cache-Control: max-age=0` header on service worker scripts."* This ensures browsers always check for updates.

### Question: Which Flask approach?

See [Question 1](#question-1-service-worker-placement) in Open Questions.

---

## 5. CDN Dependencies

### Current External Dependencies

```html
<!-- base.html -->
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
```

### Tailwind CSS CDN

- **What it is**: A JavaScript-based JIT compiler that generates CSS at runtime using MutationObserver
- **Size**: ~375KB gzipped (~2.9MB uncompressed) - significantly larger than typical CSS frameworks
- **Offline problem**: Requires network to function
- **Production warning**: Tailwind's official documentation states: *"The Play CDN is designed for development purposes only, and is not intended for production."* Adam Wathan (creator) has called it "a toy" not meant for production.
- **Solution options**:
  1. ~~Cache the CDN response~~ (not recommended for production)
  2. **Pre-build Tailwind CSS and self-host** (recommended)
  3. Use Tailwind CLI to generate a static CSS file

### Plotly.js CDN

- **What it is**: The full charting library
- **Size**: ~3.5MB minified (~1MB gzipped) - *not* 7.3MB as sometimes reported (that's uncompressed)
- **Offline problem**: App is completely non-functional without it
- **Solution options**:
  1. Cache the CDN response
  2. Self-host the file in `/static/`
  3. Use a lighter Plotly bundle (partial)
- **Partial bundles available**:
  - `plotly.js-basic-dist-min`: Contains bar, pie, scatter - only 976KB minified (318KB gzipped)
  - This app uses scatter plots primarily, so a partial bundle may suffice

### Questions About CDN Strategy

See [Question 2](#question-2-cdn-strategy) in Open Questions.

---

## 6. Template Loading

### How Templates Work

Chart templates (axis ranges, tick marks, layout config) are **embedded in JavaScript**:

```javascript
// chartLayouts.js (306KB file)
const TEMPLATES = {
    Daily: {
        minute: { /* full Plotly layout object */ },
        count: { /* ... */ }
    },
    Weekly: { /* ... */ },
    // ... etc
};
```

### Why This Matters

- Templates are **already bundled** - no dynamic loading needed
- The 306KB `chartLayouts.js` file is **critical** - without it, no charts render
- This simplifies caching - no separate template files to manage

### Historical Context

`CLIENT_SIDE_TEMPLATES.md` documents the decision to move templates from server-side JSON files to client-side JavaScript. This was specifically done to simplify the architecture and support offline use.

---

## 7. Routes and Navigation

### Page Inventory

| Route | Template | Purpose | Can Work Offline? |
|-------|----------|---------|-------------------|
| `/` | menu_page.html | Chart list | Yes (IndexedDB) |
| `/new` | new_chart.html | Create chart | Yes |
| `/chart/<id>` | chart.html | View/edit | Yes (IndexedDB) |

### Dynamic Route Challenge

`/chart/<chart_id>` accepts any UUID. The service worker must:
- Match `/chart/*` pattern
- Serve the same `chart.html` for all IDs
- Let JavaScript handle loading the specific chart from IndexedDB

### Navigation Flow

```
/              → lists charts from IndexedDB
    ↓ click "New Chart"
/new           → form to name chart
    ↓ submit
/chart/{uuid}  → chart saved to IndexedDB, page renders

/              → lists charts from IndexedDB
    ↓ click chart name
/chart/{uuid}  → loads chart from IndexedDB, renders
```

---

## 8. Caching Strategy Options

### Strategy Comparison

| Strategy | Description | Pros | Cons |
|----------|-------------|------|------|
| **Cache-First** | Check cache, fallback to network | Fast, reliable offline | May serve stale assets |
| **Network-First** | Try network, fallback to cache | Always fresh when online | Slower, requires timeout |
| **Stale-While-Revalidate** | Serve cache, update in background | Fast + eventually fresh | Complexity, double requests |
| **Cache-Only** | Only serve from cache | Simplest, fastest | No updates possible |
| **Network-Only** | Only fetch from network | Always fresh | No offline support |

### Asset Categories

| Asset Type | Suggested Strategy | Rationale |
|------------|-------------------|-----------|
| HTML pages | Network-First (3s timeout) | Get fresh if possible, fallback works |
| JS modules | Cache-First with versioning | Rarely change, need to work offline |
| CSS | Cache-First with versioning | Same as JS |
| Icons (SVG) | Cache-First | Never change |
| Plotly | Self-host + Cache-First | Critical dependency, pinned version |
| Tailwind | Build statically | CDN not for production |

**Note**: 3-second timeout is standard for navigation requests. 5 seconds is acceptable but on the longer end.

### Versioning Approach

**Problem**: How does the service worker know when to update cached assets?

**Options**:
1. **Cache busting in URLs**: `/static/main.js?v=1.2.3`
2. **Precache manifest**: SW contains list of files + hashes
3. **App version header**: Custom header or meta tag
4. **Manual SW update**: Bump SW version when deploying

---

## 9. Open Questions

### Question 1: Service Worker Placement (RESOLVED)

**Context**: SW must be at root (`/`) to intercept all routes.

**Decision**: Option A - Flask route for `/service-worker.js`

**Implementation**: Added route in `app.py` using `send_from_directory(app.root_path, 'service-worker.js')`. File lives in project root.

---

### Question 2: CDN Strategy

**Context**: App depends on Tailwind CSS CDN (~375KB gzipped, not production-ready) and Plotly.js (~3.5MB minified, ~1MB gzipped).

**Option A: Cache CDN responses**
- Pros: Simple, leverages browser cache
- Cons: CDN might change responses, Tailwind CDN explicitly not for production

**Option B: Self-host everything**
- Pros: Full control, guaranteed availability
- Cons: Increases deployment size, must manage updates

**Option C: Hybrid (self-host Plotly, build Tailwind statically)**
- Pros: Prioritizes critical dependency, makes Tailwind production-ready
- Cons: Requires build step for Tailwind

**Option D: Build Tailwind CSS statically (strongly recommended)**
- Pros: Smaller output (~10-50KB vs 375KB), faster, production-ready
- Cons: Requires build step in development

**Questions**:
1. Should Plotly be self-hosted (~3.5MB) or cached from CDN?
2. Should Tailwind be built statically? (CDN is explicitly not for production)
3. Would `plotly.js-basic-dist-min` (976KB) suffice for this app's chart types?

---

### Question 3: Cache Invalidation

**Context**: When deploying new code, how does the SW know to update?

**Option A: Version in SW filename**
```javascript
// service-worker-v1.0.0.js
const CACHE_NAME = 'scc-v1.0.0';
```

**Option B: Precache manifest (generated at build time)**
```javascript
const PRECACHE = [
    { url: '/static/SCC/main.js', revision: 'abc123' },
    // ...
];
```

**Option C: Network-first for HTML, cache-first for assets**
- HTML always fresh → sees new asset URLs
- Assets use cache busting (`main.js?v=1.0.0`)

**Your preference for complexity vs. reliability?**

---

### Question 4: Offline Fallback Behavior

**Context**: What should happen when a user navigates to a URL that isn't cached?

**Scenarios**:
1. User bookmarked `/chart/abc-123` but cache was cleared
2. User tries to navigate to non-existent route
3. Network request fails for uncached resource

**Recommended approach** (per web.dev):
- Pre-cache a dedicated `offline.html` page during install
- Return it when network fails for navigation requests
- The offline page should include:
  - Manual **retry/reconnect button**
  - Automatic reload on the `online` event (`window.addEventListener('online', ...)`)
  - All resources **inlined** (CSS, JS) for self-containment

**Options**:
A. **Show `offline.html` with retry button** (recommended)
B. Redirect to `/` (only works if `/` is cached)
C. Show browser's default offline error (poor UX)

---

### Question 5: xlsx.full.min.js (952KB)

**Context**: This library is only needed for Excel import/export.

**Options**:
A. Cache normally (adds 952KB to cache)
B. Lazy-load and cache on first use
C. Make import/export online-only features

**Trade-off**: Cache size vs. feature availability offline

---

### Question 6: Development Experience

**Context**: Service workers can make development painful (stale caches).

**Workbox documentation warns**: *"It's easy to leave 'Update on reload' on, and it fundamentally changes how the service worker lifecycle works. Our recommendation is to avoid making this feature a central part of testing."*

**Preferred approach**: Use incognito/private browsing windows for testing. Workbox describes this as *"By far the most effective way to test a service worker."*

**Options**:
A. Disable SW in development (only enable in production)
B. Use incognito windows for testing (recommended for realistic behavior)
C. Use "Update on reload" sparingly in DevTools

**Additional tips**:
- `Shift+Reload` bypasses SW once (but only once)
- `chrome://serviceworker-internals` for debugging internals
- Disable Network panel's "Disable cache" when testing SW (it bypasses SW)
- `localhost` is treated as secure origin; other local hostnames require flags

**Your development workflow preference?**

---

### Question 7: Future Sync Integration

**Context**: `PWA_SYNC_PROPOSAL.md` describes future cloud sync.

**Current decision**: Service worker should NOT handle sync.

**Proposal states**:
> "Do not rely on service worker background sync. Instead, attempt sync at: app startup, after saving a chart, visibility change, periodic retry."

**Why this is the right choice**:
- Safari and Firefox **do not support** Background Sync API (~20% of users excluded)
- The API isn't on W3C Standards Track
- App-code sync works universally across all browsers
- Background Sync should only be treated as progressive enhancement

**Implication**: SW stays simple (caching only), sync is handled by app code.

**Does this align with your expectations?**

---

### Question 8: Cache Size Limits

**Context**: Browsers impose storage limits (varies by browser/device).

**Estimated cache size**:
| Asset | Size |
|-------|------|
| Local JS/CSS/SVG | ~500KB |
| chartLayouts.js | ~306KB |
| xlsx.full.min.js | ~952KB |
| Plotly.js (if self-hosted) | ~3.5MB (or ~976KB for basic bundle) |
| **Total** | **~5.3MB** (or ~2.7MB with basic Plotly) |

**Browser limits are generous**:
- Chrome: 60% of total disk size
- Firefox: 10% of disk, max 10GB per domain
- Safari: ~60% for browser apps, starting at 1GB
- Practical minimum: ~50MB across browsers

**At 5MB, the cache uses ~0.01% of even a conservative 50GB quota** - well within safe limits.

**Safari caveat**: Data may be evicted after 7 days without user interaction when cross-site tracking prevention is enabled.

**Questions**:
1. Should we use the basic Plotly bundle (~976KB) to reduce cache size?
2. Should we implement cache eviction for old versions? (Yes, recommended)
3. Should xlsx.full.min.js be lazy-loaded on first import use?

---

### Question 9: manifest.json

**Context**: PWAs require a manifest for "Add to Home Screen" functionality.

**Actually required for Chrome installability (2025)**:
- `name` OR `short_name` (one required, not both)
- `icons` (192px and 512px)
- `start_url`
- `display` (fullscreen, standalone, minimal-ui, or window-controls-overlay)

**Optional but recommended**:
- `theme_color` - affects browser UI color
- `scope` - defaults to manifest directory if omitted
- `background_color` - splash screen color

**Note**: Chrome's December 2023 blog announced: *"We have removed the requirement to have a service worker that implements fetch() for installation."* Requirements have been relaxing, not tightening.

**Questions**:
1. What should the app be named?
2. Do we have icon assets, or need to create them?
3. Should we support "Add to Home Screen" now or defer?

---

### Question 10: Scope of Initial Implementation

**Context**: PWA features range from simple caching to complex background sync.

**Phased approach**:

| Phase | Features | Complexity |
|-------|----------|------------|
| 1 | Basic caching (view charts offline) | Low |
| 2 | Full offline (create/edit charts) | Low-Medium |
| 3 | manifest.json + installability | Low |
| 4 | Background sync (future) | High |

**Which phases should we tackle now?**

---

## 10. Recommendations

Based on the goal of "simple, robust, lean":

### Recommended Approach

1. **Service Worker Placement**: Add Flask route for `/service-worker.js` with `Cache-Control: max-age=0` header

2. **Caching Strategy**:
   - Network-first for HTML pages (3-second timeout, industry standard)
   - Cache-first for all static assets
   - Version-based cache name for invalidation
   - Consider enabling Navigation Preload to mitigate network-first latency

3. **CDN Handling**:
   - Self-host Plotly.js (~3.5MB, or ~976KB basic bundle if sufficient)
   - **Build Tailwind CSS statically** (CDN is explicitly not for production)

4. **Cache Scope**:
   - All JS modules including chartLayouts.js
   - All CSS and icons
   - All three HTML pages (as app shell)
   - `offline.html` fallback page with retry button
   - xlsx.full.min.js (accept the 952KB, or lazy-load on first use)

5. **Keep It Simple**:
   - No background sync in SW (Safari/Firefox don't support it anyway)
   - No IndexedDB caching in SW (app handles this)
   - Simple offline fallback page
   - Single cache with version-based names

### Minimal Service Worker Structure

```javascript
const CACHE_NAME = 'scc-v1.0.0';
const PRECACHE_URLS = [
    '/',
    '/new',
    '/offline.html',    // Generic offline fallback page
    '/static/SCC/main.js',
    // ... all static assets
];

// Install: precache all assets
// WARNING: cache.addAll() is atomic - if ANY request fails, entire install fails.
// Ensure all URLs are reliable.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// Fetch: network-first for HTML, cache-first for assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Note: event.request.mode === 'navigate' only fires for top-level navigation,
    // not subresource requests. Shift+Reload bypasses SW entirely.
    if (event.request.mode === 'navigate') {
        // HTML pages: network-first with timeout (3 seconds is common, 5 is acceptable)
        event.respondWith(networkFirstWithTimeout(event.request, 3000));
    } else {
        // Assets: cache-first
        event.respondWith(cacheFirst(event.request));
    }
});
```

**Warning about `skipWaiting()` + `clients.claim()`**: web.dev warns: *"skipWaiting() means that your new service worker is likely controlling pages that were loaded with an older version. This means some of your page's fetches will have been handled by your old service worker, but your new service worker will be handling subsequent fetches."*

This is **safe for this app** because:
- Changes are typically additive
- Cache uses version-based naming
- App tolerates mixed old/new resources temporarily

For production with tightly-coupled versions, consider user-prompted updates instead.

---

## Next Steps

1. **Answer the open questions** in this document
2. **Decide on Tailwind approach** (CDN vs. static build)
3. **Create manifest.json** if "Add to Home Screen" is desired
4. **Implement minimal service worker** based on decisions
5. **Test offline functionality** across browsers
6. **Document update procedure** for deployments

---

## Related Documents

- `Docs/PWA_SYNC_PROPOSAL.md` - Future cloud sync architecture
- `Docs/pwa-filesystem-workarounds.md` - Why PWAs can't access local filesystem
- `Docs/CLIENT_SIDE_TEMPLATES.md` - Why templates are bundled in JS

