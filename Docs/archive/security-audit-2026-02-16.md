# Security Audit — 2026-02-16

Prompted by automated vulnerability scanners probing the production server for `.env`, `.git/config`, `wp-config.php`, etc.

## Scope

Full audit of Flask backend (`app.py`), client-side JavaScript (`static/SCC/`, `static/Server/`), Jinja templates, service worker, crypto implementation, file exposure, and dependency security.

## Findings

### HIGH — Fixed

**#1. innerHTML XSS via shared chart data**

User-editable fields (`seriesName`, credit text) were interpolated into `innerHTML` without escaping. On shared charts, a malicious collaborator could inject HTML/JS that executes in other users' browsers.

| File | Vector |
|------|--------|
| `static/SCC/series/dataEntry.js` | `seriesName` in label innerHTML |
| `static/SCC/series/traceStyles.js` | `seriesName` in overlay innerHTML |
| `static/SCC/series/dataUpdate.js` | `seriesName` + `value` + `miscId` in innerHTML |
| `static/SCC/ui/credit.js` | Credit lines only escaped `"`, not `<>` |
| `static/SCC/chartExplorer.js` | sessionStorage error msg + `chart.id` in attributes |

**Fix:** Added `escapeHtml()` to `static/SCC/util/dom.js` — handles all 5 dangerous characters (`& < > " '`), safe for both text content and attribute contexts. Replaced the old DOM-based version in `chartExplorer.js` (which only escaped 3 chars) with an import from the shared utility. Applied across all affected files.

### HIGH — Non-issue (encrypted architecture)

**#2. WebSocket `join_chart` has no authorization**

Any client who knows a chart UUID can join the room. However, the data pushed over WebSocket is the encrypted chart blob — without the decryption key (wrapped per-user in `ChartAccess.wrapped_key`), the attacker receives opaque ciphertext. Only metadata leakage (timing of edits, chart existence confirmation).

**#3. `/api/chart/<uuid>/shared` lacks access token**

Only checks if a `ShareLink` record exists and isn't expired. However, the share secret needed to unwrap the key lives in the URL `#fragment` (never sent to server). The encrypted blob is useless without it. The UUID itself is `crypto.randomUUID()` (122 bits of entropy) — effectively unguessable with no enumeration endpoint.

**#4. `/api/sync` trusts client-provided `user_id`**

An attacker who knows a `user_id` could push garbage blobs. However, client-side `verifyPull()` (`syncClient.js:59`) checks the ECDSA signature against the public key before accepting any downloaded chart. Garbage uploads are discarded on pull — IndexedDB data stays intact. Low-severity DoS at worst (wasted bandwidth).

**Future mitigation idea:** Client reports failed signature verification back to server, server bans the offending IP. Not yet implemented.

**#5. CSP includes `unsafe-eval`**

Required by Plotly.js (confirmed: only `eval`/`new Function` usage in the entire codebase is in `plotly-2.35.2.min.js`). Cannot remove without swapping charting libraries. Non-actionable.

### MEDIUM — Fixed

**#7. No input validation on `user_id`, `chart_uuid`, `link_id` formats**

All values flowed into SQLAlchemy parameterized queries (no SQL injection), but no format enforcement existed.

**Fix:** Added `valid_user_id()` (64-char hex) and `valid_uuid()` (UUID v4 regex) validators to `app.py`. Applied to every endpoint: `/api/sync` (user_id, chart_uuids in uploads and manifest), `/api/chart` DELETE, `/api/chart/leave`, `/api/share/edit`, `/api/chart/<uuid>/poll`, `/api/chart/<uuid>/shared`, `/api/account-link` POST (replaced length-only check), and WebSocket `join_chart`/`leave_chart`.

### MEDIUM — Non-actionable

**#6. Client timestamps accepted for sync ordering**

Server clamps to `now + 300s`. Manipulation is theoretical — client-side signature verification handles tampered uploads regardless.

**#8. No per-field size validation on base64 blobs**

`MAX_CONTENT_LENGTH = 16MB` caps the entire request. Per-field limits would be marginal improvement over existing protection. Not worth the complexity.

**#9. BIP39 passphrase stored plaintext in IndexedDB**

Inherent to browser-based crypto. No way to encrypt at rest without another key that also needs storing. CSP + innerHTML fix mitigate the XSS vector that could read it.

**#10. PBKDF2 iterations = 100,000**

OWASP recommends 600,000 for passwords, but the input here is a BIP39 mnemonic with 128 bits of entropy from `crypto.getRandomValues`. Brute-force is infeasible regardless of iteration count.

### LOW — Fixed

**#11. Missing security headers**

**Fix:** Added `@app.after_request` handler setting `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN`. Skipped deprecated `X-XSS-Protection` (CSP is the modern replacement).

### LOW — Not actionable

**#12. Console logging of chart UUIDs and state**

Debug convenience. `debug.js` exposing `window.chartState` is documented as the one exception to the no-window-object rule.

**#13. Request log pruning is opportunistic**

`telemetry.py` cleanup triggers on request after 24h gap. Low-traffic servers could accumulate logs. Minor operational concern, not a vulnerability.

## Clean Areas

- No exposed secrets — no `.env`, credentials, keys, or API tokens in repo or git history
- No `eval()` / `document.write()` in project code (only in Plotly library)
- Comprehensive `.gitignore` — database, env files, IDE files all excluded
- No path traversal — `send_from_directory` used correctly, no user-controlled file paths
- No Jinja `| safe` or `autoescape false` — all templates use default escaping
- Crypto implementation sound — AES-256-GCM with fresh IVs, ECDSA P-256, zero-knowledge share links
- ES6 module architecture — no inline handlers, no window globals (except debug.js)
- `.git/` not served — no route exposes git internals
- Deploy scripts properly harden — `DEVELOPER_MODE`, `CORS` sed-replaced at deploy time
- Dependencies up to date — Flask 3.1.2, SQLAlchemy 2.0.46, no known CVEs

## Files Changed

| File | Change |
|------|--------|
| `static/SCC/util/dom.js` | Added `escapeHtml()` export |
| `static/SCC/chartExplorer.js` | Import shared `escapeHtml`, escape `chart.id` + error banner |
| `static/SCC/series/dataEntry.js` | Escape `seriesName` + `miscId` in innerHTML |
| `static/SCC/series/dataUpdate.js` | Escape `label` + `value` + `miscId` in innerHTML |
| `static/SCC/ui/credit.js` | Replace partial `"` escaping with full `escapeHtml()` |
| `app.py` | Input validation on all endpoints, security response headers |
