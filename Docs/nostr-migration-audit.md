# Nostr Migration Codebase Audit

Full audit of the current Flask-based sync/sharing/identity system, mapping every component that must change for the Nostr relay migration.

---

## IDENTITY & KEYS

### 1. Key Derivation Path (BIP39 → ECDSA)

The derivation from BIP39 mnemonic to ECDSA signing key is in `static/Server/crypto.js`:

1. **Line 157-159**: Import passphrase as PBKDF2 key material with `'deriveBits'` usage
2. **Line 162-165**: Derive 32 bytes via PBKDF2 with salt `'ecdsa-signing'`, 100,000 iterations, SHA-256
3. **Line 168-172**: Validate derived bytes as valid scalar (must be in range `[1, n-1]`); rehash if out of range (~2^-32 probability)
4. **Line 175**: Compute public point `Q = d * G` via custom BigInt point multiplication (lines 115-124, `scalarMul`)
5. **Line 178**: Build 138-byte PKCS8 DER structure (lines 138-153, `buildPkcs8P256`)
6. **Line 179-181**: Import PKCS8 as CryptoKey with `'sign'` usage
7. **Line 184-188**: Extract public key via JWK round-trip, re-import for `'verify'` usage

**Curve: P-256 (secp256r1), NOT secp256k1.** Nostr uses secp256k1 (BIP-340 Schnorr). The derivation path and curve must change.

Constants at `crypto.js:78-86`:
```javascript
const ECDSA_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' };
```

### 2. IndexedDB Schema (SCC_Identity)

Database `SCC_Identity`, version 1, object store `credentials` (key-value store). Created at `static/Server/init.js:57-59`.

| Key | Value | File | Line(s) |
|-----|-------|------|---------|
| `'passphrase'` | BIP39 mnemonic string (12 words) | `init.js` | 63 |
| `'publicKey'` | Base64-encoded SPKI public key | `init.js` | 88-91 |
| `'display_name'` | Human-readable username | `init.js` | 82 |
| `'user_preferences'` | `{ syncAllChartsToServer: boolean }` | `init.js` | 74-78 |
| `'paid_until'` | Unix timestamp (subscription expiry) | `init.js` | 38, 100 |

The **private key is NOT stored** — it's derived on every page load from the passphrase (`init.js:85`). The private CryptoKey is held only in memory (`syncClient.js:21`: `let signingPrivateKey = null`).

### 3. Server Public Key / Server-Issued Token Usage

**The server does NOT verify signatures at all.** Verification is 100% client-side.

- `models.py:22`: `signature = db.Column(db.LargeBinary, nullable=True)` — server stores but never validates
- `app.py:202,212,219,362,369,371` — server accepts and stores signatures as-is
- `syncClient.js:58-96` (`verifyPull`) — all verification is client-side
- No server public key, no server certificates, no bearer tokens, no JWT

The `X-User-Id` header (`client-api.js:43`) is metadata only, not authentication. It can be spoofed.

### 4. BIP39 Mnemonic Storage

Stored in **two** places:

| Location | Persistence | File | Lines |
|----------|-------------|------|-------|
| IndexedDB `SCC_Identity` store, key `'passphrase'` | Persistent, **unencrypted** | `init.js` | 63 (read), `welcome.html` 227/343 (write) |
| Backup JSON file (user-downloaded) | User-controlled | `backupStorage.js` | 28 (exported) |

The passphrase is **never encrypted at rest** in IndexedDB. It is also accessed by: `syncDevice.js:16-22` (`getStoredPassphrase`), `settingsModal.js:166,173` (account link creation), `backupStorage.js:69` (backup restore).

---

## ENCRYPTION

### 5. Encryption Flow (Plaintext to Encrypted Payload)

Complete call chain:

```
chartState
  -> serializeChart(chartId, chartState)          [chartStorage.js:128]
  -> compactChart(serialized)                     [compactJson.js:19-49]
  -> getChartFromIndexedDB(chartUuid)             [syncClient.js:275]
  -> fromHex(chart.chartKey) -> importKey()       [syncClient.js:281-282]
  -> stampOwnerFields(chart)                      [syncClient.js:285, defined 127-133]
  -> encrypt(chartKey, chart)                     [crypto.js:33-41]
      |-- generate 12-byte IV
      |-- JSON.stringify(chart)
      |-- crypto.subtle.encrypt(AES-GCM) -> appends 16-byte auth tag
      \-- combine [IV | ciphertext] -> hex string
  -> signPayload(encryptedData)                   [syncClient.js:288, crypto.js:193-198]
      \-- ECDSA-P256 sign the hex string
  -> wrapKey(chartKey, userKey)                   [syncClient.js:289, crypto.js:56-63]
      |-- generate 12-byte IV
      |-- crypto.subtle.wrapKey(AES-GCM)
      \-- combine [IV | wrapped key | tag] -> hex string (120 chars)
  -> POST /api/sync { data, wrapped_key, signature }  [syncClient.js:291-304]
```

### 6. AES-256-GCM Key Source

**Two-tier key scheme:**

- **User master key (userKey)**: DERIVED from BIP39 passphrase via PBKDF2 (`passphrase.js:25-27` -> `crypto.js:20-31`). Salt = `SHA-256(passphrase)`, 100,000 iterations, SHA-256. Held in memory only (`syncClient.js:18`: `let userKey = null`).
- **Per-chart key (chartKey)**: RANDOMLY GENERATED independently via `crypto.subtle.generateKey()` (`crypto.js:52-54`). Stored in IndexedDB as hex string in `chart.chartKey` field. **Not encrypted at rest.**

The userKey wraps/unwraps per-chart keys. Chart keys are independent of the passphrase.

### 7. Encrypted Chart Blob Size

**Server upload limit**: 16 MB (`config.py:60`: `MAX_CONTENT_LENGTH = 16 * 1024 * 1024`)

| Metric | Value |
|--------|-------|
| Typical chart (100 data points) | 50-150 KB plaintext, 100-300 KB encrypted hex |
| Large chart (280 points, all series, all lines) | 500 KB-1 MB plaintext, 1-2 MB encrypted hex |
| Theoretical max per chart | ~8 MB plaintext (limited by 16 MB request + hex doubling) |
| Hex encoding overhead | 2x (all crypto outputs are hex-encoded in JSON) |
| Per-blob crypto overhead | 28 bytes (12-byte IV + 16-byte auth tag) |

**Nostr implication**: Most Nostr relays limit events to 64 KB-1 MB. Typical charts (100-300 KB hex) may exceed common relay limits. Hex encoding doubles size unnecessarily — base64 or binary would help.

### 8. Shared Chart Key Wrapping

Two wrapped keys are created per shared chart in `_createShareLink()` (`syncClient.js:358-399`):

1. **For owner**: `wrapKey(chartKey, userKey)` -> stored in `ChartAccess.wrapped_key`
2. **For share recipient**: `wrapKey(chartKey, shareKey)` -> stored in `ShareLink.wrapped_key`

Where `shareKey = PBKDF2(shareSecret, chartUuid)` and `shareSecret` is 32 random bytes (64 hex chars) embedded in the share URL, **never sent to the server**.

**Wrapping scheme**: AES-256-GCM via `crypto.subtle.wrapKey('raw', ...)` (`crypto.js:56-63`). Output format: `[12-byte IV | 32-byte encrypted key | 16-byte auth tag]` = 60 bytes -> 120 hex chars.

---

## SYNC

### 9. Full Sync Flow from Page Load

**Chart Explorer page (`/`):**

1. `initServerSync()` (`init.js:52-115`) — reads passphrase/prefs/display_name/publicKey from IndexedDB, derives ECDSA keypair, calls `initSync()` (`syncClient.js:26-34`), emits `SYNC_READY`
2. `initStorage()` (`chartStorage.js:91-112`) — opens `SCC_Charts` IndexedDB, subscribes to `SYNC_READY`
3. `drainPushQueue()` (`chartStorage.js:468-487`) — triggered by `SYNC_READY`, retries queued pushes from `localStorage.syncPushQueue`
4. `checkForUpdates()` (`syncClient.js:214-229`) — POST `/api/sync` with local manifest, processes downloads

**Chart page (`/chart/:id`):**

1. Same init as above
2. If share URL: `joinSharedChart(chartId, shareSecret)` (`syncClient.js:425-455`) — GET `/api/chart/{uuid}/shared`, derive shareKey, unwrap chartKey, decrypt, verify, store to IDB
3. `loadChart(chartId)` (`chartStorage.js:146-177`) — read from IDB, run migrations, populate chartState
4. `startSyncWatch(chartId)` (`syncClient.js:507-521`) — for shared charts: opens WebSocket via `connectToChart()`. For sync-enabled: `checkForUpdates()` via HTTP

### 10. Local Manifest Format

**Request** (POST `/api/sync`):
```json
{
  "user_id": "sha256hex...",
  "last_sync_at": 1706100000,
  "local_manifest": [
    {"chart_uuid": "uuid-...", "updated_at": 1706100500}
  ],
  "uploads": [
    {
      "chart_uuid": "...",
      "data": "hex...",
      "updated_at": 1706100600,
      "wrapped_key": "hex...",
      "signature": "hex..."
    }
  ]
}
```

**Response**:
```json
{
  "server_manifest": [
    {"chart_uuid": "...", "updated_at": 1706100500}
  ],
  "downloads": [
    {
      "chart_uuid": "...",
      "data": "hex...",
      "updated_at": 1706100600,
      "wrapped_key": "hex...",
      "signature": "hex..."
    }
  ],
  "tombstones": [
    {"chart_uuid": "...", "deleted_at": 1706098000}
  ]
}
```

Server builds downloads where `chart.last_modified > local_updated` (`app.py:260-261`).

### 11. Version Comparison

**Purely timestamp-based.** No version counters or vector clocks.

- Server: `if updated_at > existing.last_modified:` — last-write-wins (`app.py:209`)
- Server clamps timestamps: `min(upload['updated_at'], int(time.time()) + 300)` — max 5 min future (`app.py:201`)
- Client replay protection in `verifyPull()` (`syncClient.js:91-93`): rejects if `remote.lastModified < local.lastModified`

### 12. syncPushQueue

**Location**: `localStorage` key `'syncPushQueue'` (`chartStorage.js:49`), stored as JSON array of chart UUIDs.

**Functions:**
- `queuePush(chartId)` (`chartStorage.js:456-466`) — adds to queue on push failure
- `drainPushQueue()` (`chartStorage.js:468-487`) — iterates queue, retries each, keeps failures

**Drain triggers:**
1. `SYNC_READY` event (every page load) — `chartStorage.js:499`
2. After successful `pushChart()` — chains `drainPushQueue()` (`chartStorage.js:425`)
3. `SYNC_SERVER_RECONNECTED` event — subscribed (`chartStorage.js:500`) but **never emitted** in current codebase

**On repeated failure**: Stays in queue indefinitely. No exponential backoff, no max retry limit. Console warning only, no UI notification.

### 13. Server-Side Merge Logic

**Strictly last-write-wins.** No merge, no conflict resolution, no OT. The server cannot read encrypted data to merge it. `app.py:209-212`: if `updated_at > existing.last_modified`, replace entire blob atomically.

---

## REAL-TIME / WEBSOCKET

### 14. WebSocket Lifecycle

All in `static/Server/wsClient.js`:

| Phase | Line(s) | Handler | Action |
|-------|---------|---------|--------|
| Create socket | 28-34 | `connectToChart()` | `io()` with config: websocket+polling, reconnect=true, delay 1s-30s, infinite attempts |
| Connect | 36-39 | `socket.on('connect')` | Emit `join_chart` with `{chart_uuid, user_id}` |
| Server join | `app.py:512-526` | `@socketio.on('join_chart')` | Validate subscription, `join_room(f'chart:{uuid}')` |
| Notification | 41-49 | `socket.on('chart_updated')` | Validate UUID match, call `onChartUpdated` callback |
| Reconnect | 51-58 | `socket.on('reconnect')` | Re-emit `join_chart`, force catch-up with `updatedAt: null` |
| Disconnect | 60-62 | `socket.on('disconnect')` | Log reason |
| Error | 64-66 | `socket.on('connect_error')` | Log error, Socket.IO auto-retries |
| Tab visible | 72-84 | `onVisibilityChange()` | If disconnected: `socket.connect()`. If connected: catch-up check |
| Manual disconnect | 89-101 | `disconnectFromChart()` | Emit `leave_chart`, `socket.disconnect()`, cleanup |

### 15. WebSocket Notification Payload

```json
{"chart_uuid": "uuid-string", "updated_at": 1707843600}
```

Emitted from `app.py:240-242` after processing uploads in POST `/api/sync`. Just UUID + timestamp — no chart data, no signature.

### 16. Chart Fetch After WebSocket Notification

The callback triggers `syncChart(chartId, updatedAt)` (`syncClient.js:457-505`):

1. If `updatedAt` is provided (from WS) and `<= local.lastModified` -> skip
2. If `updatedAt === null` (reconnect) -> call poll endpoint `GET /api/chart/{id}/poll?t={timestamp}` first
3. Fetch full chart via `GET /api/chart/{id}/shared` (`syncClient.js:478`)
4. Decrypt, verify signature, store to IDB, emit `SYNC_CHART_UPDATED`

### 17. Reconnection/Backoff

Delegated entirely to Socket.IO library with this config (`wsClient.js:28-34`):

- `reconnectionDelay: 1000` (1s initial)
- `reconnectionDelayMax: 30000` (30s cap)
- `reconnectionAttempts: Infinity`
- Exponential backoff with jitter (Socket.IO default ~1.2x multiplier)

Additional: `visibilitychange` listener (`wsClient.js:72-84`) triggers immediate reconnect when tab becomes visible.

No custom backoff code — all handled by Socket.IO internals.

---

## SHARING

### 18. Share Link Creation Flow

1. UI click: `share-view-btn` or `share-edit-btn` (`templates/SCC/menu/share_tab.html:21-34`)
2. Handler: `handleShareLinkClick(type)` (`ui/share.js:196-250`)
3. Calls `_createShareLink(chartUuid, acceptingEdits)` (`syncClient.js:358-399`):
   - Generate 32-byte random `shareSecret` (line 370-371)
   - Derive `shareKey = PBKDF2(shareSecret, chartUuid)` (line 372)
   - Set `chart.acceptingEdits` flag inside encrypted data (line 367)
   - Stamp owner fields (publicKey, ownerName) inside encrypted data (line 368)
   - Encrypt chart with chartKey (line 375)
   - Sign with ECDSA (line 376)
   - Wrap chartKey twice: once with userKey, once with shareKey (lines 377-378)
4. POST `/api/share/edit` (line 380) with `{chart_uuid, user_id, data, wrapped_key, wrapped_key_for_share, last_modified, signature}`
5. Server stores: `Chart` record (encrypted data), `ChartAccess` (owner's wrapped key), `ShareLink` (share wrapped key) — `app.py:339-390`
6. Returns URL: `https://host/chart/{chartUuid}/{shareSecret}` (line 398)

**Stored on server**: encrypted blob, both wrapped keys, timestamp. **In URL only**: shareSecret (never sent to server).

### 19. Share Link Consumption Flow

1. `chartPage.js:20-22`: Parse URL -> extract `chartId` and `shareSecret`
2. `joinSharedChart(chartId, shareSecret)` (`syncClient.js:425-455`):
   - GET `/api/chart/{chartUuid}/shared` (line 426) -> returns `{data, wrapped_key, updated_at, signature}`
   - Server checks ShareLink TTL: 14 days (`config.py:34`, `app.py:422`)
   - `deriveKey(shareSecret, chartUuid)` -> shareKey (line 433)
   - `unwrapKey(wrapped_key, shareKey)` -> chartKey (line 434)
   - `decrypt(chartKey, data)` -> chart JSON (line 438)
   - `verifyPull()` — signature check (line 441)
   - Store to IDB with `shared: true` and `chartKey` (lines 446-452)
3. `window.history.replaceState()` strips shareSecret from URL (`chartPage.js:31`)
4. Opens WebSocket for real-time updates

### 20. Author Updates After Sharing

**Yes.** Author edits trigger auto-save -> `pushChart()` -> POST `/api/sync` -> server updates Chart record -> `socketio.emit('chart_updated', ...)` to room (`app.py:238-243`) -> recipient's WebSocket receives notification -> `syncChart()` fetches + decrypts updated chart -> replot.

For **view-only** links (`acceptingEdits: false`): recipient verifies signature against owner's public key. For **edit** links (`acceptingEdits: true`): signature verification is skipped, recipient can push edits too.

### 21. Revocation Mechanism

**No explicit revoke endpoint.** Revocation happens via:

1. **TTL expiration**: ShareLinks expire after 14 days (`config.py:34`), enforced server-side (`app.py:422-430`)
2. **Chart deletion**: `DELETE /api/chart` (`app.py:282-311`) cascades to delete ShareLink records (`models.py:26`: `cascade='all, delete-orphan'`)
3. **Unshare**: `unshareChart()` (`ui/share.js:289-314`) creates a new private chart with new UUID/key, calls `syncLeaveChart(oldId)` — but the old ShareLink remains until TTL or deletion
4. **Storage purge**: Server purges oldest charts when total storage exceeds 10 GB (`app.py:130-154`)

---

## ACCOUNT TRANSFER

### 22. Account Link Flow

**Sender** — `createAccountLink()` (`static/Server/accountLink.js:27-49`):

1. Generate UUID v4 `linkId` (line 28)
2. Generate 32 random bytes `linkSecret` (line 29)
3. Derive key: `PBKDF2(linkSecret, linkId)` with 100K iterations (lines 31-32)
4. Encrypt `JSON.stringify({passphrase, displayName})` with AES-256-GCM (line 35)
5. POST `/api/account-link` with `{link_id, encrypted_blob}` (line 38)
6. Server stores in `AccountLink` table: `link_id` (PK), `encrypted_blob` (BLOB), `created_at` (Unix seconds) — `models.py:82-88`, `app.py:446-474`
7. Return URL: `{origin}/sync/{linkId}/{linkSecret}` (line 47)
8. Display as QR code (`settingsModal.js:184-187`)

`linkSecret` is **never sent to the server**.

### 23. Receiving Device Discovery

1. Receiver scans QR or pastes URL -> Flask renders `sync_link.html` at route `/sync/<link_id>/<link_secret>` (`app.py:502-505`)
2. Client JS extracts `linkId` and `linkSecret` from `window.location.pathname` (`sync_link.html:132-139`)
3. `redeemAccountLink(linkId, linkSecret)` (`accountLink.js:57-73`):
   - GET `/api/account-link/{linkId}` (line 58) -> `{encrypted_blob}`
   - `deriveKey(linkSecret, linkId)` -> decrypt blob (lines 69-70)
   - Parse `{passphrase, displayName}` (line 72)
4. Store passphrase to IndexedDB `SCC_Identity` (`sync_link.html:113`)

**Current code is idempotent** — does NOT delete after first fetch. The design doc says it should be one-time-use, but implementation differs.

### 24. 15-Minute TTL

**Server-side enforcement** (`app.py:487-497`):

```python
if account_link.created_at + config.ACCOUNT_LINK_TTL_SECONDS < now:
    db.session.delete(account_link)
    # Opportunistic cleanup of all expired links
    expired = AccountLink.query.filter(...).delete()
    db.session.commit()
    return jsonify({'error': 'Link has expired'}), 404
```

`ACCOUNT_LINK_TTL_SECONDS = 15 * 60` (`config.py:35`).

Client shows a countdown timer (`settingsModal.js:192-207`) but it's **purely informational UI** — the server is authoritative.

---

## SERVICE WORKER & OFFLINE

### 25. Precached URLs

`service-worker.js` precaches **3 HTML pages + ~117 static assets = ~120 URLs total**:

- **HTML**: `/`, `/new`, `/chart/_shell`
- **All JS modules** under `static/SCC/` (main.js, chartState.js, config.js, eventBus.js, all series/, lines/, ui/, util/, import/, storage/ modules)
- **All JS modules** under `static/Server/` (accountLink.js, crypto.js, init.js, onlineStatus.js, client-api.js, syncClient.js, syncDevice.js, wsClient.js)
- **Libraries**: `static/lib/qrcode-generator.min.js`, `static/lib/idb.js`, `static/lib/plotly-2.35.2.min.js`, `static/lib/socket.io-4.7.4.min.js`, `static/lib/xlsx.full.min.js`
- **CSS, fonts, manifest, icons**

### 26. Fetch Handlers

The fetch handler (`service-worker.js:175-208`) uses a three-tier strategy:

1. **Non-GET requests** -> pass through (no caching)
2. **Navigation requests** -> network-first with 3s timeout, cache fallback
3. **Static assets** -> cache-first with network fallback
4. **Everything else (including `/api/*`)** -> network-only, explicitly not cached

API calls are explicitly NOT intercepted. No modification needed for Nostr migration in the fetch handler itself — but the precache list will need updating (remove Socket.IO, add Nostr libraries).

### 27. WebSocket in Service Worker

**No.** The service worker contains zero WebSocket code. All WebSocket handling is in page-context JS (`wsClient.js`).

---

## API SURFACE

### 28. Complete API Endpoint Map

| Endpoint | Method | Client Caller | Request | Response |
|----------|--------|--------------|---------|----------|
| `/api/health` | GET | `onlineStatus.js:35` (`pingServer`) | None | 204 No Content |
| `/api/sync` | POST | `syncClient.js:189,200,217,260,291,338` | `{user_id, last_sync_at, local_manifest, uploads}` | `{server_manifest, downloads, tombstones}` |
| `/api/share/edit` | POST | `syncClient.js:380` (`_createShareLink`) | `{chart_uuid, user_id, data, wrapped_key, wrapped_key_for_share, last_modified, signature}` | `{success: true}` |
| `/api/chart` | DELETE | `syncClient.js:406` (`deleteChart`) | `{chart_uuid, user_id}` | `{success: true}` |
| `/api/chart/leave` | DELETE | `syncClient.js:414` (`leaveChart`) | `{chart_uuid, user_id}` | `{success: true}` |
| `/api/chart/{uuid}/shared` | GET | `syncClient.js:426,478` | None | `{data, wrapped_key, updated_at, signature}` |
| `/api/chart/{uuid}/poll` | GET | `syncClient.js:471` | Query: `?t={timestamp}` | `{changed: bool, updated_at}` |
| `/api/account-link` | POST | `accountLink.js:38` | `{link_id, encrypted_blob}` | 201 Created |
| `/api/account-link/{id}` | GET | `accountLink.js:58` | None | `{encrypted_blob}` |
| `/api/subscription/status` | GET | `init.js:107` | Header: `X-User-Id` | `{paid_until}` |

**WebSocket events** (not HTTP):

| Event | Direction | Handler |
|-------|-----------|---------|
| `join_chart` | Client -> Server | `app.py:512-526` |
| `leave_chart` | Client -> Server | `app.py:529-534` |
| `chart_updated` | Server -> Client | `wsClient.js:41-49` |

All API calls route through `static/Server/client-api.js:30-79` — a single `api()` function that adds `X-User-Id` header.

### 29. Authentication

**Only ECDSA signatures** (embedded in chart data payloads, verified client-side only). The `X-User-Id` header is metadata for subscription lookup, not authentication. No session cookies, no bearer tokens, no JWT, no OAuth.

Server-side write operations gated by `@requires_subscription` decorator (`app.py:31-53`) which checks `X-User-Id` against the `Subscription` table for `paid_until` timestamp.

### 30. Other Server Involvement

No additional server involvement beyond the endpoints listed above. All chart editing, rendering, line drawing, and encryption/decryption are purely local.

---

## DEPENDENCIES

### 31. Cryptographic Libraries

**No external crypto libraries.** All operations use the native **Web Crypto API** exclusively:

| Operation | API | File | Lines |
|-----------|-----|------|-------|
| AES-256-GCM encrypt/decrypt | `crypto.subtle.encrypt/decrypt` | `crypto.js` | 33-50 |
| PBKDF2 key derivation | `crypto.subtle.deriveKey` | `crypto.js` | 20-31 |
| ECDSA P-256 sign/verify | `crypto.subtle.sign/verify` | `crypto.js` | 193-204 |
| AES-GCM key wrapping | `crypto.subtle.wrapKey/unwrapKey` | `crypto.js` | 56-72 |
| Random generation | `crypto.getRandomValues` | `crypto.js` | 34, 57 |
| SHA-256 hashing | `crypto.subtle.digest` | `crypto.js` | 15-18 |
| Key generation | `crypto.subtle.generateKey` | `crypto.js` | 52-54 |

Custom P-256 BigInt point multiplication at `crypto.js:82-136` for PKCS8 key construction.

BIP39 word list is a custom implementation (`static/SCC/util/BIP39Words.js` + `storage/passphrase.js`), not an npm package.

No Python crypto libraries in `requirements.txt`.

### 32. WebSocket/Socket.IO

- **Client**: Socket.IO **4.7.4** (`static/lib/socket.io-4.7.4.min.js`)
- **Server**: Flask-SocketIO **5.6.0** (`requirements.txt`), python-socketio **5.16.1**, python-engineio **4.13.1**

### 33. Polyfills/Shims

**None.** Direct Web Crypto API usage with no fallbacks or compatibility layers. Assumes modern browser support.

---

## Key Findings for Nostr Migration

1. **Curve mismatch**: Current system uses P-256 (secp256r1). Nostr requires secp256k1. The entire `deriveSigningKeyPair()` function and all signature code must be rewritten. Web Crypto API does **not** support secp256k1 — you'll need a library like `@noble/secp256k1`.

2. **Blob size risk**: Typical encrypted charts are 100-300 KB hex-encoded. Many Nostr relays cap events at 64 KB. You'll need to either switch from hex to base64 encoding (33% savings), compress before encrypting, or use a relay that supports larger events (NIP-95/blossom).

3. **No server-side verification**: The server never validates signatures. All verification is client-side. This maps well to Nostr where relays are untrusted.

4. **Key wrapping for shares**: The dual-wrapped-key scheme (owner + share recipient) maps to NIP-44 encrypted content, but the current share URL scheme (secret in URL path) won't translate directly to Nostr p-tag based sharing.

5. **Account transfer**: Currently server-mediated with TTL. For Nostr, NIP-44 encrypted DMs between npubs could replace this, but you lose the server-enforced TTL — you'd need client-side expiry or ephemeral relay messages.

6. **Push queue**: `localStorage`-based with no backoff. For Nostr relay publishing, you'll want per-relay status tracking and proper retry logic.

7. **Hex encoding everywhere**: All crypto outputs are hex-encoded, doubling size. Nostr events typically use hex for IDs/pubkeys but base64 for encrypted content. Converting to base64 would reduce payload sizes by ~33%.
