# Security Model — SCC Sync & Encryption

## Architecture Summary

All chart data is encrypted client-side before leaving the browser. The server stores only opaque blobs it cannot decrypt. Identity is based on a BIP39 passphrase stored in the browser's IndexedDB, from which all cryptographic keys are derived.

---

## Key Hierarchy

| Key | Derivation | Purpose |
|-----|-----------|---------|
| BIP39 passphrase | 12 random words (root secret) | Stored in IndexedDB. All other keys derived from this. |
| userId | SHA-256(passphrase) | Server-side identity. Used in ChartAccess table lookups. |
| userKey | PBKDF2(passphrase, userId, 100k iterations) → AES-256-GCM | Wraps/unwraps per-chart keys. Never sent to server. |
| Signing key pair | PBKDF2(passphrase, 'ecdsa-signing', 100k iterations) → ECDSA P-256 | Signs all chart pushes. Public key embedded in chart data for ownership verification. |
| Per-chart key | Random AES-256-GCM per chart | Encrypts chart data. Wrapped with userKey before server storage. |
| Share key | PBKDF2(shareSecret, chartUuid) | Derived from share link URL fragment. Wraps chart key for share recipients. |
| Account link key | PBKDF2(linkSecret, linkId) | Encrypts passphrase + display name for device transfer. |

### Implementation References

- Passphrase generation: `static/SCC/storage/passphrase.js` — `generatePassphrase()` via `crypto.getRandomValues(new Uint32Array(12))`
- userId: `passphrase.js:getUserId()` → `sha256(passphrase)`
- Key derivation: `static/Server/crypto.js:deriveKey()` — PBKDF2-SHA-256, `PBKDF2_ITERATIONS = 100000`
- Signing keys: `crypto.js:deriveSigningKeyPair()` — custom P-256 scalar multiplication with range validation against curve order N
- Chart keys: `crypto.js:generateChartKey()` — `crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 })`
- Share links: `static/Server/syncClient.js:_createShareLink()` — 32 random bytes as hex in URL fragment
- Account links: `static/Server/accountLink.js:createAccountLink()` — random UUID + 32 random bytes

---

## Server-Side Storage

The server stores:
- **user_id**: SHA-256 hash (cannot reverse to passphrase) — `models.py:ChartAccess.user_id`
- **wrapped_key**: per-chart AES key encrypted with user's userKey (server cannot unwrap) — `models.py:ChartAccess.wrapped_key`
- **data**: chart content encrypted with per-chart key (server cannot decrypt) — `models.py:Chart.data`
- **signature**: ECDSA signature over encrypted data (server cannot forge) — `models.py:Chart.signature`
- **encrypted_blob**: account link payload encrypted with link-derived key (server cannot decrypt) — `models.py:AccountLink.encrypted_blob`

The server **never receives**: the passphrase, any raw encryption key, any plaintext chart data, or the link secret (URL fragment).

All cryptographic payloads are stored as `LargeBinary` in SQLAlchemy (non-crypto fields like `user_id`, `chart_uuid`, and timestamps use `String`/`Integer`). API endpoints (`/api/sync`, `/api/share/edit`, `/api/account-link`) accept and return base64-encoded blobs without ever decrypting.

### Signature Verification Is Client-Side Only

The server stores signatures but **does not verify them**. `app.py` accepts any signature (or no signature) without checking. All signature verification happens in the client's `verifyPull()` function (`syncClient.js`). This is by design — the server is untrusted in this zero-knowledge architecture.

---

## What It Protects Against

### Server database breach

An attacker who dumps the entire database gets encrypted blobs and wrapped keys. Without any user's passphrase, they cannot decrypt a single chart. Each user's data is independently encrypted — compromising one user's passphrase reveals nothing about other users' data.

### Malicious or compromised server operator

The server operator cannot read chart data, forge chart updates (ECDSA signatures prevent this at the client verification layer), or associate charts with real identities (userId is an opaque hash). The zero-knowledge property holds even against the operator.

### Network interception (beyond TLS)

Even if TLS is stripped or compromised, the attacker sees only encrypted payloads. Chart data is encrypted before it reaches any network layer. Share link secrets and account link secrets are in URL fragments, which are never sent to the server by browsers.

### Share link recipient exceeding permissions

View-only share recipients cannot push updates — the client enforces this via the `acceptingEdits` flag inside the encrypted chart data. The flag is embedded in the encrypted payload (not metadata), so it cannot be flipped without breaking the signature. Client-side `verifyPull()` uses the **local** `acceptingEdits` value over the incoming one, preventing an attacker from overriding it. Edit-link recipients can push, but their edits are attributable (different signing key). The chart owner can detect unauthorized modifications via signature verification.

### Cross-user data leakage

Each user has independent key material derived from their unique passphrase. No shared secrets exist between users. A per-chart key is only shared with explicit share link recipients.

---

## What It Does NOT Protect Against

### XSS (Cross-Site Scripting)

This is the primary unmitigated client-side threat. Any script executing in the app's origin can:
- Read the plaintext passphrase from IndexedDB: `db.get('credentials', 'passphrase')`
- Derive all keys from it offline on the attacker's infrastructure
- Decrypt all of the user's charts, past and future
- Impersonate the user (sign pushes, create share links, transfer identity)

A single successful XSS is a complete compromise of the user's identity and all their data. This is inherent to the architecture: the app must access the passphrase, so any code running in the same origin can too.

**Non-extractable CryptoKeys do not help here.** We evaluated storing an encrypted seed protected by a non-extractable storage key. However, `crypto.subtle.decrypt()` works on non-extractable keys — only `exportKey()` is blocked. An XSS attacker simply calls decrypt and gets the seed. The bar is raised from 1 line of code to ~6 lines. This is security theater. (Note: all CryptoKeys in the current implementation use `extractable: true` regardless, since keys must be exportable for wrapping and device transfer.)

Truly non-extractable random keys (no derivation, no recoverable secret) would limit XSS to active-session exploitation only — the attacker could use the keys while the page is open but couldn't export them. However, this makes identity transfer between devices impossible, which is a hard requirement.

#### Current XSS Mitigation Status

| Mitigation | Status | Notes |
|-----------|--------|-------|
| Content Security Policy | **Implemented** | `<meta>` CSP in `base.html`: `script-src 'self' 'unsafe-eval' 'sha256-…' 'sha256-…'; style-src 'self' 'unsafe-inline'`. Blocks injected inline scripts, inline event handlers, and external script loading. `unsafe-eval` required by Plotly.js (`new Function()` x2). `unsafe-inline` for styles required by Plotly's inline SVG styling. Hashes cover the two remaining inline scripts (IndexedDB bootstrap, SW registration + nuke). Regenerate with `./scripts/build/CSP/update-hashes.sh`. |
| Inline script elimination | **Implemented** | All inline `<script type="module">` blocks extracted to external files. All inline event handlers (`oninput`) replaced with `addEventListener`. Only two inline classic scripts remain, covered by CSP hashes. |
| Input sanitization | **Partial** | `chartExplorer.js` has `escapeHtml()` using `textContent`→`innerHTML`. No project-wide sanitization framework. |
| Avoiding innerHTML | **Not followed** | `innerHTML` used in 14 files. Most insert trusted config values, but `customLegend.js` embeds config properties (colors, sizes) directly into SVG attribute strings without escaping. |
| Subresource integrity | **Implemented** | Library scripts in `static/lib/` have SRI `integrity` hashes on their `<script>` tags. |

### Malicious browser extensions

Extensions with broad host permissions or content script access can execute code in the page context, equivalent to XSS. Extensions with only storage access could read IndexedDB directly (passphrase is plaintext).

### Compromised device / OS-level access

If the attacker has access to the running OS (malware, physical access with an active session), they can read process memory, inject into the browser, or read IndexedDB backing store files (LevelDB in Chromium). The passphrase is plaintext in the backing store files.

### Offline brute-force of wrapped keys

Not a practical concern. AES-256-GCM key wrapping with a 256-bit random key is computationally infeasible to brute-force.

### Replay attacks (partially mitigated)

`verifyPull` includes a monotonic timestamp check (`syncClient.js` lines 91-94) — it rejects incoming chart data with a `lastModified` older than the local copy. This prevents replaying old versions of a chart. However, the check depends on local state; a fresh client with no local copy has no baseline to compare against (TOFU — trust on first use).

---

## Design Constraints

The passphrase cannot be replaced with a more secure storage mechanism (e.g., non-extractable CryptoKeys with no recoverable intermediate secret) because:

1. Identity transfer between devices (via account links) requires exporting the root secret from one browser and importing it into another.
2. Any recoverable secret that the app can access, XSS can access too — this is fundamental to the browser security model.
3. The browser provides no secure enclave or hardware-backed keystore accessible to web applications.

The security boundary is therefore the **browser origin**. Inside the origin, the passphrase is accessible. Outside it (server, network, other origins), data is protected by standard cryptographic primitives.

---

## Summary

| Threat | Protected? | Notes |
|--------|-----------|-------|
| Server database breach | Yes | Zero-knowledge encryption |
| Malicious server operator | Yes | Server sees only encrypted blobs; signature verification is client-side |
| Network interception | Yes | Client-side encryption before transit |
| Cross-user leakage | Yes | Independent per-user key material |
| Share link brute-force | Yes | 256-bit share secrets |
| XSS | **Partial** | CSP blocks injected scripts and inline handlers. Remaining gaps: `unsafe-eval` (Plotly), innerHTML without sanitization. Full compromise still possible if attacker achieves script execution. |
| Malicious extensions | **No** | Equivalent to XSS if content scripts permitted |
| Device compromise | **No** | Passphrase in plaintext in IndexedDB backing store |
