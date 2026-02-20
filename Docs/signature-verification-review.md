# Server-Side Signature Verification — Implementation Review

Post-implementation survey of the ECDSA signature verification changes across `routes/sync.py`, `routes/charts.py`, `routes/sharing.py`, `routes/helpers.py`, `models.py`, and `static/Server/syncClient.js`.

## Issue 1: WebSocket notifications emitted for rejected uploads

**File:** `routes/sync.py`, lines 144–149

**Problem:** The WebSocket notification loop iterates over the raw `uploads` list from the request, not over the subset that passed signature verification and ChartAccess checks. If a signature fails or the user lacks ChartAccess, the upload is skipped (`continue` at lines 103–105 and 115–116), but the notification still fires because the loop at line 145 re-iterates the original `uploads` list unconditionally.

This means other clients watching a shared chart receive a `chart_updated` event for an upload that was actually rejected. Those clients will then fetch stale data (or trigger a wasted sync cycle).

**Severity:** Low — wastes a round-trip, no data corruption.

**Fix:** Track which chart_uuids were actually written, and only emit for those:

```python
written_uuids = set()
for upload in uploads:
    # ... existing validation ...
    written_uuids.add(chart_uuid)

# After commit
for upload in uploads:
    if upload['chart_uuid'] in written_uuids:
        socketio.emit(...)
```

**Pre-existing?** Yes — this bug existed before the signature changes, but was harmless when all uploads were accepted. The new rejection paths make it observable.

## Issue 2: Inline `b64decode` with isinstance check instead of `decode_blob`

**File:** `routes/sharing.py`, line 176

**Problem:** The `join_chart` endpoint uses:
```python
wrapped_key_bytes = b64decode(wrapped_key) if isinstance(wrapped_key, str) else wrapped_key
```

Every other endpoint uses `decode_blob()` from `routes/helpers.py`, which does the same thing. This is a minor consistency issue — `decode_blob` is already imported in `sharing.py` (via the import on line 7 in the original file, though only `encode_blob` is used; `decode_blob` would need to be added to the import).

**Severity:** Cosmetic — functionally identical.

**Fix:** Import `decode_blob` and use `wrapped_key_bytes = decode_blob(wrapped_key)`.

## Issue 3: Repeated ensure_identity + rate-limit boilerplate

**Files:** `routes/sync.py`, `routes/charts.py`, `routes/sharing.py`

**Problem:** Every mutating endpoint repeats the same ~15-line block:
1. `_hash_ip(request.remote_addr or '0.0.0.0')`
2. `ensure_identity(user_id, data.get('public_key'), ip_hash)` with `'rate'` / `'auth'` branching
3. `check_key_rate(user_id, is_write=True)` with 429 response

This pattern appears 5 times across the three files. A decorator or shared helper could eliminate the duplication.

**Severity:** Cosmetic — no correctness issue, but increases maintenance surface.

**Pre-existing?** Yes — not introduced by the signature verification changes. Existed in the original endpoints.

**Fix (optional):** Extract a decorator like `@require_authenticated_user` that handles identity verification, rate limiting, and error responses before the route body runs.
