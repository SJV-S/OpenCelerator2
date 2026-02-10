# Alpha-to-Production Migration Proposal

## Problem

When the app moves from the alpha server (self-hosted Lenovo + Pangolin tunnel) to a production host, the URL origin changes. IndexedDB is sandboxed by origin — the new site cannot read the old site's data. Users have charts both locally (IDB) and on the server (SQLite). We need a zero-friction migration path that doesn't require users to handle passphrases or files.

## Solution: `postMessage` Migration

Use the browser's cross-origin `postMessage` API to transfer IDB data directly between two open tabs. No server round-trip for the data itself.

### User Experience

1. User clicks **"Migrate"** on the old origin
2. A new tab opens automatically to `newhost.com/migrate`
3. The two tabs handshake, then the old tab transfers all IDB data to the new tab
4. The new tab writes everything to its own IDB
5. The new tab shows "Migration complete" and prompts PWA installation if the browser allows it
6. The old tab shows a reminder to uninstall the old PWA (manual step)

One click to initiate. No passphrase entry, no file downloads, no copy/paste.

### Technical Flow

```
OLD ORIGIN                              NEW ORIGIN
─────────                               ──────────
User clicks "Migrate"
    │
    ├─► window.open('newhost.com/migrate')
    │                                    Page loads
    │                                        │
    │   ◄── postMessage({ type: 'ready' }) ──┘
    │        (origin-checked)
    │
    ├─► Read SCC_Charts store (all charts)
    ├─► Read SCC_Identity store (passphrase, keys, prefs)
    │
    ├── postMessage(idbDump, 'newhost.com') ──►
    │                                    Verify event.origin
    │                                    Write to SCC_Charts IDB
    │                                    Write to SCC_Identity IDB
    │                                        │
    │   ◄── postMessage({ type: 'done' }) ───┘
    │
    ▼                                        ▼
"Migration complete.                  "Migration complete.
 You can uninstall                     Install the app?"
 the old app."                         [Install button]
```

### What Gets Transferred

| IDB Database | Store | Contents |
|--------------|-------|----------|
| `SCC_Charts` | `charts` | All chart records (data, keys, metadata) |
| `SCC_Identity` | `credentials` | Passphrase, public key, display name, user preferences |

The data never leaves the browser. No encryption needed for the transfer itself — `postMessage` operates within the browser process.

### Security

- Both sides verify `event.origin` against hardcoded expected origins
- `postMessage` targetOrigin parameter ensures messages only deliver to the correct recipient
- Data stays in-process — never hits the network

### Edge Cases

| Scenario | Handling |
|----------|----------|
| **Popup blocked** | `window.open()` returns `null` — detect and show a message asking the user to allow popups, then retry |
| **User closes old tab early** | New tab's "ready" message gets no response — show timeout message with instructions to retry |
| **New server unreachable** | The new tab fails to load — old tab can detect via a timeout on the "ready" handshake and inform the user |
| **PWA install prompt unavailable** | Browser doesn't fire `beforeinstallprompt` on first visit — fall back to "bookmark this page and revisit to install" |
| **Old PWA uninstall** | No API exists for self-uninstall — show a reminder with platform-specific instructions |

### Prerequisites

- The new server must be running and serving the `/migrate` page before any user clicks the button
- A code update must be pushed to the alpha client adding the "Migrate" button and the `postMessage` sender logic
- The new origin URL is hardcoded in the alpha client's migration code

### What This Does NOT Require

- Server-side encrypted blobs or temporary storage
- One-time tokens, secrets, or TTLs
- Users knowing their passphrase
- Users exporting/importing files
- Both servers sharing a database
