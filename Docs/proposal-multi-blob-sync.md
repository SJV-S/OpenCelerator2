# Proposal: Multi-Blob Chart Sync

## Problem

Every chart save pushes the **entire chart** as a single encrypted blob. Adding one data point re-encrypts and uploads everything — series data, lines, credits, styles, settings. As charts grow (more series, more data points), this wastes bandwidth on unchanged sections.

## Proposal

Break each chart into independently encrypted blobs. Track them with a signed manifest. On push, upload only the blobs that changed since the last successful push.

---

## Blob Decomposition

### Data blob

| Blob key | Contents | Changes when... |
|----------|----------|-----------------|
| `data` | `series.xValues`, `series.corrects`, `series.errors`, `series.timing`, `series.misc.*` — the entire `series` object | Data entry, in-place edit, or deletion |

All series data lives in one blob. The parallel-array structure (shared xValues index) is preserved exactly as-is. No duplication, no sparse semantics, no privacy tradeoffs.

### Structural blobs (fixed set, always present)

| Blob key | Contents | Changes when... |
|----------|----------|-----------------|
| `lines` | `PhaseLines`, `AimLines`, `LineCuts`, `CelLines` | User draws/deletes a line |
| `styles` | `lineStyles`, `traceStyles`, `lineVisibility`, `seriesVisibility`, `fanVisible`, `placeZerosBelowFloor` | User changes appearance |
| `credits` | `credits` array | User edits credit fields |
| `settings` | `chartName`, `tags`, `chartType`, `minuteChart`, `chartCapacity`, `chartWindow`, `containerHeight`, `legend`, `hasTimestamps`, `startDate` | User renames chart, changes type, resizes |
| `identity` | `publicKey`, `ownerName`, `collaborators`, `acceptingEdits`, `shared` | Sharing/collaboration changes |

### Total: 6 blobs per chart. Fixed count, no variability.

---

## Manifest

A lightweight JSON object that ties the blobs together:

```json
{
  "chartUuid": "abc-123",
  "blobs": {
    "data":     "ciphertextHash...",
    "lines":    "ciphertextHash...",
    "styles":   "ciphertextHash...",
    "credits":  "ciphertextHash...",
    "settings": "ciphertextHash...",
    "identity": "ciphertextHash..."
  }
}
```

- Each value is a SHA-256 hash of the encrypted blob (ciphertext). This binds the manifest to specific blob contents — the signature on the manifest prevents blob substitution (swapping in older valid ciphertext).
- Ciphertext hashes change every encryption (random IV), so they cannot be used for dictionary attacks or cross-user comparison.
- **No plaintext hashes** in the manifest. Plaintext hashes are kept client-side only for local change detection.
- **No version numbers**. The server uses its own internal upload timestamps to decide which blobs to send on pull (same approach as the current `last_modified` comparison, but per blob).
- The manifest itself is **not encrypted** — it contains only the chart UUID and opaque ciphertext hashes.

---

## Encryption

Each blob is encrypted independently with the **same per-chart AES-256-GCM key**. The key management layer (key wrapping, share keys) is unchanged.

```
blob plaintext
    → JSON.stringify
    → gzip
    → AES-256-GCM(chartKey, random IV)
    → base64
```

Same pipeline as today, just applied per-blob instead of per-chart.

---

## Signing

The ECDSA signature covers the **manifest**, not individual blobs.

```
manifest JSON → canonical serialize → ECDSA-SHA256 sign
```

Since the manifest contains ciphertext hashes of every blob, signing the manifest transitively authenticates all blobs. One signature, full coverage.

On verification: the puller checks the manifest signature, then verifies each downloaded blob's ciphertext hash matches its manifest entry. This prevents blob substitution — the server cannot swap in older valid ciphertext without invalidating the signature.

---

## Push Flow

```
1. Serialize chartState into blob sections
2. For each blob:
   a. SHA-256 hash the plaintext (serialized JSON)
   b. Compare to locally stored hash from last push
   c. If changed: encrypt (AES-256-GCM with chart key)
3. Build manifest with ciphertext hashes of all 6 blobs
   (unchanged blobs keep their previous ciphertext hash)
4. Sign manifest
5. POST /api/sync with:
   - manifest (signed)
   - only the changed blobs (encrypted)
   - wrapped key (unchanged from today)
```

**Data entry / edit / delete**: 1 changed blob (`data`) + manifest.
**Drawing a line**: 1 changed blob (`lines`) + manifest.
**Editing styles**: 1 changed blob (`styles`) + manifest.
**Editing credits**: 1 changed blob (`credits`) + manifest.

### Change Detection

Each blob encryption uses a fresh random IV, so identical plaintext produces different ciphertext every time. Change detection must therefore hash the **plaintext** (serialized JSON), not the ciphertext.

The client keeps plaintext hashes locally (in memory or localStorage) from the last successful push. Before encrypting each blob, it hashes the serialized JSON and compares to the stored hash. Only mismatches get encrypted and uploaded. This avoids both unnecessary encryption and unnecessary server traffic.

Plaintext hashes never leave the client. They are not in the manifest and are not sent to the server.

---

## Pull Flow

```
1. Client sends last_sync_at timestamp to server (same as current system)
2. Server checks which blobs were updated after that timestamp
3. Server returns: current manifest + only newer blobs
4. Client verifies manifest signature
5. Client verifies each downloaded blob's ciphertext hash matches manifest
6. Client decrypts blobs, merges into chartState
7. Client updates local last_sync_at and plaintext hashes
```

**First pull** (new chart): downloads all blobs.
**Subsequent pulls**: only blobs that changed since last pull.

---

## Server Changes

### Database Schema

Current `Chart` table stores one `data` column (LargeBinary). Replace with:

```
ChartBlob
  - chart_uuid    (FK → Chart)
  - blob_key      (String, one of: "data", "lines", "styles", "credits", "settings", "identity")
  - data          (LargeBinary, encrypted blob)
  - updated_at    (Integer, server-set upload timestamp)
  - PK: (chart_uuid, blob_key)

Chart (modified)
  - chart_uuid    (PK)
  - manifest      (Text, JSON)
  - signature     (LargeBinary)
  - last_modified (Integer)
  - created_by    (String)
```

`ChartAccess`, `ShareLink`, `ChartTombstone`, `Identity` — unchanged.

### API Changes

**POST /api/sync** — request body adds blob-level granularity:

```json
{
  "user_id": "...",
  "public_key": "...",
  "uploads": [
    {
      "chart_uuid": "abc-123",
      "manifest": { ... },
      "signature": "base64...",
      "wrapped_key": "base64...",
      "blobs": {
        "data": "base64-encrypted...",
        "lines": "base64-encrypted..."
      }
    }
  ],
  "local_manifest": [
    {
      "chart_uuid": "abc-123",
      "last_sync_at": 1706100000
    }
  ]
}
```

Response similarly returns per-blob downloads:

```json
{
  "downloads": [
    {
      "chart_uuid": "abc-123",
      "manifest": { ... },
      "signature": "base64...",
      "wrapped_key": "base64...",
      "blobs": {
        "data": "base64-encrypted..."
      }
    }
  ]
}
```

### Atomicity

Server applies blob updates **within a single DB transaction**. The manifest is the commit point — if the transaction fails, no partial blobs are visible.

### Quota Calculation

Currently sums `Chart.data` bytes. Changes to sum `ChartBlob.data` bytes per chart, still attributed to `created_by`.

---

## Share Links

No fundamental change. Share link creation encrypts all blobs (full chart) and uploads them. The share recipient pulls all blobs on join. After joining, incremental sync kicks in.

---

## Migration Path

### Wire Protocol

Version the sync protocol. The server inspects the request format:

- **Legacy request** (has `uploads[].data` as a single string): process as today (single blob)
- **Multi-blob request** (has `uploads[].blobs` as an object): process with new schema

This allows old clients to keep working during rollout. The server stores legacy charts in the old format until the client upgrades and does a full re-push.

### Client Migration

On first sync after the client upgrade:
1. Client detects chart has no local blob manifest
2. Decomposes chartState into blobs
3. Pushes all blobs (full upload, like today but sectioned)
4. Server migrates from single `Chart.data` row to `ChartBlob` rows
5. Subsequent pushes are incremental

### Rollback

If multi-blob sync needs to be reverted, the server can reconstruct a single blob from all `ChartBlob` rows for a given chart. The manifest contains enough structure to reassemble.

---

## What Doesn't Change

- Per-chart AES-256-GCM key (same key encrypts all blobs of a chart)
- Key wrapping (userKey wraps chartKey, one wrapped key per chart)
- ECDSA key derivation from passphrase
- IndexedDB local storage (chartState is still one object locally)
- WebSocket notifications for shared charts (still fires `chart_updated`)
- Push queue / offline support (queue still tracks chart UUIDs, not individual blobs)
- `verifyPull()` trust model (signature now covers manifest instead of blob)

---

## Traffic Savings Estimate

Assume a chart with 6 active series (3 built-in + 3 misc), 180 data points, some lines and styles. Total chart ~25 KB, of which ~18 KB is series data and ~7 KB is lines/styles/credits/settings/identity.

| Scenario | Current (full blob) | Multi-blob | Savings |
|----------|-------------------|------------|---------|
| Add data point | ~25 KB | ~18 KB (data blob) + ~0.5 KB (manifest) | **~26%** |
| Edit existing value | ~25 KB | ~18 KB (data blob) + ~0.5 KB (manifest) | **~26%** |
| Draw a line | ~25 KB | ~3 KB (lines blob) + ~0.5 KB (manifest) | **~86%** |
| Change style | ~25 KB | ~2 KB (styles blob) + ~0.5 KB (manifest) | **~90%** |
| Edit credits | ~25 KB | ~0.5 KB (credits blob) + ~0.5 KB (manifest) | **~96%** |
| Rename chart | ~25 KB | ~1 KB (settings blob) + ~0.5 KB (manifest) | **~94%** |
| Pull unchanged chart | ~25 KB | 0 KB (manifest comparison, no blobs) | **~100%** |

Data operations push the data blob (the largest piece) regardless. The savings come from every non-data operation — lines, styles, credits, settings, identity — which no longer drag the series data along. As charts grow, the data blob grows but the structural blobs stay small, so the savings on non-data edits scale with chart size.

---

## Metadata Exposure

The manifest is unencrypted and reveals:
- Which of the 6 blobs changed and when (e.g., "the user edited lines, not data")
- Relative blob sizes (the server sees encrypted blob sizes)

The blob count is fixed at 6 for all charts — it doesn't reveal series count or chart complexity. The metadata surface is slightly wider than the single-blob model (observer can distinguish data edits from style edits) but narrower than the per-series model discussed earlier.

---

## Open Questions

1. **Manifest canonicalization**: The manifest must be serialized deterministically for signing. JSON key ordering needs to be defined (alphabetical, or explicit ordered format).

2. **Conflict resolution for shared charts**: Two collaborators editing different blobs simultaneously is now a partial merge instead of a full overwrite. Is per-blob last-writer-wins sufficient, or do we need per-blob version vectors?

3. **Push queue granularity**: Currently the push queue tracks chart UUIDs. Should it track (chartUuid, blobKey) pairs for finer retry? Or is full-chart retry on failure acceptable?