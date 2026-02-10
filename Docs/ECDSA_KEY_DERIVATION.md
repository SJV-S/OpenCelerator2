# Deterministic ECDSA P-256 Key Derivation: Design Decision Report

## Summary

The signing system derives ECDSA P-256 key pairs deterministically from the user's BIP39 passphrase. Web Crypto handles 95% of the work (PBKDF2, key import, signing, verification). A single missing Web Crypto capability — elliptic curve point multiplication — is filled by ~60 lines of inline BigInt arithmetic. No external libraries are used.

## Why Custom Code Is Needed

Web Crypto provides two ways to import a private key: PKCS8 (binary) and JWK (JSON). Both require the **public key coordinates (x, y)** alongside the private scalar. You cannot provide just the private number and let Web Crypto compute the public part.

Computing the public key from the private scalar requires elliptic curve point multiplication (`d × G`), which Web Crypto never exposes as a standalone operation. This is a known design gap — W3C issues #212 (2018) and #356 remain open with no browser vendor interest in resolving them.

The chicken-and-egg problem:
- To **import** a private key → you need the public key coordinates
- To **compute** the public key coordinates → you need point multiplication
- Web Crypto **does not expose** point multiplication

## What the Custom Code Does

Given a private scalar `d` (a large number) and the P-256 generator point `G` (a fixed, published starting point on the curve), compute the public point `Q = d × G`. This "multiplication" is a geometric operation: repeatedly doubling a point and adding points together on the elliptic curve.

Once `Q = (x, y)` is computed, the custom code is done. Web Crypto takes over for key import, signing, and verification.

### The functions

| Function | Purpose |
|----------|---------|
| `mod(a, m)` | Modular reduction. Handles negative BigInt remainders. |
| `modInv(a, m)` | Modular multiplicative inverse via extended Euclidean algorithm. |
| `pointAdd(x1, y1, x2, y2)` | Elliptic curve point addition and doubling. Uses `(3x² + a) / 2y` for doubling — the `+a` term is critical because P-256 has `a = -3` (unlike secp256k1 where `a = 0`). |
| `scalarMul(k, px, py)` | Double-and-add scalar multiplication. Computes `k × (px, py)` in ~256 iterations. |
| `bytesToBigInt(bytes)` / `bigIntToBytes(n, len)` | Convert between Uint8Array and BigInt (big-endian). |
| `buildPkcs8P256(d, x, y)` | Constructs the fixed 138-byte PKCS8 DER structure for P-256. |

### The derivation flow (`deriveSigningKeyPair`)

1. **PBKDF2** (Web Crypto) — derive 32 bytes from passphrase with salt `"ecdsa-signing"`, 100k iterations
2. **Scalar validation** — confirm the 32-byte value falls in [1, n-1]; rehash if not (~2^-32 probability)
3. **Point multiplication** (custom code) — compute public point `Q = d × G`
4. **PKCS8 import** (Web Crypto) — build DER blob, import as CryptoKey
5. **Public key extraction** (Web Crypto) — export private key as JWK, re-import just {x, y} as verify-only key

## Source and Provenance

**Curve parameters** (P, A, N, Gx, Gy): NIST P-256 constants from [FIPS 186-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-4.pdf), Section D.1.2.3. These are the same constants hardcoded in every browser's crypto backend (Chrome/BoringSSL, Firefox/NSS, Safari/Security.framework).

**Point addition formulas**: Standard affine coordinate formulas for short Weierstrass curves (`y² = x³ + ax + b`), found in any elliptic curve cryptography textbook or reference (e.g., [SEC 1 v2](https://www.secg.org/sec1-v2.pdf), Section 2.2.1).

**Scalar multiplication**: The double-and-add algorithm. Equivalent to square-and-multiply for modular exponentiation. Universal in EC implementations.

**PKCS8 structure**: Defined by [RFC 5915](https://www.rfc-editor.org/rfc/rfc5915) (EC private key) wrapped in [RFC 5958](https://www.rfc-editor.org/rfc/rfc5958) (PKCS#8). The 138-byte layout is fixed for P-256 — 36-byte prefix, 32-byte private scalar, 6-byte midfix, 64-byte uncompressed public point. Browsers require the public point to be present (Chrome, Firefox, and Safari all reject PKCS8 EC keys without it).

**Extended Euclidean algorithm**: Number theory dating to Euclid (~300 BC). The implementation is the standard iterative form.

## Verification

### Self-checking by design

Web Crypto **validates the public key against the private scalar** during `importKey('pkcs8', ...)`. If any part of the custom code produced an incorrect result — wrong curve constant, missing `+A` in the doubling formula, off-by-one in byte layout — the import would throw `DataError`. A buggy implementation cannot silently produce a working key pair.

### Known test vectors

- `1 × G` must return `(Gx, Gy)` — the generator point itself
- `2 × G` must return x = `0x7cf27b188d034f7e8a52380304b51ac3c08969e277f21b35a60b48fc47669978`

These are published NIST values verifiable in the browser console.

### Determinism

The same passphrase always produces the same key pair on every device and browser. This is the core property that enables cross-device identity.

## What the Custom Code Does NOT Do

- Does not sign or verify anything (Web Crypto does that)
- Does not generate random numbers (Web Crypto does that for encryption IVs)
- Does not serialize keys for storage (Web Crypto does that)
- Does not handle secret material beyond the one-way `d → Q` computation, which produces the public key (public by definition)

## Performance

The derivation runs once per page load during `initServerSync()`:
- PBKDF2 (100k iterations): ~10-20ms
- BigInt scalar multiplication: ~5-15ms
- Total: ~20-50ms, imperceptible next to IDB I/O and Plotly rendering

No caching in IndexedDB. The passphrase is the single persistent root; everything else is derived in memory.

## Browser Compatibility

Chrome, Firefox, and Safari all handle the 138-byte PKCS8 import correctly. Firefox historically lacked PKCS8 EC support before version 92 (September 2021); all current versions are safe. All three browsers use the `id-ecPublicKey` OID (`1.2.840.10045.2.1`), which the DER template provides.

## Alternatives Considered and Rejected

| Approach | Why it fails |
|----------|-------------|
| PKCS8 without public key BIT STRING | All browsers reject it (`DataError`). Chrome's test suite explicitly marks this as expected failure. |
| JWK with only `d` and `crv` (no x/y) | Spec requires x and y for EC JWKs. Browsers throw on import. |
| ECDH trick (import G as public key, deriveBits to get d×G) | ECDH key import has the same public-key requirement. |
| JWK swap (generate random key, export, replace d) | Browsers validate d against x/y on import. Mismatched values cause `DataError`. |
| Seeded `generateKey` | `crypto.getRandomValues()` provides no seeding mechanism. |
| External library (elliptic.js, noble-curves, etc.) | Adds supply-chain risk and bundle size for a single operation that takes 60 lines inline. |

## Files

| File | Role |
|------|------|
| `static/Server/crypto.js` | Contains all custom code (curve constants, point math, PKCS8 builder, `deriveSigningKeyPair`) |
| `static/Server/init.js` | Calls `deriveSigningKeyPair(passphrase)` at startup |
| `static/Server/syncClient.js` | Consumes the derived CryptoKey objects for signing/verification |
