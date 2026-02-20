# Service Worker Integrity Monitor

## Problem

If the TC2 server is compromised, the attacker can serve a tampered service worker. The browser will install it on the next update check, giving the attacker full control of the client — cached assets, IndexedDB, sync logic, everything.

The client-side defenses (signature verification, circuit breaker) buy time but cannot survive SW replacement. We need to detect compromise externally before users are affected.

## Solution

An independent server periodically fetches the production service worker endpoint, hashes the response, and compares it against a known-good SHA-256 hash. If the hash doesn't match and no deployment occurred, it triggers an alert and optionally a DNS failover to a static maintenance page.

## How it works

1. On every deploy, the build process records the SHA-256 of `sw.js` and pushes it to the monitor.
2. The monitor runs a cron job (every 30–60s) that fetches `https://tc2.example.com/sw.js`.
3. It hashes the response body and compares against the expected hash.
4. On mismatch:
   - Alert (SMS, email, webhook — whatever wakes you up).
   - Optionally: call DNS provider API to point the domain at a static page hosted elsewhere.

## Why the service worker

The SW is the single highest-value target. Replacing it gives the attacker control over all cached assets, all fetch interception, and all client-side verification logic. If only one file is monitored, it should be this one.

## Key properties

- **Unforgeable**: The attacker cannot serve different content to the monitor vs. users without identifying the monitor's IP. Rotating source IPs or using multiple monitor locations makes this impractical.
- **Independent**: The monitor runs on a separate provider. Root access on the VPS doesn't help.
- **Simple**: One fetch, one hash comparison, one alert path. No agents on the production box.

## What it doesn't cover

- API-level data tampering (sync responses). The existing client-side ECDSA signature verification handles this.
- Compromise of the monitor itself. Keep it minimal — a small script on a hardened box with no inbound exposure.
- A sophisticated attacker who already knows this monitoring exists (e.g., insider, leaked documentation) could study access logs to fingerprint the monitor's IP before tampering. Mitigated by IP rotation and multiple monitor locations. An attacker working blind has no reason to suspect the check exists — there is zero footprint on the server.
