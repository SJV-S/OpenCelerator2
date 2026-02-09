# Service Worker Offline Fixes

## 1. Version Display in Online/Offline Status

**Problem:** The online/offline status indicator (top-right corner) showed no app version.

**Solution:** Two-way communication between the SW and the page:

- **SW responds to requests:** A `message` listener in `service-worker.js` responds to `GET_VERSION` with `SW_VERSION`.
- **SW broadcasts on activation:** After `clients.claim()`, the SW sends `SW_VERSION` to all open tabs via `client.postMessage()`.
- **Page listens for both:** `onlineStatus.js` requests the version on init (for normal loads) and listens for broadcast messages (for mid-page SW updates).

**Why two paths?** On a normal page load, the SW is already active, so the request/response works. But when the SW updates mid-session, the old SW receives the request and ignores it. The broadcast from the new SW's activate handler covers that case.

**Files changed:** `service-worker.js`, `static/Server/onlineStatus.js`

---

## 2. Offline Chart Page Serving

**Problem:** Navigating to `/chart/<id>` while offline failed if that specific URL had never been visited. The SW's fallback served `/` (menu page) instead of the chart page.

**Root cause:** Chart pages are runtime-cached (cached on first visit), not precached. The SW had no response for unvisited chart URLs.

**Why it matters:** Creating a chart offline via `/new` (which IS precached) redirects to `/chart/<new_id>` -- a URL that's never been cached. The creation flow broke at the redirect step.

**Solution:** The SW fallback now searches the cache for ANY previously cached `/chart/` response and serves that instead. This works because `chart.html` is the same template for every chart -- only the chart ID differs, and chart data is loaded from IndexedDB.

```javascript
// service-worker.js - networkFirstWithCache fallback
if (isChartPage(request.url)) {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const chartKey = keys.find(k => isChartPage(k.url));
    if (chartKey) {
        return cache.match(chartKey);
    }
}
```

**Files changed:** `service-worker.js`

---

## 3. Chart ID From URL, Not Jinja

**Problem:** `chart.html` had `const chartId = '{{ chart_id }}'` -- the chart ID was baked into the HTML by Jinja at render time. When the SW served a cached chart page from a different URL (fix #2), the baked-in ID was wrong, loading the wrong chart.

**Solution:** Read the chart ID from the browser URL instead:

```javascript
// Before
const chartId = '{{ chart_id }}';

// After
const pathParts = window.location.pathname.split('/');
const chartId = pathParts[2];
```

The URL always reflects the intended chart, regardless of which cached HTML the SW serves.

**Files changed:** `templates/SCC/chart.html`

---

## 4. Broken Unshare Navigation URL

**Problem:** `share.js` line 351 navigated to `/chart/${chartType}/${minuteType}?load=${newId}` after unsharing. This produced URLs like `/chart/Daily/minute?load=abc123`, which Flask matched as `chart(chart_id='Daily', share_secret='minute')`. The `?load=` param was never read. The new private chart was orphaned in IndexedDB.

**Solution:** Navigate to `/chart/${newId}` instead, matching the pattern used everywhere else.

**Files changed:** `static/SCC/misc/share.js`