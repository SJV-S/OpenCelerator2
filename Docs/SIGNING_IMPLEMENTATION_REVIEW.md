# View-Only Sharing: Implementation Review & Remediation Brief

## Purpose

This document is a post-implementation review of the ECDSA signing system described in `VIEW_ONLY_SHARING_PROPOSAL.md`. It catalogs every implementation error, explains why each is wrong, describes the current broken state, and provides clear direction for a corrective pass. Written for handoff to another engineer/AI.

## Original Design Intent

The proposal introduced **universal ECDSA push signing and pull verification** so that sharing modes (edit vs view-only) become policies on top of cryptographic identity. The critical design properties:

1. **Every push is signed** with the pusher's ECDSA private key
2. **Every pull is verified** according to a policy table (owner? edit link? view-only?)
3. **The signing key pair is the client's identity** — it's how "who pushed this?" is answered
4. **The passphrase is the root of identity** — SHA256 of passphrase = `userId`, PBKDF2 of passphrase = `userKey` (AES encryption key). The signing key pair should follow the same pattern.
5. **Monotonic `lastModified` check** rejects replayed payloads after decryption

## Fundamental Error: Random ECDSA Key Generation

### What was implemented

In `init.js`, the ECDSA key pair is generated with `crypto.subtle.generateKey()` — pure random, no relation to the passphrase:

```js
// init.js lines 53-60 (current)
if (!storedPrivateKey || !storedPublicKey) {
    const keyPair = await generateSigningKeyPair();  // random!
    storedPrivateKey = await exportPrivateKey(keyPair.privateKey);
    storedPublicKey = await exportPublicKey(keyPair.publicKey);
    await db.put(STORE_NAME, storedPrivateKey, 'signingPrivateKey');
    await db.put(STORE_NAME, storedPublicKey, 'signingPublicKey');
}
```

And in `crypto.js`:

```js
// crypto.js line 80-82
export async function generateSigningKeyPair() {
    return crypto.subtle.generateKey(ECDSA_PARAMS, true, ['sign', 'verify']);
}
```

### Why this is wrong

The application has a built-in mechanism for sharing identity across devices: the user copies their BIP39 passphrase from device A and pastes it on device B (UI in `menu_page.html`, lines 215-240). After this, both devices share:
- Same `userId` (SHA256 of passphrase)
- Same `userKey` (PBKDF2 of passphrase — used for AES encryption/decryption)

But they get **different ECDSA key pairs** because the keys are randomly generated per device. This means:

- Device B pulling a chart that device A pushed sees a **foreign public key** and cannot recognize "this is my chart"
- The `publicKey` field embedded in charts is device-specific, not identity-specific
- Two devices owned by the same user produce incompatible signatures

### The cascading consequence: `owner` field

Because `publicKey` is random per device, a separate `owner` field (SHA256 of passphrase) was added to provide cross-device identity. This is a band-aid for the wrong key generation scheme. If the ECDSA key pair were **derived from the passphrase**, then:
- Same passphrase = same key pair on every device
- `publicKey` alone identifies the owner deterministically
- The `owner` field is redundant and should be removed

### What should have been implemented

The ECDSA key pair should be **deterministically derived from the passphrase**, the same way `userKey` is derived via PBKDF2. Same passphrase on any device produces the same signing key pair. The `publicKey` then serves as both the verification key AND the identity.

**This is the core research question for remediation**: How to deterministically derive an ECDSA P-256 key pair from a passphrase using only the Web Crypto API. See "Research Required" section below.

## Other Implementation Errors (Already Fixed)

These were caught and corrected during the implementation session but are documented here for completeness.

### Event bus violations

**Error**: Imported `userId` from `syncClient.js` and `getSigningPublicKey` from `init.js` directly into `chartStorage.js`, violating the project's event bus architecture for cross-module communication.

**Fix applied**: Signing keys are passed as parameters through `initSync(passphrase, privateKey, publicKeyB64)`. No cross-module state imports. View-only push suppression moved into `pushChart()` in `syncClient.js` where `userId` is already available.

### `owner` never populated

**Error**: The plan called for `createChart()` in `chartStorage.js` to set `owner: userId`. This was removed during the event bus fix (can't import `userId` into `chartStorage`). The replacement function `stampOwnerFields()` in `syncClient.js` only sets `publicKey`, not `owner`. Result: `owner` is `null` on every chart, and `verifyPull()` always takes the legacy accept-all path, making the entire signing system a no-op.

**Status**: NOT fixed. Becomes moot when `owner` is removed entirely in favor of deterministic `publicKey`.

### Dead code and cargo cult

**Error**: Various dead exports, duplicate download processing loops, unused module-level variables, and captain-obvious comments.

**Fix applied**: Removed dead `toHex`/`fromHex` exports from `crypto.js`, removed dead module-level vars from `init.js`, extracted `processDownloads()` helper to deduplicate three identical loops, removed ~19 captain-obvious comments.

### Inefficient repeated key import

**Error**: `verifyPull()` called `importPublicKey(signingPublicKeyB64)` on every pull verification for the owner's own charts, performing a Web Crypto import each time.

**Fix applied**: Cached the `CryptoKey` as `signingPublicKey` during `initSync()`.

## Current State of Each File

### `static/Server/crypto.js`
- ECDSA primitives are correct: `sign`, `verify`, `importPublicKey`, `exportPublicKey`, `importPrivateKey`, `exportPrivateKey`
- `generateSigningKeyPair()` is the broken function — uses random generation, needs to be replaced with deterministic derivation
- Base64 and hex helpers are correct and used by the ECDSA functions

### `static/Server/init.js`
- Loads/stores ECDSA keys in IndexedDB (`SCC_Identity` store)
- Needs rework: instead of generate-and-store, should derive-from-passphrase (and optionally cache)
- Stored keys in IDB (`signingPrivateKey`, `signingPublicKey`) become a cache rather than the source of truth — if the passphrase changes (device B pastes a new one), the signing keys must be re-derived

### `static/Server/syncClient.js`
- Signing infrastructure is wired: `signPayload()`, `verifyPull()`, `writeBack()`, `processDownloads()`
- `stampOwnerFields()` sets `publicKey` but not `owner` — incomplete but becomes correct once `owner` is removed
- `verifyPull()` branches on `chartData.owner` — needs to branch on `chartData.publicKey` instead
- `pushChart()` guard uses `chart.owner` — needs to use `chart.publicKey`
- The `_createShareLink()` flow correctly sets `acceptingEdits` before encryption

### `static/SCC/chartState.js`
- Has three new fields: `owner: null`, `publicKey: null`, `acceptingEdits: false`
- `owner` should be removed entirely
- `publicKey` and `acceptingEdits` are correct

### `models.py`
- `signature` column added correctly: `LargeBinary, nullable=True`
- Migration block in `init_db()` is correct
- No changes needed

### `app.py`
- All four API surfaces pass `signature` through correctly (sync upload/download, share/edit, chart/shared)
- No changes needed

### `templates/SCC/menu/share_tab.html`
- View-only link button added correctly
- JS wiring already existed in `share.js`
- No changes needed

## Remediation Plan

### 1. Research: Deterministic ECDSA P-256 Key Derivation via Web Crypto API

The core technical question: given a passphrase string, deterministically produce an ECDSA P-256 key pair using only the Web Crypto API (no external libraries).

**Proposed approach** (needs validation):

1. Use PBKDF2 with a signing-specific salt (e.g., `"ecdsa-signing-key"`) to derive 32 bytes from the passphrase. This can reuse the existing `deriveKey` pattern but needs raw bytes output rather than an AES key. Web Crypto's `deriveBits` function can do this.
2. These 32 bytes become the P-256 private key scalar `d`.
3. Construct a PKCS8 DER blob containing only the private scalar (the public key field in ECPrivateKey is OPTIONAL per RFC 5915).
4. Import via `crypto.subtle.importKey('pkcs8', der, {name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign'])`.
5. Export to JWK to obtain the `x` and `y` public point coordinates (Web Crypto computes the public point internally during import).
6. Re-import the public key from JWK `{kty: 'EC', crv: 'P-256', x, y}` with `['verify']` usage.

**Open questions**:
- Do all target browsers (Chrome, Firefox, Safari) accept a PKCS8 EC private key without the optional public key BIT STRING?
- What is the exact minimal DER encoding for this? (The ASN.1 structure is: `PrivateKeyInfo { version, AlgorithmIdentifier { EC OID, P-256 OID }, OCTET STRING { ECPrivateKey { version, privateKey } } }`)
- Edge case: the 32-byte PBKDF2 output must be a valid P-256 scalar (in range [1, n-1] where n is the curve order). The probability of being out of range is ~2^-128 (negligible), but should we handle it?
- Is there a simpler approach? E.g., can `crypto.subtle.importKey('jwk', ...)` accept an EC JWK with only `d` and `crv` (no `x`/`y`)? (Probably not per spec, but worth checking.)
- Alternative: use `crypto.subtle.deriveKey` with HKDF or PBKDF2 to get raw bits, then construct the JWK with computed public coordinates. But computing the public point requires EC point multiplication, which Web Crypto doesn't expose as a standalone operation.

### 2. Replace `generateSigningKeyPair()` in `crypto.js`

Replace with a `deriveSigningKeyPair(passphrase)` function that implements the deterministic derivation. Remove `generateSigningKeyPair` entirely.

### 3. Update `init.js`

- Derive signing key pair from passphrase instead of generating randomly
- Optionally cache derived keys in IDB for performance (avoids PBKDF2 + import on every page load)
- When passphrase changes (paste from another device), invalidate cached keys and re-derive
- Remove the generate-if-missing logic; replace with derive-always (or derive-if-cache-miss)

### 4. Remove `owner` field

- **`chartState.js`**: Remove `owner: null`
- **`syncClient.js`**: Replace all `chartData.owner === userId` checks with `chartData.publicKey === signingPublicKeyB64`
- **`syncClient.js`**: Replace `chart.owner && chart.owner !== userId` guard in `pushChart()` with `chart.publicKey && chart.publicKey !== signingPublicKeyB64`
- **`syncClient.js`**: Legacy detection changes from `!chartData.owner` to `!chartData.publicKey`
- **`stampOwnerFields()`**: Simplify — only sets `publicKey` when it's null (first push of a new chart). No `owner` to set.

### 5. Backward Compatibility

- Legacy charts (pre-signing) have no `publicKey` field → `verifyPull` accepts without verification (same logic, different field check)
- Charts created during the broken implementation have `owner: null` and `publicKey: null` → also treated as legacy, which is correct since their signatures were made with random device-specific keys that can't be verified cross-device anyway
- The `signature` column on the server is already nullable, so no DB migration needed

## Files to Modify

| File | Changes |
|------|---------|
| `static/Server/crypto.js` | Replace `generateSigningKeyPair()` with `deriveSigningKeyPair(passphrase)` |
| `static/Server/init.js` | Derive keys from passphrase, update caching logic, handle passphrase changes |
| `static/Server/syncClient.js` | Replace `owner`-based checks with `publicKey`-based checks |
| `static/SCC/chartState.js` | Remove `owner` field |

Files that need NO changes: `models.py`, `app.py`, `share_tab.html`, `chartStorage.js`.
