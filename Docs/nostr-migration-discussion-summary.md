# Nostr Migration: Discussion Summary & Clarifications

## Blob Size — Resolved

The primary risk identified in the research (relay event size limits) is not a blocker. Empirical testing with the largest real chart (201.7 KB raw JSON) confirms:

- DEFLATE compression at level 6 reduces it to 28.1 KB (86% reduction)
- After AES-256-GCM encryption + base64 encoding + event envelope: **~39 KB total**
- 64 KB public relay limit is met with **25 KB margin**

The high compression ratio is driven by the chart data structure: five parallel arrays of 2,308 numeric values with repetitive field names. Pipeline order is critical: **compress → encrypt → base64** (encrypted data is incompressible).

No Blossom blob storage needed. No custom relay size configuration needed. Standard public relays work.

## Collaborative Editing — The Real Open Problem

The only architecturally unresolved challenge. Nostr enforces cryptographic authorship — only the private key holder can publish or update an addressable event under their pubkey. The current Flask system sidesteps this because the server never verifies signatures.

Three candidate models identified:

1. **Owner-mediated merge.** Collaborator publishes edit proposals; owner's client merges and republishes. Requires owner online.
2. **Shared ephemeral key.** Dedicated keypair per shared chart, private key distributed to collaborators. All can publish. Closest to current behavior. Security tradeoff: any collaborator has full write/delete access.
3. **Per-collaborator forks with merge.** Each party maintains their own event, all subscribe to all forks, merge client-side. Most resilient but requires merge logic.

No decision made yet.

## Clarified Non-Concerns

- **P-256 → secp256k1 curve change**: No existing user base. No backwards compatibility burden. Swap crypto cleanly with no migration path needed.
- **Deletion reliability**: Encrypted content makes relay-side persistence acceptable. User experience of deletion is what matters, not guaranteed erasure from all relays.
- **Public relay persistence**: The app is not built for long-term archival. If a chart can't be confirmed on a relay, the client re-uploads. What matters is availability at moments of sync and communication, not permanent storage guarantees.

## Confirmed Technical Stack

| Component | Choice |
|---|---|
| Crypto (signing) | `@noble/curves` — secp256k1 Schnorr (BIP-340), ~1–3 ms/sign |
| Crypto (encryption) | Web Crypto API — AES-256-GCM (stays native) |
| Key derivation | `@scure/bip39` + `@scure/bip32` — NIP-06 path `m/44'/1237'/0'/0/0` |
| Nostr client | `nostr-tools` v2.x (~20–25 KB gzipped) |
| Compression | fflate (DEFLATE, 8 KB bundle) |
| Event kind (charts) | 30078 (NIP-78 application-specific data, addressable) |
| Event kind (shares) | 30079 (addressable, `p`-tagged for recipient) |
| Sync model | NIP-33 addressable events, last-write-wins by `created_at` |
| Real-time | Open REQ subscriptions, relay pushes matching events |
| Conflict resolution | Last-write-wins (same as current system — not a regression) |
