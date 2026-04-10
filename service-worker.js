// Service Worker for SCC PWA
// Phase 2: Caching for offline support
//
// DEVELOPMENT NOTE: Verbose console logging is intentional for debugging.
// These logs use [SW] prefix for filtering. Remove or reduce logging in production.

// Set to true during development to always fetch fresh (bypasses cache)
const DEVELOPER_MODE = true;

const SW_VERSION = '0.4.16';
const CACHE_NAME = `scc-cache-v${SW_VERSION}`;

// HTML pages to precache
const PRECACHE_PAGES = [
    '/',
    '/new',
    '/chart/_shell',
];

// Static assets to precache (all JS, CSS, icons)
const PRECACHE_STATIC = [
    '/static/manifest.json',
    '/static/favicon.ico',
    // Icons
    '/static/SCC/icons/icon-192.png',
    '/static/SCC/icons/icon-512.png',
    '/static/SCC/icons/celeration.svg',
    // Images
    '/static/SCC/images/PayPal_icon.png',
    '/static/SCC/images/bitcoin_logo.png',
    // CSS
    '/static/SCC/css/chart_menu.css',
    '/static/SCC/css/tailwind.css',
    '/static/SCC/css/fonts.css',
    '/static/SCC/fonts/open-sans-latin.woff2',
    '/static/SCC/fonts/open-sans-latin-ext.woff2',
    // Core modules
    '/static/SCC/main.js',
    '/static/SCC/chartExplorer.js',
    '/static/SCC/chartPage.js',
    '/static/SCC/chartState.js',
    '/static/SCC/config.js',
    '/static/SCC/debug.js',
    '/static/SCC/eventBus.js',
    '/static/SCC/navigation.js',
    '/static/SCC/newChartFlow.js',
    '/static/SCC/pageFade.js',
    '/static/SCC/pwaInstall.js',
    '/static/SCC/welcomeFlow.js',
    // Libraries
    '/static/lib/qrcode-generator.min.js',
    '/static/lib/idb.js',
    '/static/lib/plotly-2.35.2.min.js',
    '/static/lib/socket.io-4.7.4.min.js',
    '/static/lib/xlsx.full.min.js',
    // Storage
    '/static/SCC/storage/backupStorage.js',
    '/static/SCC/storage/chartStorage.js',
    '/static/SCC/storage/compactJson.js',
    '/static/SCC/storage/passphrase.js',
    // Series
    '/static/SCC/series/dataEntry.js',
    '/static/SCC/series/dataUpdate.js',
    '/static/SCC/series/grid.js',
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
    '/static/SCC/lines/lineHover.js',
    '/static/SCC/lines/phaseLines.js',
    // UI
    '/static/SCC/ui/aimLineEditor.js',
    '/static/SCC/ui/celLineEditor.js',
    '/static/SCC/ui/celSettingsModal.js',
    '/static/SCC/ui/celerationFan.js',
    '/static/SCC/ui/credit.js',
    '/static/SCC/ui/donateModal.js',
    '/static/SCC/ui/crosshair.js',
    '/static/SCC/ui/customLegend.js',
    '/static/SCC/ui/icons.js',
    '/static/SCC/ui/lineEditorFactory.js',
    '/static/SCC/ui/lineSettingsModal.js',
    '/static/SCC/ui/modalHelpers.js',
    '/static/SCC/ui/panSlider.js',
    '/static/SCC/ui/phaseLineEditor.js',
    '/static/SCC/ui/resetSettings.js',
    '/static/SCC/ui/settingsModal.js',
    '/static/SCC/ui/share.js',
    '/static/SCC/ui/startDateModal.js',
    '/static/SCC/ui/toaster.js',
    '/static/SCC/ui/tooltip.js',
    // Util
    '/static/SCC/util/agg.js',
    '/static/SCC/util/BIP39Words.js',
    '/static/SCC/util/chartLayouts.js',
    '/static/SCC/util/dates.js',
    '/static/SCC/util/dom.js',
    '/static/SCC/util/download.js',
    '/static/SCC/util/fit_lines.js',
    '/static/SCC/util/format.js',
    '/static/SCC/util/lineInterpolation.js',
    '/static/SCC/util/panning_controls.js',
    '/static/SCC/util/plotCoordinates.js',
    '/static/SCC/util/plotlyWrapper.js',
    '/static/SCC/util/resize-chart.js',
    // Import
    '/static/SCC/import/chartImport.js',
    '/static/SCC/import/dataImport.js',
    '/static/SCC/import/importUI.js',
    '/static/SCC/import/jsonBackwardsCompatibility.js',
    '/static/SCC/import/nativeImport.js',
    '/static/SCC/import/openCeleratorImport.js',
    // Server sync
    '/static/Server/accountLink.js',
    '/static/Server/client-api.js',
    '/static/Server/compress.js',
    '/static/Server/crypto.js',
    '/static/Server/init.js',
    '/static/Server/onlineStatus.js',
    '/static/Server/syncClient.js',
    '/static/Server/syncDevice.js',
    '/static/Server/syncLinkFlow.js',
    '/static/Server/wsClient.js',
];

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
    console.log(`[SW ${SW_VERSION}] Installing`);

    // Bypass browser HTTP cache so precache always gets fresh files from server
    const fresh = { cache: 'reload' };
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async (cache) => {
                await cache.addAll(PRECACHE_PAGES.map(url => new Request(url, fresh)));
                await cache.addAll(PRECACHE_STATIC.map(url => new Request(url, fresh)));
            })
    );
});

// On-demand skipWaiting — triggered by the page when it detects a waiting SW
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', (event) => {
    console.log(`[SW ${SW_VERSION}] Activated`);

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                // Delete old caches
                const deletePromises = cacheNames
                    .filter(name => name.startsWith('scc-cache-') && name !== CACHE_NAME)
                    .map(name => caches.delete(name));
                return Promise.all(deletePromises);
            })
            .then(() => self.clients.claim())
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

    // Developer mode: bypass all caching, always fetch fresh
    if (DEVELOPER_MODE) {
        return;
    }

    // Strategy: Navigation requests (HTML pages) - Network first, cache fallback
    if (isNavigationRequest(request)) {
        event.respondWith(networkFirstWithCache(request));
        return;
    }

    // Strategy: Static assets - Cache first, network fallback
    if (isStaticAsset(url)) {
        event.respondWith(cacheFirstWithNetwork(request));
        return;
    }

    // All other requests - Network only (API calls, etc.)
    // Don't cache these
});

// Network first, fall back to cache (for HTML pages)
async function networkFirstWithCache(request) {
    try {
        const networkResponse = await fetchWithTimeout(request, 3000);

        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
            return networkResponse;
        }

        throw new Error(`Network response not ok: ${networkResponse.status}`);
    } catch (err) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // For chart pages, serve the precached shell (template is identical for all charts)
        if (isChartPage(request.url)) {
            const shellResponse = await caches.match(new URL('/chart/_shell', self.location.origin).href);
            if (shellResponse) {
                return shellResponse;
            }
        }

        throw err;
    }
}

// Cache first, fall back to network (for static assets)
async function cacheFirstWithNetwork(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (err) {
        console.error(`[SW ${SW_VERSION}] Fetch failed: ${request.url.substring(0, 60)}...`, err);
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
