# SCCChart Plugin — Storage Integration Proposal

## Context

The SCCChart plugin is storage-agnostic. It renders chart data, manages user interactions, and calls `onStateChanged` with a state snapshot whenever something changes. It has no opinion about where that data goes.

However, different consuming apps have fundamentally different storage needs. This proposal defines three official integration modes that the plugin supports, so that consuming apps — and the AIs or developers building them — have a clear map of what is required for each.

---

## Mode 1 — Full TC2 Compatibility

### What this means

The consuming app uses TC2's storage infrastructure: local IndexedDB plus optional server sync, with the full crypto identity model. Charts are stored and synced in exactly the same way TC2 itself does. The consuming app is essentially a different interface on top of TC2's storage layer.

### What the plugin provides

The plugin ships the full TC2 storage stack as part of this mode:

- Crypto key derivation (ECDSA P-256 from passphrase via PBKDF2)
- Local IndexedDB persistence
- Server sync (upload, download, conflict resolution)
- Chart encryption and signing

The consuming app does not reimplement any of this.

### What the consuming app provides

- **Server URL** — the TC2-compatible server to sync with. Not hardcoded.
- **Passphrase handling** — one of two cases:
  - **Existing user**: the app supplies an existing passphrase, the plugin derives the identity from it
  - **New user**: the app triggers passphrase generation, the plugin creates a new identity and returns the passphrase for the app to present to the user

### What the consuming app does not need to handle

- Key derivation
- Signing
- Encryption/decryption
- IndexedDB schema
- Sync logic

### Server requirements

The server must implement TC2's sync API. See TC2's backend (`app.py`, `routes/sync.py`, `routes/charts.py`, `routes/sharing.py`) for the full contract.

---

## Mode 2 — Unencrypted Remote Storage

### What this means

The consuming app has its own backend. Charts are stored as plain JSON. No crypto, no local storage. The plugin saves and loads by calling the consuming app's backend directly.

### What the plugin provides

- A documented backend contract (see below) so developers know exactly what endpoints to implement
- Calls to those endpoints on every state change and on load

### What the consuming app provides

- **Endpoint configuration** — the URLs the plugin should call for save and load operations
- **Authentication** — entirely the consuming app's responsibility. The plugin accepts whatever auth mechanism the consuming app wires up (headers, cookies, tokens). The plugin does not define or enforce an auth model.

### Backend contract

A backend for this mode must implement the following:

**Save chart**
- Called whenever `onStateChanged` fires
- Receives the full chart state snapshot as JSON
- Must persist it associated with whatever identifier the consuming app uses (deck ID, user ID, etc.)
- Must return a success/failure response

**Load chart**
- Called on initialization or when switching charts
- Returns the previously saved chart state snapshot as JSON, or null if none exists

**Data shape**
- The payload is whatever `getState()` returns — a plain JSON object containing series data, line objects, display settings, and chart configuration
- No encryption, no signatures, no wrapped keys
- The consuming app's backend stores and returns it verbatim

### What the consuming app does not need to handle

- Any chart rendering logic
- State diffing or merging

### What the consuming app is fully responsible for

- Authentication between the plugin and the backend
- User identity and access control
- Whether to store per-user, per-deck, or any other organization scheme
- Backup, versioning, deletion

---

## Mode 3 — Local Storage Only

### What this means

Charts live entirely in the browser's IndexedDB. No server, no crypto, no network requests. Fully offline.

### What the plugin provides

- Full IndexedDB persistence, handled internally
- No configuration required from the consuming app

### What the consuming app provides

- Nothing. Opt in and it works.

### Limitations

- Data lives in the browser. Clearing browser storage loses it.
- No sync across devices.
- No backup unless the consuming app implements its own export mechanism.

---

## Choosing a Mode

| | Local storage | Remote storage | Crypto | Server required |
|---|:-:|:-:|:-:|:-:|
| Mode 1 — TC2 compatible | Yes | Optional | Yes | TC2-compatible |
| Mode 2 — Unencrypted remote | No | Yes | No | Consumer-provided |
| Mode 3 — Local only | Yes | No | No | No |

Modes are selected at plugin initialization and are mutually exclusive.
