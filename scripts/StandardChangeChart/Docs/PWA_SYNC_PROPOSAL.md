# PWA Sync & Encryption Proposal

A zero-knowledge sync system for the Single-Case Chart application, enabling encrypted cloud storage and collaborative editing.

---

## Passphrase & Identity

| Component | Specification |
|-----------|---------------|
| Passphrase | 8 BIP39 words, generated client-side |
| User ID | SHA256(passphrase) |
| Entropy | 2^88 combinations (~9.8 billion years to brute force at 10B guesses/sec) |
| Local session | Derived key stored in IndexedDB (not raw passphrase) |
| Recovery | Passphrase only, no other dependencies |

---

## Encryption

| Component | Specification |
|-----------|---------------|
| Key derivation | PBKDF2, 100k iterations, Web Crypto API |
| Encryption algorithm | AES-256-GCM |
| Chart keys | Random per chart (not derived from passphrase) |
| Key wrapping | Chart keys encrypted with user's derived key for storage |

### Key Wrapping Explained

Each chart has its own random encryption key (`chart_key`). This key is "wrapped" (encrypted) with the user's passphrase-derived key before storing on the server. This enables:

- Sharing without exposing the user's passphrase
- Independent access control per chart
- Re-keying individual charts without affecting others

```
chart_key (random, unique per chart)
    │
    └── encrypts chart data

user's passphrase → derive user_key
    │
    └── encrypts (wraps) chart_key for storage
```

---

## Sharing

Two distinct sharing mechanisms for different use cases.

### Collaborator Sharing (Edit Access)

Full edit access with encryption key exchange.

| Property | Value |
|----------|-------|
| Link format | `/join/{chart_uuid}/{share_secret}` |
| Can edit | Yes |
| Syncs | Yes |
| Requires account | Yes (passphrase) |

**Flow:**

1. Owner clicks "share for editing" → generates random `share_secret`
2. `chart_key` is wrapped with key derived from `share_secret`
3. Share link: `https://app.com/join/{chart_uuid}/{share_secret}`
4. Recipient opens link → derives key from `share_secret` → unwraps `chart_key`
5. Recipient's client re-wraps `chart_key` with their own passphrase-derived key
6. Recipient now has permanent access via their own passphrase
7. Share link can be invalidated

### Viewer Sharing (Read-Only Magic Link)

Simple read-only access without encryption complexity.

| Property | Value |
|----------|-------|
| Link format | `/view/{chart_uuid}/{view_token}` |
| Can edit | No |
| Syncs | No |
| Requires account | No |

**Flow:**

1. Owner clicks "share for viewing" → generates random `view_token`
2. Server stores `{chart_uuid, view_token}` mapping
3. Share link: `https://app.com/view/{chart_uuid}/{view_token}`
4. Viewer opens link → server validates token → renders read-only chart
5. No encryption unwrapping, no IndexedDB, no sync
6. Owner can invalidate token at any time

This separation keeps the collaborative editing system clean. Everyone in `chart_access` is an editor/owner. Viewers use a completely separate path.

---

## Storage

| Location | Contents | Encrypted? |
|----------|----------|------------|
| Server | Chart data, wrapped keys | Yes |
| IndexedDB | Chart data, chart keys, derived user key | No (plaintext) |

### Rationale for Plaintext IndexedDB

- Encryption protects data on the server (which user doesn't control)
- IndexedDB is on user's own device (which they control)
- Browser sandboxes IndexedDB per origin
- Device-level encryption handles at-rest protection
- Simplifies implementation (no decrypt on every local read)

---

## Database Schema

```sql
-- Chart data (encrypted with chart_key)
CREATE TABLE charts (
    chart_uuid   TEXT PRIMARY KEY,
    data         BLOB NOT NULL,      -- encrypted chart JSON
    updated_at   INTEGER NOT NULL    -- Unix timestamp
);

-- Access control (who can decrypt which charts)
CREATE TABLE chart_access (
    chart_uuid   TEXT NOT NULL,
    user_id      TEXT NOT NULL,      -- SHA256 of user's passphrase
    wrapped_key  BLOB NOT NULL,      -- chart_key encrypted with user's derived key
    role         TEXT NOT NULL,      -- 'owner' | 'editor'
    PRIMARY KEY (chart_uuid, user_id)
);

-- View-only tokens (separate from encrypted access)
CREATE TABLE view_tokens (
    chart_uuid   TEXT NOT NULL,
    view_token   TEXT NOT NULL,      -- random token for magic link
    created_at   INTEGER NOT NULL,
    PRIMARY KEY (chart_uuid, view_token)
);

-- Tombstones for deleted charts (retained 30 days)
CREATE TABLE chart_tombstones (
    chart_uuid   TEXT PRIMARY KEY,
    deleted_at   INTEGER NOT NULL    -- Unix timestamp
);

-- Username mapping (display name for user_id)
CREATE TABLE usernames (
    user_id      TEXT PRIMARY KEY,   -- SHA256 of passphrase
    username     TEXT UNIQUE NOT NULL
);
```

---

## Chart Deletion

### Actions

| Action | Who | Effect |
|--------|-----|--------|
| Leave | Any collaborator | Removes their `chart_access` entry, chart remains for others |
| Delete | Owner only | Removes chart entirely, creates tombstone |

### Delete Flow (Owner)

1. Owner clicks "delete" on chart
2. Client sends `DELETE /chart?chart_uuid=X&user_id=Y`
3. Server verifies `role = 'owner'` in `chart_access`
4. Server removes from `charts`, `chart_access` (all users), `view_tokens`
5. Server inserts into `chart_tombstones` with current timestamp
6. Next sync for any collaborator includes tombstone → they delete locally

### Leave Flow (Collaborator)

1. Collaborator clicks "leave" on shared chart
2. Client sends `DELETE /chart/leave?chart_uuid=X&user_id=Y`
3. Server removes only that user's `chart_access` entry
4. Chart remains for owner and other collaborators
5. User's next sync no longer includes that chart

### Sync with Tombstones

Sync response includes recent tombstones:

```json
{
  "server_manifest": [...],
  "downloads": [...],
  "tombstones": [
    {"chart_uuid": "abc-123", "deleted_at": 1706400000}
  ]
}
```

Client receives tombstone → removes chart from IndexedDB.

### Tombstone Retention

- Tombstones retained for 30 days
- Periodic server job purges tombstones older than 30 days
- If a client hasn't synced in 30+ days, falls back to manifest comparison

---

## Sync Mechanism

Single-endpoint sync with minimal server communication.

### Server Query Logic

The server uses `chart_access` (not `charts`) to determine which charts a user can access:

```sql
SELECT c.chart_uuid, c.data, c.updated_at, ca.wrapped_key, ca.role
FROM charts c
JOIN chart_access ca ON c.chart_uuid = ca.chart_uuid
WHERE ca.user_id = :requesting_user_id
```

This returns both:
- Charts the user owns (`role = 'owner'`)
- Charts shared with the user (`role = 'editor'`)

Each user has their own row in `chart_access` with their own `wrapped_key`, so filtering by `user_id` captures all accessible charts in one query.

### Endpoint

```
POST /sync
```

### Request

```json
{
  "user_id": "sha256hex...",
  "last_sync_at": 1706100000,
  "local_manifest": [
    {"chart_uuid": "abc-123", "updated_at": 1706400000},
    {"chart_uuid": "def-456", "updated_at": 1706300000}
  ],
  "uploads": [
    {"chart_uuid": "abc-123", "data": "encrypted...", "updated_at": 1706400000}
  ]
}
```

Server returns tombstones where `deleted_at > last_sync_at`.

### Response

```json
{
  "server_manifest": [
    {"chart_uuid": "abc-123", "updated_at": 1706400000},
    {"chart_uuid": "def-456", "updated_at": 1706350000}
  ],
  "downloads": [
    {"chart_uuid": "def-456", "data": "encrypted...", "updated_at": 1706350000}
  ],
  "tombstones": [
    {"chart_uuid": "ghi-789", "deleted_at": 1706200000}
  ]
}
```

### Conflict Resolution

Optimistic concurrency with last-write-wins:

- Client sends `base_timestamp` (the version it edited from)
- Server rejects if `base_timestamp` doesn't match current server timestamp
- Client notified of conflict, must refresh and retry

---

## Shared Chart Polling

Active polling for real-time collaboration on shared charts.

### Conditions

Polling activates only when:
1. Chart is currently being viewed
2. Chart is shared (multiple users in `chart_access`)

### Endpoint

```
GET /chart/poll?chart_uuid=X&last_known=1706400000
```

### Response

```json
// No changes
{ "changed": false }

// Has changes
{ "changed": true, "updated_at": 1706400500 }
```

### Configuration

| Setting | Value |
|---------|-------|
| Polling interval | 5 seconds |
| Stops when | User navigates away from chart |

If `changed: true`, client fetches full data via `/sync` or dedicated endpoint.

---

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/sync` | POST | Full sync (manifest + uploads/downloads + tombstones) |
| `/chart/poll` | GET | Lightweight timestamp check for shared charts |
| `/chart` | DELETE | Owner deletes chart entirely |
| `/chart/leave` | DELETE | Collaborator removes own access |
| `/view/{chart_uuid}/{view_token}` | GET | Render read-only chart (magic link) |

---

## Trust Model

| Entity | Trust Level | Can Access |
|--------|-------------|------------|
| Server | Trusted custodian | Encrypted blobs only, cannot read content |
| User's device | Fully trusted | Plaintext data in IndexedDB |
| Collaborator (edit link) | Chart-specific | Decrypt and edit shared chart |
| Viewer (magic link) | Read-only | View rendered chart, no encryption access |

---

## Client-Side Key Derivation (Web Crypto API)

```javascript
async function deriveKey(passphrase, salt) {
  const encoder = new TextEncoder();

  // Import passphrase as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-256-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),  // use user_id as salt
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
```

---

## User Experience Flow

### First Use

1. App generates 8 BIP39 words silently in background
2. Derived key stored in IndexedDB
3. User proceeds directly to app (no prompt, no explanation)
4. Passphrase exists but user doesn't need to know about it yet

### Passphrase Discovery (Sync Prompt)

1. User navigates to settings or menu section implying multi-device use
2. App displays passphrase with simple message: "Use this to sync your charts to another device"
3. No explanation of encryption - just "use this"

### Returning User (Same Device)

1. App loads derived key from IndexedDB
2. User proceeds directly to app

### Returning User (New Device)

1. User enters 8-word passphrase
2. Key derived, stored in IndexedDB
3. Sync pulls all charts from server
4. User proceeds to app

### Switch Users

1. User clicks "Switch users" in settings
2. Clears derived key and user data from IndexedDB
3. Prompts for passphrase (existing) or generates new one
4. Details TBD

### Sharing a Chart (Collaborator)

1. Owner clicks "share for editing" on chart
2. Link generated with embedded secret
3. Owner sends link to collaborator
4. Collaborator opens link, gains edit access
5. Collaborator's access persists via their own passphrase

### Sharing a Chart (Viewer)

1. Owner clicks "share for viewing" on chart
2. Magic link generated with view token
3. Owner sends link to viewer
4. Viewer opens link, sees read-only chart
5. No account required, no persistent access

---

## Offline Handling

### Pending Uploads

When offline or sync fails:

1. Chart changes saved to IndexedDB as normal
2. Mark chart as `pending_upload: true` in IndexedDB
3. On next sync attempt, pending charts are uploaded first

### Sync Triggers

Do not rely on service worker background sync. Instead, attempt sync at:

- App startup
- After saving a chart (debounced)
- When user navigates away (`visibilitychange` or `beforeunload` events)
- Periodic retry if pending uploads exist

Details TBD on exact implementation.

---

## Access Revocation

### Revoking Collaborator Access

Two simultaneous actions:

1. Fork chart to new UUID (with new `chart_key`, owner-only access)
2. Tombstone old UUID

Old collaborators receive tombstone on next sync → their copy is deleted. Simple, no complex permission management.

### Revoking View Tokens

Owner deletes the view token from `view_tokens` table. Magic link stops working immediately.

---

## Rate Limiting

Required to prevent abuse since there's no traditional authentication.

Approaches to consider:

- Rate limit by IP address
- Rate limit by user_id (but attacker can generate fake ones)
- Proof-of-work for certain operations
- Captcha for account creation / first sync

Details TBD.

---

## Future Considerations

- WebSocket upgrade for sub-second collaboration (if polling proves insufficient)
- Share link expiration (for both collaborator and viewer links)
- Audit log of access events

---

## PWA Caching Strategy (TBD)

Topics to discuss:

- **Static asset caching**: App shell, JS, CSS, images
- **Cache invalidation**: How to update cached assets on new deployments
- **Offline-first vs network-first**: Which resources use which strategy
- **IndexedDB as primary store**: Already decided, but interaction with service worker cache
- **Stale-while-revalidate**: For non-critical resources
- **Cache size limits**: How much to store, what to evict first