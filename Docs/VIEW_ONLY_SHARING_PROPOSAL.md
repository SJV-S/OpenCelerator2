# View-Only Sharing: Signature-Based Design Proposal

## Problem

The current shared link system gives all recipients full edit access. Once a user joins via a share URL and obtains the chart key, they are indistinguishable from the owner — they can push modifications that every other client will accept. There is no view-only mode.

Server-side access control is insufficient because the server cannot read the encrypted data. A determined user with the chart key could bypass any server-side policy by pushing under a different identity.

## Design Principle

Rather than building view-only as a special sharing feature, introduce **universal push signing and pull verification** as baseline behavior. Sharing modes become policies on top of that baseline — toggling whether verification is enforced.

## Chart JSON Changes

Three new fields in the chart JSON (encrypted alongside all other chart data):

```json
{
  "owner": "a3f8c1...sha256hash",
  "acceptingEdits": true,
  "publicKey": "base64-encoded-ECDSA-P256-public-key"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | string | Owner's identity hash (SHA256 of passphrase). Set at chart creation, never changes. |
| `acceptingEdits` | boolean | Whether the owner is accepting edits from others. `true` for edit links, `false` for view-only links. |
| `publicKey` | string | Owner's ECDSA P-256 public key (base64). Used by view-only recipients to verify signatures on pull. |

These fields live inside the encrypted chart blob. The server never sees them.

## Signing Key

- **Algorithm**: ECDSA with P-256 (NIST curve). Battle-tested, native Web Crypto API support in all browsers, no dependencies.
- **Key pair generation**: Once per client, stored in IndexedDB alongside the passphrase-derived identity.
- **What gets signed**: The encrypted payload bytes. No timestamp binding needed — sync timestamps provide natural replay resistance, and replay (re-submitting data the owner once signed) is a narrow threat beyond the current scope.

## Server Changes

One new piece of data stored alongside each push: the **signature** (bytes). The server does not store public keys, does not verify signatures, and does not distinguish between edit and view-only links. It remains blind storage.

## Client Behavior

### On Push (Always)

Every client signs every push with its own private key. This is unconditional — not sharing-specific.

```
encrypt(chartData) → encryptedPayload
sign(encryptedPayload, myPrivateKey) → signature
push(encryptedPayload, signature) → server
```

### On Pull (Policy-Based)

After decrypting the chart data, the client reads `owner`, `acceptingEdits`, and `publicKey` to decide how to handle the pull:

| Condition | Interpretation | Action |
|-----------|---------------|--------|
| `owner` matches my identity | It's my chart | Verify signature is mine. Reject if not. |
| `owner` differs, `acceptingEdits: true` | Edit link | Skip verification. Accept any push. |
| `owner` differs, `acceptingEdits: false` | View-only link | Verify signature against `publicKey`. Reject if it doesn't match. Don't push. |

After signature verification passes, the client performs a **monotonic timestamp check**: if the decrypted `lastModified` is older than the locally stored `lastModified`, the pull is rejected as a replay. The chart JSON already embeds `lastModified`, and the local copy is already in IndexedDB from the previous sync — no new fields or schema changes needed.

```
pull() → { encryptedPayload, signature }
decrypt(encryptedPayload) → chartData

if chartData.owner === myIdentity:
    verify(signature, encryptedPayload, myPublicKey) → accept or reject
else if chartData.acceptingEdits:
    accept (no verification)
else:
    verify(signature, encryptedPayload, chartData.publicKey) → accept or reject

// Replay protection (all modes)
if chartData.lastModified < local.lastModified:
    reject (replay)
```

Rejected pulls (failed signature or failed timestamp check) trigger a **write-back**: the client re-pushes its own last known-good version (with a valid signature) to the server, overwriting the invalid data. This corrects the server state once so that future sync cycles don't repeatedly fetch and reject the same bad blob.

## Complete Flow

### Chart Creation

1. User creates a chart
2. Client generates ECDSA P-256 key pair (if not already generated)
3. Chart JSON includes `owner: myIdentityHash`, `publicKey: myPublicKey`, `acceptingEdits: false`
4. All pushes are signed with the private key

### Sharing as Edit Link

1. Owner sets `acceptingEdits: true` in chart JSON
2. Generates share URL as before: `/chart/{chartId}/{shareSecret}`
3. Recipient joins, decrypts, sees foreign `owner` + `acceptingEdits: true`
4. Recipient's client skips signature verification on pulls, pushes freely

### Sharing as View-Only Link

1. Owner sets `acceptingEdits: false` in chart JSON (or leaves it as default)
2. Generates share URL as before: `/chart/{chartId}/{shareSecret}`
3. Recipient joins, decrypts, sees foreign `owner` + `acceptingEdits: false`
4. Recipient's client verifies the owner's signature on every pull using `publicKey`
5. Recipient's client does not push
6. If a malicious user manages to push unsigned/mis-signed data, no client accepts it

### Unsharing

No change to existing unshare flow — `unshareChart()` already creates a new private chart with a new UUID and deletes the shared one.

## Security Properties

| Property | Mechanism |
|----------|-----------|
| Only the owner can produce accepted edits (view-only mode) | ECDSA signature verification on pull |
| Server cannot forge edits | Server doesn't have the private key |
| View-only users cannot forge edits | They don't have the owner's private key |
| Replay resistance | Monotonic `lastModified` check after decryption rejects stale payloads |
| No public key registry needed | Public key travels inside the encrypted chart data |
| No URL format changes | Share URLs remain `/chart/{chartId}/{shareSecret}` |
| Graceful degradation | Edit links work exactly as today (no verification) |

## What This Does NOT Protect Against

- **Replay attacks** (mitigated): The monotonic `lastModified` check rejects stale replays after decryption. The remaining window is narrow: if a replayed payload has a `lastModified` equal to or newer than the local copy (e.g., the recipient hasn't synced recently), it could be accepted. In practice, this requires the attacker to replay the most recent version — which is the current data anyway, making the attack a no-op.
- **Denial of service**: A malicious user could flood the server with unsigned pushes. Clients would reject them, but server storage is consumed. This is a server-side concern orthogonal to this design.
- **First-pull trust**: The first time a recipient decrypts the chart, they trust whatever public key is inside. If an attacker could replace the encrypted blob before the legitimate recipient joins, they could substitute their own key. This requires having the chart encryption key (from the share URL), so it's bounded by URL secrecy.

## Implementation Scope

### New Code

- Key pair generation (Web Crypto API, ECDSA P-256)
- Sign function: takes encrypted payload + private key, returns signature
- Verify function: takes encrypted payload + signature + public key, returns boolean
- Pull verification logic (the policy table above)

### Modified Code

- `chartStorage.js`: attach signature to push payload, verify signature on pull
- `syncClient.js`: pass signature through push/pull, store/retrieve from server response
- `share.js`: set `acceptingEdits` flag when creating edit vs view-only links
- `chart.html` / initialization: populate `owner` and `publicKey` on chart creation
- `app.py` / `models.py`: store signature bytes alongside chart data (one new column or field)

### Unchanged

- Share URL format
- Encryption/decryption flow
- WebSocket sync mechanism
- Unshare flow
- IndexedDB schema (public key is just chart data)
