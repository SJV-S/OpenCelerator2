# PWA Server Communication & Uptime Sensitivity

## What the Server Is Used For

### 1. Multi-Device Sync (`POST /api/sync`)
The main server dependency. Client sends a local manifest (chart UUIDs + timestamps), server returns only newer charts. All chart data is **end-to-end encrypted** (AES-256-GCM) — the server stores opaque blobs it cannot decrypt. Pushes are ECDSA-signed by the client.

### 2. Shared Charts (Real-Time Collaboration)
- **WebSocket** (Socket.IO) via `startSyncWatch()` — lightweight notifications only (`{chart_uuid, updated_at}`), not the actual data.
- Actual chart data fetched over HTTP from `GET /api/chart/<uuid>/shared`.
- `GET /api/chart/<uuid>/poll` exists only as a WebSocket reconnect fallback.

### 3. Share Link Creation (`POST /api/share/edit`)
Stores the chart + a wrapped decryption key on the server so a URL can be shared with others. Server can't decrypt (share secret is in the URL fragment, never sent to server).

### 4. Account/Identity Transfer (`POST /api/account-link`, `GET /api/account-link/<id>`)
One-time encrypted identity blobs for moving a BIP39 passphrase to another device. 15-minute TTL. Server stores only opaque AES-256-GCM ciphertext.

### 5. Subscription Verification (`GET /api/subscription/status`)
Returns `{paid_until: timestamp|null}`. Gated by `requires_subscription` decorator on API routes. Client caches `paid_until` in IndexedDB so it doesn't need to check constantly.

### 6. Health Ping (`GET /api/health`)
Silent 204 response every ~10 seconds. Drives the online/offline status indicator. Rate-limit exempt.

---

## What Does NOT Need the Server

Almost everything. The core app is offline-first:

- **Create, edit, delete charts** — all stored in IndexedDB (`SCC_Charts` database)
- **Draw lines** (phase, aim, cut, celeration) — local state
- **Enter data points** — local state
- **Export** (JSON, Excel) — client-side libraries (xlsx is precached)
- **All UI** — navigation, modals, settings, chart type switching
- **Chart rendering** — Plotly.js is precached
- **QR code generation** — precached library
- **Identity/key management** — BIP39 passphrase and ECDSA keys derived and stored in IndexedDB (`SCC_Identity`)

---

## How Sensitive Is It to Uptime?

### Not sensitive at all: Solo use
A single user on one device never needs the server. Charts live entirely in IndexedDB. The service worker precaches the HTML shell (`/`, `/new`, `/chart/_shell`) plus all 50+ static assets. Even if the server disappears permanently, existing users keep working.

### Low sensitivity: Multi-device sync (non-shared)
Failed pushes are queued in `localStorage` (`syncPushQueue`) and drained on next successful connection. There's no data loss from downtime — just a delay in propagation. The sync is **pull-on-load** (menu page or chart page), not background polling.

### Moderate sensitivity: Shared charts (collaboration)
This is the most server-dependent feature. WebSocket notifications drive real-time updates. If the server goes down:
- The local copy remains fully functional and editable
- Changes queue up and push when reconnected
- Other collaborators won't see updates until the server returns
- Reconnect logic has exponential backoff (1s → 30s max)

### Momentary sensitivity: Share link creation & account transfer
These are one-shot operations that need the server at the moment they happen. But they're infrequent actions — if the server is briefly down, the user just retries later.

### Negligible: Subscription checks
`paid_until` is cached in IndexedDB. The client checks non-blockingly on load. Even if the server is unreachable, the cached value gates features locally.

---

## The Service Worker Strategy

Currently `DEVELOPER_MODE=true` which **bypasses all caching**. When disabled:

| Request type | Strategy |
|---|---|
| HTML navigation | Network-first, 3s timeout, then cache, then `/chart/_shell` fallback |
| Static assets (`/static/*`) | Cache-first, network fallback |
| API calls | Network only (never cached) |

Precache includes all HTML shells, all JS modules, CSS, fonts, and third-party libraries — so the app can boot fully offline from cache.

---

## Server Endpoints Summary

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/sync` | POST | Bi-directional chart sync (manifest comparison, upload/download) |
| `/api/chart/<uuid>/shared` | GET | Fetch encrypted shared chart data |
| `/api/chart/<uuid>/poll` | GET | Lightweight update check (WebSocket reconnect fallback) |
| `/api/chart` | DELETE | Owner deletes chart, creates tombstone |
| `/api/chart/leave` | DELETE | Collaborator removes own access |
| `/api/share/edit` | POST | Create share link with wrapped keys |
| `/api/account-link` | POST | Create encrypted identity transfer link |
| `/api/account-link/<id>` | GET | Retrieve encrypted identity blob |
| `/api/subscription/status` | GET | Check subscription status |
| `/api/health` | GET | Health ping (204, rate-limit exempt) |

---

**Bottom line:** This is a genuinely offline-first PWA. The server is a convenience layer for sync and sharing, not a dependency for core functionality. Solo users are completely insulated from downtime. Multi-device users experience delayed sync but no data loss. Only real-time collaboration degrades meaningfully during an outage, and even then the local experience is unaffected.
