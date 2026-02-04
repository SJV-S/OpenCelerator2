// Minimal service worker for PWA install capability
// Phase 1: Install experience only - no caching

const SW_VERSION = '1.0.0';

self.addEventListener('install', (event) => {
    console.log(`[SW ${SW_VERSION}] Installing...`);
    // Skip waiting to activate immediately
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log(`[SW ${SW_VERSION}] Activated`);
    // Claim all clients immediately
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Pass through all requests to the network (no caching yet)
    // This is intentionally minimal - caching will be added in Phase 2
});
