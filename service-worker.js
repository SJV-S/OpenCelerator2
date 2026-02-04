// Service Worker for SCC PWA
// Phase 2: Caching for offline support
//
// DEVELOPMENT NOTE: Verbose console logging is intentional for debugging.
// These logs use [SW] prefix for filtering. Remove or reduce logging in production.

const SW_VERSION = '2.1.0';
const CACHE_NAME = `scc-cache-v${SW_VERSION}`;

// HTML pages to precache
const PRECACHE_PAGES = [
    '/',
    '/new',
];

// Static assets to precache (all JS, CSS, icons)
const PRECACHE_STATIC = [
    '/static/manifest.json',
    // Icons
    '/static/SCC/icons/icon-192.png',
    '/static/SCC/icons/icon-512.png',
    '/static/SCC/icons/celeration.svg',
    // CSS
    '/static/SCC/css/chart_menu.css',
    // Core modules
    '/static/SCC/main.js',
    '/static/SCC/chartState.js',
    '/static/SCC/config.js',
    '/static/SCC/debug.js',
    '/static/SCC/eventBus.js',
    '/static/SCC/navigation.js',
    '/static/SCC/pwaInstall.js',
    // Libraries
    '/static/SCC/lib/idb.js',
    '/static/SCC/lib/xlsx.full.min.js',
    // Storage
    '/static/SCC/storage/chartStorage.js',
    // Series
    '/static/SCC/series/dataEntry.js',
    '/static/SCC/series/dataUpdate.js',
    '/static/SCC/series/miscSeries.js',
    '/static/SCC/series/replot.js',
    '/static/SCC/series/tracePipeline.js',
    '/static/SCC/series/traceStyles.js',
    // Lines
    '/static/SCC/lines/aimLines.js',
    '/static/SCC/lines/allLines.js',
    '/static/SCC/lines/celLine.js',
    '/static/SCC/lines/cutLines.js',
    '/static/SCC/lines/lineClickHandler.js',
    '/static/SCC/lines/phaseLines.js',
    // UI
    '/static/SCC/ui/crosshair.js',
    '/static/SCC/ui/icons.js',
    '/static/SCC/ui/startDateControls.js',
    '/static/SCC/ui/startDateModal.js',
    '/static/SCC/ui/toaster.js',
    '/static/SCC/ui/tooltip.js',
    // Util
    '/static/SCC/util/agg.js',
    '/static/SCC/util/chartLayouts.js',
    '/static/SCC/util/dates.js',
    '/static/SCC/util/fit_lines.js',
    '/static/SCC/util/format.js',
    '/static/SCC/util/panning_controls.js',
    '/static/SCC/util/plotlyWrapper.js',
    '/static/SCC/util/resize-chart.js',
    // Import
    '/static/SCC/import/dataImport.js',
    '/static/SCC/import/importUI.js',
    '/static/SCC/import/jsonBackwardsCompatibility.js',
    '/static/SCC/import/openCeleratorImport.js',
    // Misc
    '/static/SCC/misc/celerationFan.js',
    '/static/SCC/misc/credit.js',
    '/static/SCC/misc/customLegend.js',
    '/static/SCC/misc/grid.js',
    '/static/SCC/misc/share.js',
    // Temp
    '/static/SCC/temp/hover_mode.js',
    // Temp icons
    '/static/SCC/temp/icons/camera-solid-full.svg',
    '/static/SCC/temp/icons/celeration.svg',
    '/static/SCC/temp/icons/crosshairs-solid-full.svg',
    '/static/SCC/temp/icons/flag-solid-full.svg',
    '/static/SCC/temp/icons/gear-solid-full.svg',
    '/static/SCC/temp/icons/images-solid-full.svg',
    '/static/SCC/temp/icons/phase_text_bottom.svg',
    '/static/SCC/temp/icons/phase_text_top.svg',
    '/static/SCC/temp/icons/scissors-solid-full.svg',
    '/static/SCC/temp/icons/trash-solid-full.svg',
    // Server sync
    '/static/Server/BIP39Words.js',
    '/static/Server/crypto.js',
    '/static/Server/init.js',
    '/static/Server/passphrase.js',
    '/static/Server/syncClient.js',
];

// CDN URLs to precache (fetched separately to handle cross-origin)
const PRECACHE_CDN = [
    'https://cdn.tailwindcss.com',
    'https://cdn.plot.ly/plotly-2.35.2.min.js',
    'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap',
];

// Check if URL is a CDN we want to cache
function isCachableCDN(url) {
    return url.startsWith('https://cdn.') ||
           url.startsWith('https://fonts.googleapis.com') ||
           url.startsWith('https://fonts.gstatic.com');
}

// Check if URL is a local static asset
function isStaticAsset(url) {
    const path = new URL(url).pathname;
    return path.startsWith('/static/');
}

// Check if request is for an HTML page (navigation)
function isNavigationRequest(request) {
    return request.mode === 'navigate';
}

// Check if URL is a chart page (dynamic route)
function isChartPage(url) {
    const path = new URL(url).pathname;
    return path.startsWith('/chart/');
}

self.addEventListener('install', (event) => {
    console.log(`[SW ${SW_VERSION}] Installing...`);

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async (cache) => {
                // Precache local pages
                console.log(`[SW ${SW_VERSION}] Precaching ${PRECACHE_PAGES.length} pages...`);
                await cache.addAll(PRECACHE_PAGES);

                // Precache local static assets
                console.log(`[SW ${SW_VERSION}] Precaching ${PRECACHE_STATIC.length} static assets...`);
                await cache.addAll(PRECACHE_STATIC);

                // Precache CDN resources (fetch individually to handle failures gracefully)
                console.log(`[SW ${SW_VERSION}] Precaching ${PRECACHE_CDN.length} CDN resources...`);
                for (const url of PRECACHE_CDN) {
                    try {
                        const response = await fetch(url, { mode: 'cors' });
                        if (response.ok) {
                            await cache.put(url, response);
                            console.log(`[SW ${SW_VERSION}] CDN cached: ${url.substring(0, 60)}...`);
                        } else {
                            console.warn(`[SW ${SW_VERSION}] CDN fetch not ok: ${url}`);
                        }
                    } catch (err) {
                        console.warn(`[SW ${SW_VERSION}] CDN fetch failed (will retry on use): ${url}`, err.message);
                    }
                }

                console.log(`[SW ${SW_VERSION}] Precache complete`);
            })
            .then(() => self.skipWaiting())
            .catch(err => {
                console.error(`[SW ${SW_VERSION}] Precache failed:`, err);
            })
    );
});

self.addEventListener('activate', (event) => {
    console.log(`[SW ${SW_VERSION}] Activating...`);

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                // Delete old caches
                const deletePromises = cacheNames
                    .filter(name => name.startsWith('scc-cache-') && name !== CACHE_NAME)
                    .map(name => {
                        console.log(`[SW ${SW_VERSION}] Deleting old cache: ${name}`);
                        return caches.delete(name);
                    });
                return Promise.all(deletePromises);
            })
            .then(() => {
                console.log(`[SW ${SW_VERSION}] Claiming clients`);
                return self.clients.claim();
            })
    );
});

self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    const request = event.request;

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip chrome-extension and other non-http(s) requests
    if (!url.startsWith('http')) {
        return;
    }

    // Strategy: Navigation requests (HTML pages) - Network first, cache fallback
    if (isNavigationRequest(request)) {
        event.respondWith(networkFirstWithCache(request, 'navigation'));
        return;
    }

    // Strategy: CDN resources - Cache first, network fallback
    if (isCachableCDN(url)) {
        event.respondWith(cacheFirstWithNetwork(request, 'cdn'));
        return;
    }

    // Strategy: Static assets - Cache first, network fallback
    if (isStaticAsset(url)) {
        event.respondWith(cacheFirstWithNetwork(request, 'static'));
        return;
    }

    // All other requests - Network only (API calls, etc.)
    // Don't cache these
});

// Network first, fall back to cache (for HTML pages)
async function networkFirstWithCache(request, type) {
    const url = new URL(request.url).pathname;
    console.log(`[SW ${SW_VERSION}] ${type.toUpperCase()} fetch: ${url}`);

    try {
        const networkResponse = await fetchWithTimeout(request, 3000);

        if (networkResponse.ok) {
            console.log(`[SW ${SW_VERSION}] ${type.toUpperCase()} from network: ${url}`);

            // Cache the response for offline use
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());

            return networkResponse;
        }

        throw new Error(`Network response not ok: ${networkResponse.status}`);
    } catch (err) {
        console.log(`[SW ${SW_VERSION}] ${type.toUpperCase()} network failed, trying cache: ${url}`);

        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log(`[SW ${SW_VERSION}] ${type.toUpperCase()} from cache: ${url}`);
            return cachedResponse;
        }

        // For chart pages, try to return the cached root as fallback
        // The app will handle loading the specific chart from IndexedDB
        if (isChartPage(request.url)) {
            const fallback = await caches.match('/');
            if (fallback) {
                console.log(`[SW ${SW_VERSION}] ${type.toUpperCase()} fallback to cached /: ${url}`);
                return fallback;
            }
        }

        console.error(`[SW ${SW_VERSION}] ${type.toUpperCase()} no cache available: ${url}`);
        throw err;
    }
}

// Cache first, fall back to network (for static assets and CDN)
async function cacheFirstWithNetwork(request, type) {
    const url = request.url;
    const shortUrl = url.length > 80 ? url.substring(0, 80) + '...' : url;

    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        console.log(`[SW ${SW_VERSION}] ${type.toUpperCase()} from cache: ${shortUrl}`);
        return cachedResponse;
    }

    console.log(`[SW ${SW_VERSION}] ${type.toUpperCase()} fetching: ${shortUrl}`);

    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            console.log(`[SW ${SW_VERSION}] ${type.toUpperCase()} caching: ${shortUrl}`);
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (err) {
        console.error(`[SW ${SW_VERSION}] ${type.toUpperCase()} fetch failed: ${shortUrl}`, err);
        throw err;
    }
}

// Fetch with timeout
function fetchWithTimeout(request, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error('Network timeout'));
        }, timeoutMs);

        fetch(request)
            .then(response => {
                clearTimeout(timeoutId);
                resolve(response);
            })
            .catch(err => {
                clearTimeout(timeoutId);
                reject(err);
            });
    });
}
