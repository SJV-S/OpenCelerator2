# Account Share Link — Design Proposal

## Problem

Syncing a new device currently requires copying a 10-word BIP39 passphrase manually. This works but is friction-heavy — users must read/dictate/type 10 words accurately across devices. A temporary share link (with QR code support) would make this seamless.

## Current Systems

### Chart Share Links (existing)

- URL format: `/chart/{chartUuid}/{shareSecret}`
- `shareSecret` is a random 64-char hex string
- A `shareKey` is derived via PBKDF2 from the secret + chartUuid as salt
- The chart's AES key gets **wrapped** (encrypted) with the shareKey and stored on the server in the `share_links` table
- Recipient clicks link -> fetches encrypted chart + wrapped key -> derives shareKey from URL secret -> unwraps chart key -> decrypts chart data
- 14-day TTL, server-side expiration check
- After joining, chart is stored locally in IndexedDB with `shared=true` and real-time WebSocket sync kicks in

### Account / Passphrase System (existing)

- A 10-word BIP39 passphrase is the root of identity
- `userId = SHA256(passphrase)` — the account identifier
- `userKey = PBKDF2(passphrase, userId)` — AES-256 key for wrapping chart keys
- ECDSA signing key pair also derived deterministically from passphrase
- To sync a new device: enter the same passphrase -> same userId/userKey/signingKeys -> server matches via `chart_access.user_id` -> pulls all charts
- Each chart's random AES key is wrapped with the userKey and stored in `chart_access.wrapped_key`

## Proposed Design

### Overview

Generate a temporary, one-time-use link that securely transfers the passphrase via the server. The passphrase remains the permanent identity under the hood — the link is a convenience wrapper that avoids typing 10 words.

### URL Format

```
{origin}/sync/{linkId}/{linkSecret}
```

### Flow — Device A (sender)

1. User clicks "Sync Link" button (in chart explorer settings modal)
2. Client generates a random `linkId` (UUID v4) and `linkSecret` (32 random bytes -> hex)
3. Client derives `linkKey` via PBKDF2 from `linkSecret` + `linkId` as salt
4. Client encrypts the passphrase (and optionally display name) with `linkKey` using AES-256-GCM
5. Client POSTs the encrypted blob to `POST /api/account-link` with the `linkId`
6. Server stores it in an `account_links` table with a short TTL
7. Client constructs URL: `{origin}/sync/{linkId}/{linkSecret}`
8. URL is displayed as a QR code + copy-to-clipboard button

### Flow — Device B (receiver)

1. User opens the link (scans QR or pastes URL)
2. Client extracts `linkId` and `linkSecret` from the URL path
3. Client fetches `GET /api/account-link/{linkId}` -> gets encrypted blob
4. Derives `linkKey` from `linkSecret + linkId`, decrypts -> recovers passphrase
5. Stores passphrase in IndexedDB, runs normal `initServerSync()` flow
6. Server deletes the link record immediately after first fetch (one-time use)
7. Normal sync pulls all charts via existing `/api/sync` endpoint

### Security Properties

| Property | Detail |
|----------|--------|
| Zero-knowledge preserved | Server only stores the encrypted blob — cannot read the passphrase |
| Short TTL | 5 minutes (configurable), far shorter than the 14-day chart share links |
| One-time use | Deleted from server after first successful retrieval |
| Secret never sent to server | `linkSecret` exists only in the URL fragment/path, never in the POST body |
| No new crypto primitives | Reuses existing `deriveKey()` (PBKDF2 100k iterations) + AES-256-GCM |
| QR code is ephemeral | Displayed only in-memory, never persisted |

### Threat Model

- **Server compromise**: Attacker gets encrypted blobs but not `linkSecret` (not stored server-side). Cannot decrypt.
- **Link intercepted**: Attacker must use it within the TTL window AND before the legitimate recipient (one-time use). Short TTL minimizes exposure.
- **Brute force**: 32 random bytes = 256 bits of entropy in the secret. Infeasible.
- **Replay**: Deleted after first fetch. Second request returns 404.

## Server-Side Changes

### New Model: `AccountLink`

```python
class AccountLink(db.Model):
    link_id = db.Column(db.String(36), primary_key=True)
    encrypted_blob = db.Column(db.LargeBinary, nullable=False)
    created_at = db.Column(db.Integer, nullable=False)  # Unix seconds
```

### New Endpoints

#### `POST /api/account-link`

**Request:**
```json
{
  "link_id": "uuid-v4",
  "encrypted_blob": "hex-encoded-encrypted-passphrase"
}
```

**Response:** `201 Created`

**Behavior:** Store blob with current timestamp. Reject if `link_id` already exists.

#### `GET /api/account-link/{link_id}`

**Response:**
```json
{
  "encrypted_blob": "hex-encoded-encrypted-passphrase"
}
```

**Behavior:**
1. Look up by `link_id`
2. Check TTL (default 5 minutes) — return 404 if expired
3. Return the encrypted blob
4. Delete the record immediately (one-time use)
5. Opportunistic cleanup of any other expired records

#### Configuration

```python
ACCOUNT_LINK_TTL_SECONDS = 5 * 60  # 5 minutes
```

### New Route

```python
@app.route('/sync/<link_id>/<link_secret>')
def sync_link(link_id, link_secret):
    return render_template('SCC/sync_link.html')
```

## Client-Side Changes

### New Files

| File | Purpose |
|------|---------|
| `templates/SCC/sync_link.html` | Landing page for `/sync/{linkId}/{linkSecret}` route |

### Modified Files

| File | Change |
|------|--------|
| `static/Server/syncClient.js` | Add `createAccountLink()` and `redeemAccountLink()` functions |
| `templates/SCC/chart_explorer.html` | Add "Sync Link" button in settings modal sync section |
| `static/SCC/chartExplorer.js` | Wire up button click -> `createAccountLink()` -> display QR + URL |
| `app.py` | Add route + two API endpoints |
| `models.py` | Add `AccountLink` model |
| `config.py` | Add `ACCOUNT_LINK_TTL_SECONDS` |

### Client Functions (in syncClient.js)

```javascript
// Sender side
export async function createAccountLink() {
    const db = await openIdentityDB();
    const passphrase = await db.get(STORE_NAME, 'passphrase');
    const displayName = await db.get(STORE_NAME, 'display_name');

    const linkId = crypto.randomUUID();
    const linkSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

    const linkKey = await deriveKey(linkSecret, linkId);
    const payload = JSON.stringify({ passphrase, displayName });
    const encrypted = await encrypt(linkKey, payload);

    await fetch('/api/account-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_id: linkId, encrypted_blob: encrypted })
    });

    return `${window.location.origin}/sync/${linkId}/${linkSecret}`;
}

// Receiver side
export async function redeemAccountLink(linkId, linkSecret) {
    const response = await fetch(`/api/account-link/${linkId}`);
    if (!response.ok) throw new Error('Link expired or already used');

    const { encrypted_blob } = await response.json();
    const linkKey = await deriveKey(linkSecret, linkId);
    const payload = JSON.parse(await decrypt(linkKey, encrypted_blob));

    // Store passphrase and run normal init
    const db = await openIdentityDB();
    await db.put(STORE_NAME, payload.passphrase, 'passphrase');
    if (payload.displayName) {
        await db.put(STORE_NAME, payload.displayName, 'display_name');
    }

    await initServerSync(payload.passphrase);
}
```

### QR Code

Use a lightweight client-side QR library (e.g., `qrcode-generator` or inline canvas rendering) to display the link as a scannable code. The QR is generated in-memory from the URL string — never persisted or sent to any server.

## UX Flow

### Sender (Device A)

1. Open chart explorer -> Settings gear icon
2. Click "Sync Link" button in the sync section
3. Modal appears with:
   - QR code (large, scannable)
   - Full URL with copy button
   - Countdown timer showing remaining TTL (e.g., "Expires in 4:32")
   - Note: "This link can only be used once"
4. Link expires after 5 minutes or first use

### Receiver (Device B)

1. Scan QR code or paste URL in browser
2. Landing page shows brief loading state: "Syncing your account..."
3. On success: redirect to chart explorer with all charts synced
4. On failure (expired/used): show message with option to try again or enter passphrase manually

## Open Questions

- **TTL duration**: 5 minutes is proposed. Too short? Too long? Could offer a dropdown (1 min / 5 min / 15 min).
- **QR library choice**: Inline canvas solution vs. small dependency. Need to evaluate bundle size vs. convenience.
- **Passphrase already exists on device B**: Should redeeming a link overwrite an existing passphrase? Prompt the user? Refuse?
- **Rate limiting**: Should the server limit how many account links a user can create per hour to prevent abuse?
