http://127.0.0.1:5002/chart/22b4b1e5-f35d-4f4b-b4d2-6311f65be3bc// Minimal service worker for PWA install capability
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

// fetch handler will be added in Phase 2 when caching is implemented
