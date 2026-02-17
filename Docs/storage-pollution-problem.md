# Storage Pollution Problem

## The Problem

The `/api/sync` endpoint accepts chart uploads from any client. A `user_id` is a SHA-256 hash of a public key — there is no account creation step, no email verification, no server-side identity validation. Any client can generate a key pair and start uploading.

An attacker can POST to `/api/sync` with fabricated `user_id` values and random UUIDs, creating chart blobs that no legitimate user will ever pull. These blobs accumulate in the database indefinitely.

The existing purge mechanism (`purge_if_over_limit`) runs hourly and evicts charts by `last_modified` ascending — oldest first. Garbage blobs have recent timestamps, so they survive while legitimate old charts get deleted to free space. The purge makes the attack worse.

Chart UUIDs are 128-bit random values and cannot be guessed or enumerated, so an attacker cannot overwrite existing charts without prior access (e.g., being a collaborator). Storage pollution is the primary unauthenticated attack vector.

## Current Defenses

- **IP-based rate limiting** on `/api/sync` via Flask-Limiter
- **Client-side signature verification** (`verifyPull`) rejects tampered charts on pull — but this doesn't prevent garbage from being stored server-side
- **Storage purge** — evicts oldest charts when total storage exceeds a configured limit, but as noted above, this favors garbage over legitimate data

## Proposed Mitigations

### Rate Limiting per Public Key

Cap the number of write operations per `user_id` per time window (e.g., N chart uploads per hour). Simple to implement alongside the existing IP-based rate limiting. A spammer can rotate keys, but this increases cost when combined with other mitigations.

### Storage Quotas per Public Key

Each `user_id` gets a fixed byte budget. Once a key's total stored data reaches the limit, further uploads are rejected. Forces spammers to generate new keys constantly to continue polluting storage.

### Proof-of-Work on Key Creation

Require clients to solve a computational puzzle before their first write operation. Makes bulk identity generation CPU-expensive. Legitimate users experience a one-time delay; spammers multiplying across thousands of keys pay a significant cost. Tuning difficulty is an ongoing concern, and low-power clients pay a real cost.

### Smarter Purge Ordering

Change the eviction strategy to prioritize charts that are more likely to be garbage — for example, charts that have never been pulled, or charts from `user_id` values that have created an abnormally high number of charts in a short window — before falling back to oldest-first for the remainder.
