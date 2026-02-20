# Security Audit: Sync & Chart API Endpoints

**Date:** 2026-02-19
**Scope:** Server-side authorization and authentication for chart mutation endpoints

---

## Background

Chart data is end-to-end encrypted. The server stores opaque blobs and ECDSA signatures but has historically never verified signatures — all trust enforcement was client-side via `verifyPull()`. This audit examines what an attacker can do server-side given various levels of knowledge.

### Authentication Model

Every mutation endpoint calls `ensure_identity(user_id, public_key_b64)`, which verifies `SHA256(public_key_b64) == user_id`. This proves the caller **knows** the public key but does **not** prove they possess the corresponding private key. The public key functions as a shared secret between client and server — adequate only as long as it remains unexposed.

No endpoint requires a cryptographic signature to prove private key possession.

---

## Critical Findings

### 1. Any authenticated user can overwrite any chart blob

**Endpoint:** `POST /api/sync` (routes/sync.py, lines 104-111)

The upload loop checks whether a chart exists and updates it if the timestamp is newer. It **never checks whether the uploading user has a `ChartAccess` entry** for that chart.

```python
existing = db.session.get(Chart, chart_uuid)
if existing:
    if updated_at > existing.last_modified:
        existing.data = chart_data          # No authorization check
        existing.last_modified = updated_at
        existing.signature = signature
```

Additionally, lines 124-131 **unconditionally create a `ChartAccess` row** for the uploading user, regardless of whether they owned the chart or were ever granted access.

**Attack:** Attacker creates their own identity, sends a sync upload targeting a victim's `chart_uuid` with a garbage blob and a future timestamp. The server overwrites the chart and grants the attacker `ChartAccess`.

**Impact:** The victim's client rejects the garbage on pull (signature verification fails) and writes back its local copy. So this is not permanent data destruction — **unless** the attacker then uses their newly acquired `ChartAccess` to call `DELETE /api/chart`, which cascade-deletes the chart and creates tombstones. That **is** permanent.

**Prerequisite:** Knowledge of the victim's `chart_uuid` (122-bit UUIDv4 — infeasible to guess, but could be observed via screenshare, URL bar, etc.).

### 2. Same vulnerability on share/edit endpoint

**Endpoint:** `POST /api/share/edit` (routes/sharing.py, lines 59-68)

Identical issue: updates an existing chart's blob and signature with no `ChartAccess` check. Also creates or overwrites the `ShareLink`, allowing the attacker to hijack the share URL.

---

## High Findings

### 3. Any collaborator can delete the entire chart

**Endpoint:** `DELETE /api/chart` (routes/charts.py, lines 39-54)

The endpoint checks `ChartAccess` but not ownership. The `Chart.created_by` field exists but is never used for authorization. Any user with a `ChartAccess` row — including collaborators added via share link — can delete the chart for all users.

The `DELETE /api/chart/leave` endpoint correctly only removes the caller's own access. But the full-delete endpoint has no equivalent restriction.

**Attack (standalone):** A collaborator who was given edit access via share link calls `DELETE /api/chart` instead of `/api/chart/leave`. The chart is destroyed for the owner and all other collaborators.

**Attack (combined with Finding 1):** An attacker who exploits Finding 1 to get a `ChartAccess` row can then delete the chart.

---

## Medium Findings

### 4. Unauthenticated chart existence and activity oracle

**Endpoint:** `GET /api/chart/<uuid>/poll` (routes/sync.py, lines 187-200)

No authentication or `ChartAccess` check. Anyone who knows or guesses a `chart_uuid` can:
- Confirm the chart exists (200 vs 404)
- Read the `last_modified` timestamp
- Monitor when the chart is actively being edited

### 5. Unauthenticated WebSocket room joining

**Handler:** `join_chart` (app.py, lines 110-116)

Any WebSocket client can join a chart's notification room by UUID. They receive `chart_updated` events containing `chart_uuid` and `updated_at` — real-time activity monitoring with no authentication.

### 6. Public key is the sole authentication credential

`ensure_identity()` never proves private key possession. If an attacker obtains a user's public key (which is sent in every API request over HTTPS but never exposed in responses), they can fully impersonate that user on all endpoints. There is no challenge-response or signature-based authentication.

This is currently mitigated by the fact that the public key has no exposure surface — it's only transmitted over HTTPS in request bodies. But it means a single leak (e.g., server log exposure, MITM on a misconfigured deployment) would compromise the entire identity model.

---

## Low Findings

### 7. In-memory rate limit storage

Rate limits use `memory://` storage (config.py). With multiple gunicorn workers, each worker maintains independent counters. Effective rate limits are multiplied by the worker count. Server restarts clear all limits.

### 8. Telemetry logs unauthenticated user_id

The `after_request` telemetry handler logs whatever `user_id` is claimed in the request body, even for failed authentication. An attacker can inflate a victim's read rate-limit counters by sending rapid requests with the victim's `user_id` and an invalid public key (each request fails auth but still gets logged). Write rate limits are unaffected because they filter on `bytes_uploaded`, which is only set for successful uploads.

### ~~9. Wildcard CORS for WebSocket~~ — INVALID

~~`CORS_ALLOWED_ORIGINS = '*'` allows any webpage to open WebSocket connections.~~

**Retracted:** The wildcard CORS value in `config.py` is a dev-only default. The deploy script (`scripts/deploy_to_scc_vps.sh`) sed-replaces it to the specific domain URL at deploy time: `sed -i "s|CORS_ALLOWED_ORIGINS = '*'|CORS_ALLOWED_ORIGINS = ['$DOMAIN_URL']|" "$TMP/config.py"`. Production has never run with wildcard CORS.

---

## What's Not Vulnerable

- **Chart data confidentiality:** All chart data is AES-GCM encrypted. The server never has plaintext. Even if an attacker overwrites a blob, they cannot read existing data.
- **UUID guessing:** `crypto.randomUUID()` produces 122-bit UUIDs. Brute-force enumeration is infeasible.
- **Client-side verification:** `verifyPull()` rejects any blob with an invalid or missing ECDSA signature before loading. Combined with `writeBack()`, garbage blobs are overwritten with legitimate data when the victim's client syncs.
- **Delete/leave own access:** `DELETE /api/chart/leave` correctly scopes to the caller's own `ChartAccess` row only.
- **Identity binding:** `user_id` is cryptographically bound to `public_key` via SHA-256. An attacker cannot claim an arbitrary `user_id` without the matching public key.

---

## Technical Survey: What Exists and What's Needed

### Crypto primitives — client side (already in place)

| Component | Detail | Location |
|-----------|--------|----------|
| Curve | ECDSA P-256 (secp256r1) | `static/Server/crypto.js:95` — `{ name: 'ECDSA', namedCurve: 'P-256' }` |
| Hash | SHA-256 | `crypto.js:211-212` — `{ name: 'ECDSA', hash: 'SHA-256' }` |
| Signature format | IEEE P1363 raw (64 bytes: r \|\| s), base64-encoded for transport | `crypto.js:210-214` — `sign()` returns `encodeB64(new Uint8Array(signature))` |
| Public key format | SPKI, base64-encoded | `crypto.js:223-224` — `exportPublicKey()` exports via `'spki'` |
| What gets signed | Raw bytes of the encrypted blob (base64-decoded before signing) | `crypto.js:212` — `decodeB64(dataB64)` passed to `crypto.subtle.sign()` |
| Sign function | `sign(dataB64, privateKey)` → base64 signature | `crypto.js:210-214` |
| Verify function | `verify(dataB64, signatureB64, publicKey)` → boolean | `crypto.js:217-221` |

### Crypto primitives — server side (not yet present)

| Component | Status | Notes |
|-----------|--------|-------|
| Python crypto library | **Not installed** | No `cryptography`, `ecdsa`, or `pycryptodome` in `requirements.txt` |
| Signature verification | **Does not exist** | Server stores signatures as opaque blobs, never validates them |
| Public key loading | **Not needed yet** | Keys stored as base64 SPKI in `Identity.public_key` (Text column) — ready to load |

To verify P-256/SHA-256 signatures server-side, the `cryptography` library would need to:
1. Decode the base64 SPKI string → raw DER bytes → load via `load_der_public_key()`
2. Convert the 64-byte P1363 signature (r \|\| s) to DER format via `encode_dss_signature(r, s)`
3. Call `public_key.verify(der_signature, data_bytes, ec.ECDSA(hashes.SHA256()))`

### Data already available on the server

| Data | Where | Format | Used for verification? |
|------|-------|--------|----------------------|
| User's public key | `Identity.public_key` | Base64 SPKI string | No — only hashed to check `user_id` |
| Upload signature | `Chart.signature` | Raw bytes (`LargeBinary`), decoded from base64 on receipt | No — stored and returned, never validated |
| Encrypted blob | `Chart.data` | Raw bytes (`LargeBinary`), decoded from base64 on receipt | No — this is the data that was signed |
| Chart owner | `Chart.created_by` | `user_id` hex string | No — only used for storage quota attribution |

Everything needed for server-side verification already exists in the database. The server receives the signature and data in every upload, and has the public key in the Identity table. It just doesn't call verify.

### Endpoints requiring changes

**`POST /api/sync`** — `routes/sync.py:31`
- Uploads already include `signature` (base64) and `data` (base64) — lines 96-99
- `ensure_identity` already resolves the user's public key — line 64
- **Needed:** Verify signature on each upload. Require `ChartAccess` for existing charts. Stop auto-creating `ChartAccess` for existing charts (lines 123-131).

**`POST /api/share/edit`** — `routes/sharing.py:15`
- Upload includes `signature` (base64) and `data` (base64) — lines 56-57
- `ensure_identity` already resolves the user's public key — line 36
- **Needed:** Verify signature. Require `ChartAccess` for existing charts (lines 60-64).

**`DELETE /api/chart`** — `routes/charts.py:14`
- **No signature currently sent.** Client sends only `{ chart_uuid, user_id, public_key }` — `syncClient.js:474-478`
- **Needed:** Client must sign `chart_uuid` (UTF-8 bytes) and include signature in request. Server verifies. Add `created_by` owner check.

**`DELETE /api/chart/leave`** — `routes/charts.py:60`
- Same as above — no signature currently sent — `syncClient.js:482-486`
- **Needed:** Same pattern — client signs `chart_uuid`, server verifies. (Lower priority since this only removes the caller's own access.)

### Client-side changes needed

| File | Change |
|------|--------|
| `static/Server/syncClient.js` `deleteChart()` (line 474) | Sign `chart_uuid` UTF-8 bytes, include `signature` in request body |
| `static/Server/syncClient.js` `leaveChart()` (line 482) | Same pattern |
| `static/Server/syncClient.js` (new) | May need a `joinChart()` function that calls a new server endpoint to explicitly request `ChartAccess` for shared charts, since the auto-creation path in `/api/sync` must be closed for existing charts |

### Shared chart join flow — consequence of fixing Finding 1

Currently, collaborators get `ChartAccess` as a side effect of their first push to `/api/sync` (lines 123-131). Fixing Finding 1 requires blocking `ChartAccess` creation for existing charts in that path. This breaks the join flow.

**Resolution:** A new endpoint (e.g., `POST /api/chart/<uuid>/join`) that:
- Takes `user_id`, `public_key`, `wrapped_key`
- Verifies identity
- Checks that a `ShareLink` exists for the chart (proof the chart is shared)
- Creates `ChartAccess` for the joining user
- Client calls this after downloading via `/api/chart/<uuid>/shared` and before first push

### Dependencies

| Dependency | Purpose | Current status |
|------------|---------|---------------|
| `cryptography` Python package | ECDSA P-256 signature verification, SPKI key loading | **Not installed** — must be added to `requirements.txt` |

No other new dependencies are needed. All data formats (base64 SPKI keys, P1363 signatures, encrypted blobs) are already flowing through the system correctly.

---

## Recommended Fixes

### Server-side signature verification (Findings 1, 2, 3, 6)

Add ECDSA P-256/SHA-256 signature verification to the server using the `cryptography` Python library. The Identity table already stores public keys in SPKI format. Uploads already include signatures of the encrypted blob. The server has all the data needed to verify — it just doesn't.

- **Uploads:** Verify the signature on the encrypted blob matches the uploading user's public key before accepting the write.
- **Deletes:** Require the client to sign the `chart_uuid` and include the signature in the request. Verify server-side.
- **Existing charts:** Require `ChartAccess` before allowing writes. Stop auto-creating `ChartAccess` rows for users uploading to charts they don't own.
- **Chart deletion:** Restrict to `created_by` user only.

### Shared chart join flow (consequent to fixing Finding 1)

Currently, collaborators joining via share link get their `ChartAccess` created as a side effect of their first sync push. Fixing Finding 1 (blocking ChartAccess creation for existing charts) breaks this flow. A new `POST /api/chart/<uuid>/join` endpoint would handle explicit join requests, verifying a ShareLink exists before granting access.

### Metadata leak fixes (Findings 4, 5)

Add `ChartAccess` checks to the poll endpoint and WebSocket `join_chart` handler. These don't expose chart data but do leak activity metadata.
