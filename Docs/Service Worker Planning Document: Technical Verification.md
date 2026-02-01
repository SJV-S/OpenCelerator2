# Service Worker Planning Document: Technical Verification

A thorough audit of 20 technical claims reveals **most recommendations are accurate**, but several contain size estimates, scope assumptions, and PWA requirements that need correction. Here's what the document gets right, what it overstates, and what developers should actually implement.

## Service Worker fundamentals are correctly described

**Claim 1 — Service Worker Scope: ✅ CORRECT**

The document accurately states that a SW at `/static/sw.js` can only intercept requests to `/static/*` by default. MDN confirms: *"The default scope for a service worker registration is the directory where the service worker script is located."* Placing the SW at root (`/`) is indeed required to intercept all navigation requests—or alternatively, the server must send a `Service-Worker-Allowed` header to extend scope beyond the script's directory.

**Claim 2 — Flask route for serving SW: ✅ CORRECT with important additions**

Using `@app.route('/service-worker.js')` with `send_file()` is the correct approach. However, the document should emphasize two critical headers:

- **Cache-Control: `max-age=0` or `no-cache`** — Chrome Developers explicitly recommends this: *"It's still a good idea to continue setting the `Cache-Control: max-age=0` HTTP header on service worker scripts."* This ensures browsers always check for updates.
- **Service-Worker-Allowed** — Only needed if serving from a subdirectory while requesting broader scope. If serving from root (`/service-worker.js`), this header is unnecessary.

**Claim 6 — `skipWaiting()` and `clients.claim()`: ⚠️ CORRECT but risks under-documented**

The pattern works, but web.dev warns: *"skipWaiting() means that your new service worker is likely controlling pages that were loaded with an older version. This means some of your page's fetches will have been handled by your old service worker, but your new service worker will be handling subsequent fetches. If this might break things, don't use skipWaiting()."*

This is **safe when**: changes are additive, cache strategies use proper versioning, and the app tolerates mixed old/new resources temporarily. It's **problematic when**: cache structures change between versions or there are tightly-coupled frontend/backend version dependencies. The document should warn about version mismatch risks or recommend user-prompted updates for production.

## Caching strategies are accurately described

**Claim 3 — Strategy definitions: ✅ VERIFIED**

All five strategies are correctly described. Chrome/Workbox documentation confirms Stale-While-Revalidate as: *"On subsequent requests, serve the asset from the cache first, then 'in the background,' re-request it from the network and update the asset's cache entry."* The description "Serve cache, update in background" is accurate.

**Claim 4 — Network-first 5-second timeout: ✅ REASONABLE**

Five seconds is acceptable but on the longer end. Workbox examples typically use **3 seconds** for navigation requests. Chrome Developers advises: *"Look at the 75th percentile of TTFB and FCP scores to get a sense of where longer wait times might be among your users."* The document should note that **3-5 seconds** is the acceptable range, with 3 seconds being more common in production examples.

**Claim 5 — `event.request.mode === 'navigate'`: ✅ CORRECT**

This is the official recommended approach. MDN states: *"A mode for supporting navigation. The navigate value is intended to be used only by HTML navigation."* Edge cases to document: forced refresh (`Shift+Reload`) bypasses the service worker entirely, and this mode only fires for top-level document navigation, not subresource requests.

**Claim 10 — `cache.addAll()` for precaching: ✅ VERIFIED with warning needed**

Still the recommended approach, but the document **must warn** about atomic failure behavior. MDN confirms: *"If the promise is rejected, the installation fails, and the worker won't do anything."* If **any single request fails**, the entire precaching operation fails. This is actually desirable behavior (prevents broken partial caches), but developers should ensure all precached URLs are reliable.

**Claim 11 — Dynamic route handling (app shell pattern): ✅ CORRECT**

Matching `/chart/*` and serving the same `chart.html` is the correct Application Shell pattern. web.dev describes it as: *"Your service worker responds to navigation requests by returning the same, single HTML file—regardless of the URL being requested."* Implementation options include:
- `url.pathname.startsWith('/chart/')` in the fetch handler
- Workbox's `NavigationRoute` with regex `allowlist: [new RegExp('/chart/')]`

**Claim 12 — Version-based cache naming: ✅ STILL STANDARD**

This remains the recommended pattern in 2025. MDN's current documentation shows the exact same approach: filtering `caches.keys()` against a keep-list and deleting old caches in the `activate` event. No significant improvements or alternatives have emerged.

**Claim 17 — Cache invalidation approaches: ✅ ALL VALID**

Version in SW filename, precache manifest with hashes, and network-first HTML with cache-busted assets are all valid. For **small teams without a build system**, version in SW filename combined with version-based cache names is most practical—it's manual but straightforward and requires no tooling.

**Claim 20 — Network-first HTML, cache-first assets: ✅ STANDARD PATTERN**

This is the recommended default for offline-first PWAs. web.dev confirms HTML/navigation benefits from network-first (*"you want the most recent version of a resource"*) while static assets benefit from cache-first (faster, versioned via filenames). **Caveat**: Consider enabling Navigation Preload to mitigate network-first latency on navigation requests.

## Library size estimates contain significant errors

**Claim 7 — Tailwind CSS CDN: ⚠️ PARTIALLY INCORRECT**

The document correctly identifies the CDN as a JavaScript runtime compiler using JIT compilation and MutationObserver. However, the **~100KB size is significantly underestimated**. Third-party measurements report **~375KB gzipped** for the full JIT CDN, with uncompressed sizes reaching 2.9MB. Additionally, Tailwind's official documentation explicitly states: *"The Play CDN is designed for development purposes only, and is not intended for production."* The script *can* be cached after download, but Adam Wathan (creator) has called it "a toy" not meant for production.

**Claim 8 — Plotly.js size: ❌ SIGNIFICANTLY OVERESTIMATED**

The document claims ~7.3MB minified—the **actual size is ~3.5MB minified** (~1MB gzipped). Plotly's official dist README confirms: Full bundle is 8.3MB uncompressed, **3.5MB minified**. The document should also mention partial bundles: `plotly.js-basic-dist-min` contains bar, pie, and scatter at only **976KB minified** (318KB gzipped).

**Claim 16 — xlsx.full.min.js at 952KB: ✅ APPROXIMATELY CORRECT**

The ~952KB figure is reasonable for the full build. Smaller alternatives exist: `xlsx.mini.min.js` omits CSV/SYLK encodings and legacy formats. Lazy-loading on first use is a valid strategy—the Cache API supports caching resources on-demand during fetch events, not just during install.

## Cache limits are not a concern for this application

**Claim 9 — Browser cache storage limits: ✅ 9MB IS WELL WITHIN LIMITS**

Modern browser limits are generous:
- **Chrome**: 60% of total disk size (e.g., 600GB on a 1TB drive)
- **Firefox**: 10% of disk, max 10GB per domain
- **Safari**: ~60% for browser apps (macOS 14+/iOS 17+), starting at 1GB

The practical minimum across browsers is ~50MB. At **9MB, the cache uses approximately 0.018%** of even a conservative 50GB quota. This is extremely safe. Chrome incognito has a hard limit of 100MB, still well above 9MB.

**Safari caveat**: Data may be evicted after 7 days without user interaction when cross-site tracking prevention is enabled.

## Storage architecture claims are correct

**Claim 13 — IndexedDB separate from SW cache: ✅ CORRECT**

The statement "Service worker does NOT need to cache chart data—IndexedDB handles this" is technically accurate. web.dev explicitly differentiates: *"Cache Storage API: Use for network resources, things you'd access via URL. IndexedDB: Use to store structured data that needs to be searchable or combinable in a NoSQL-like manner."* Both persist independently to disk and share quota but **not content**. Storing chart data in IndexedDB rather than the Cache API is the correct architectural decision.

**Claim 14 — Background Sync exclusion: ✅ REASONABLE**

Handling sync in app code rather than Background Sync API is a **pragmatic choice** given browser support: Safari and Firefox **do not support** Background Sync API at all (~20% of users excluded). The API also isn't on W3C Standards Track. App-code sync works universally; Background Sync should be treated as progressive enhancement only. The document's recommendation is sound for cross-browser compatibility.

## PWA manifest requirements are over-specified

**Claim 15 — Manifest requirements: ⚠️ OVERCOMPLETE**

The document lists `name`, `short_name`, `icons`, `theme_color`, `display`, `start_url`, `scope`—but this exceeds current minimum requirements.

**Actually required for Chrome installability (2025)**:
- `name` OR `short_name` (one required, not both)
- `icons` (192px and 512px)
- `start_url`
- `display` (fullscreen, standalone, minimal-ui, or window-controls-overlay)

**NOT required**: `scope` (optional), `theme_color` (optional but recommended). Chrome's December 2023 blog post announced: *"We have removed the requirement to have a service worker that implements fetch() for installation."* Requirements have been relaxing, not tightening.

## Offline fallback and development practices are sound

**Claim 18 — Offline fallback for uncached routes: ✅ BEST PRACTICE IDENTIFIED**

web.dev recommends a **generic offline fallback page** as the primary approach: *"You can provide a customized offline experience...a branded page with the information that the user is currently offline."* The offline page should include:
- Manual **retry/reconnect button**
- Automatic reload on the `online` event
- All resources **inlined** (CSS, JS) for self-containment

The pattern: pre-cache `offline.html` during install, return it when network fails for navigation requests.

**Claim 19 — Development experience: ✅ VERIFIED with caveats**

"Update on reload" and "Bypass for network" in DevTools are current recommended debugging tools. However, Workbox documentation warns: *"It's easy to leave 'Update on reload' on, and it fundamentally changes how the service worker lifecycle works. Our recommendation is to avoid making this feature a central part of testing."*

**Preferred approach**: Use incognito/private browsing windows for testing (*"By far the most effective way to test a service worker"*). Additional tips:
- `Shift+Reload` bypasses SW once (but only once)
- `chrome://serviceworker-internals` for debugging internals
- Disable Network panel's "Disable cache" when testing SW (it bypasses SW)
- `localhost` is treated as secure origin; other local hostnames require flags

## Summary of corrections needed

| Claim | Status | Action Required |
|-------|--------|-----------------|
| 1. SW Scope | ✅ Correct | None |
| 2. Flask route | ✅ Correct | Add Cache-Control header recommendation |
| 3. Caching strategies | ✅ Correct | None |
| 4. 5-second timeout | ✅ Reasonable | Note 3 seconds is more common |
| 5. Navigate mode | ✅ Correct | Document edge cases |
| 6. skipWaiting pattern | ⚠️ Risky | Add version mismatch warning |
| 7. Tailwind CDN size | ❌ Incorrect | Correct to ~375KB gzipped; add production warning |
| 8. Plotly.js size | ❌ Incorrect | Correct to ~3.5MB; mention partial bundles |
| 9. Cache limits | ✅ Correct | None (9MB is safe) |
| 10. cache.addAll() | ✅ Correct | Add atomic failure warning |
| 11. Dynamic routes | ✅ Correct | None |
| 12. Version-based cache | ✅ Correct | None |
| 13. IndexedDB separation | ✅ Correct | None |
| 14. Background Sync exclusion | ✅ Reasonable | Note it's due to Safari/Firefox support |
| 15. PWA manifest | ⚠️ Overcomplete | Remove scope and theme_color from required list |
| 16. xlsx.js size | ✅ Correct | None |
| 17. Cache invalidation | ✅ Correct | None |
| 18. Offline fallback | ✅ Correct | Recommend offline.html with retry button |
| 19. Dev experience | ✅ Correct | Add incognito testing recommendation |
| 20. Network/cache pattern | ✅ Correct | Mention Navigation Preload |

The document demonstrates solid understanding of Service Worker architecture. The primary corrections involve **accurate library sizing** (Plotly is half the stated size, Tailwind CDN is 3-4x larger), **relaxed PWA manifest requirements**, and **risk documentation for skipWaiting**. All caching strategies and architectural decisions are technically sound.