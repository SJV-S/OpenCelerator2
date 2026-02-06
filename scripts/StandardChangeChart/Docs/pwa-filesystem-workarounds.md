# PWA Local Filesystem Access: Limitations and Workarounds

## The Problem

Progressive Web Apps cannot silently access the user's local filesystem. While the **File System Access API** exists in Chromium browsers, it requires:

- Explicit user gesture (file picker dialog)
- Permission re-confirmation after browser restart
- No background/automated access

This makes PWAs unsuitable for workflows requiring automatic, persistent local file access.

## What PWAs *Can* Access Silently

- **Origin Private File System (OPFS)** — sandboxed, browser-managed
- **IndexedDB**
- **localStorage**
- **Cache API**

None of these touch the user's actual filesystem.

## Workaround: Cloud Storage API Bridge

### Pattern

1. User has Dropbox/Google Drive/OneDrive native client syncing a local folder
2. PWA authenticates via OAuth to cloud storage API
3. PWA reads/writes files through API
4. Native client syncs changes to local disk

### Result

PWA effectively writes to local filesystem indirectly.

### Tradeoffs

- Requires native sync client installed and configured
- Sync latency (not instant)
- Internet dependency
- API rate limits
- One-time OAuth permission grant

## Real-World Implementations

The **remoteStorage.js** library implements this pattern with optional Dropbox/Google Drive backends. Apps using it include:

| App | Type | Description |
|-----|------|-------------|
| Papiers | PWA | Note-taking |
| Todonna | PWA | Todo list |
| Notes Together | PWA | Note-taking (installable) |
| Diffuse | Web app | Music player with cloud storage for playlists/settings |
| Litewrite | Web app | Distraction-free writing |
| Kommit | Web app | Flashcards with spaced repetition |
| Road To FIRE | Web app | Portfolio manager |

## Conclusion

For truly automatic local filesystem access, PWAs cannot do it natively. The cloud storage API bridge is a legitimate architectural pattern that trades direct filesystem access for the benefits of the PWA model.
