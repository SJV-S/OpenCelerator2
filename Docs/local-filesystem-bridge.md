# Local Filesystem Bridge — Proposal

## Problem

Data is collected on the local system via external means (scripts, AI bots, sensors, tools, etc.). That data needs to appear in the browser-based SCC app, which uses IndexedDB as its data store. The browser sandbox prevents external processes from writing to IndexedDB directly.

## Strategy

Run a local server that watches an inbox folder for chart files, then encrypts, signs, and pushes them directly to the zero-knowledge remote server — piggybacking on the existing sync infrastructure. Both local and remote browsers pull updates via the sync mechanisms already in place.

```
External process writes chart file to inbox folder
    -> Local relay detects new/updated file
        -> Relay encrypts (AES-GCM) + signs (ECDSA) the chart data
            -> Relay pushes to remote zero-knowledge server via existing sync API
                -> All browsers (local + remote) pull via existing sync flow
```

No new browser-side sync code. No second sync path. The relay is the only new component.

## Design

### Relay Server

A standalone Python script (not part of the Flask app). Local-only.

**Responsibilities:**

- Watch the inbox folder for new/modified chart files
- Read the user's signing key and chart encryption keys from a local config
- Encrypt chart data (AES-GCM) and sign the payload (ECDSA P-256)
- Push to the remote server via the existing `/api/sync` endpoint
- Respect the same timestamp comparison the existing sync uses — only push when the file is newer than the last push

**Constraints:**

- **Directory jail** — Rooted to a configured inbox folder. Path traversal (`../`) resolved and blocked.
- **Extension whitelist** — Only processes `.json` (and potentially `.csv`) files.
- **Local-only** — Binds to `localhost`, not exposed externally.
- **One-directional** — Reads from the filesystem and pushes to the remote server. Never writes to the filesystem or pulls from the server.

### Inbox Folder Convention

External processes write chart files to a designated folder (e.g., `~/scc-inbox/`). Each file is named `{chartId}.json` and contains a full chart object matching the IndexedDB schema — same fields, same format as a stored chart. The external process is responsible for maintaining the complete chart state (not deltas). The file stays on disk after push — the timestamp comparison prevents redundant pushes.

### Key Material

The relay needs access to:

- **User's ECDSA P-256 private signing key** — for signing payloads (same key stored in IndexedDB's `SCC_Identity` store)
- **Per-chart AES-GCM encryption key** — for encrypting chart data before push (the `chartKey` hex string stored per chart in IndexedDB)
- **User ID and public key** — for the sync API request body

These are exported from the browser once (manually or via a helper) and stored in a local config file the relay reads at startup.

**Security justification:** This does not weaken the trust model. The keys already exist in plaintext in IndexedDB — accessible to anyone with local machine access via browser DevTools. A config file on the same machine has the same local access profile. The browser sandbox protects against remote access, not local access, and both storage locations share the same threat boundary.

### Sync Flow

The relay reuses the existing sync API contract:

1. Read chart JSON from inbox file
2. Encrypt with the chart's AES-GCM key
3. Sign the encrypted payload with the user's ECDSA private key
4. Wrap the chart key with the user's key
5. `POST /api/sync` with the upload payload (same format as `syncClient.js` uses)

On the browser side, nothing changes. The existing pull mechanisms pick up the update:

- **Shared charts:** WebSocket notification triggers `syncChart()` -> `loadChart()` -> replot
- **Sync-enabled charts:** Manifest comparison on page load detects the newer timestamp -> pull -> replot

### Pieces to Build

1. **Relay server** — Standalone Python script with crypto capabilities (ECDSA signing, AES-GCM encryption, key wrapping). Watches inbox folder, pushes to remote server.
2. **Key export utility** — Browser-side helper or script to extract the signing key, chart keys, and user ID from IndexedDB into a config file the relay can read.
3. **Documentation** — Instructions for setting up the inbox folder, exporting keys, and running the relay.

## Open Questions

1. **Watch mechanism** — Should the relay poll the inbox folder on an interval, or use filesystem events (e.g., `inotify` on Linux, `FSEvents` on macOS)? Polling is simpler and portable; filesystem events are more responsive.

2. **Key export UX** — How should the user get their keys from the browser to the relay config? Options:
   - Manual: DevTools -> IndexedDB -> copy values
   - A button in the app's settings that downloads a config file
   - A one-time browser endpoint that the relay fetches on first run

3. **Multi-chart support** — The relay needs to know which chart key belongs to which chart file. The config could map `{chartId: chartKeyHex}`, or the relay could read the `chartKey` field from the chart JSON itself (since the external process writes full chart objects that mirror the IndexedDB schema, and `chartKey` is part of that schema).

4. **CSV support** — If external tools produce CSV rather than JSON, the relay (or a companion script) would need to convert CSV rows into the chart JSON schema before encrypting and pushing. This could be a separate concern layered on top.

## Future Possibility: Remote Trusted Relay

The relay doesn't strictly need to run on localhost. Because it pushes to the zero-knowledge server via the standard sync API, it could run on any machine that has the key material — including a remote server owned by an individual or group.

This would create a two-tier architecture:

- **Zero-knowledge server** — Public distribution layer. Shared infrastructure that serves anyone. Stores encrypted blobs it cannot read. No trust required.
- **Trusted relay** — Private ingestion layer. Belongs to a specific individual or group. Knows their keys, handles their plaintext data. Bridges external data sources into the sync pipeline.

The zero-knowledge server doesn't need to know the trusted relay exists. From its perspective, a push from the relay is indistinguishable from a push from a browser — just a valid signed, encrypted upload.

This is noted here as a natural extension of the design, not a current goal. The immediate focus is a local relay on the same machine.
