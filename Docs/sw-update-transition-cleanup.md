# Service Worker Update System — Post-Transition Cleanup

## Context

In v0.2.5, the SW update mechanism was replaced:

- **Old system**: `skipWaiting()` + `controllerchange` auto-reload (jumpy, unclear timing)
- **New system**: Health-ping version detection + clickable "update to vX.Y.Z" button in status indicator

`skipWaiting()` and `window.swUpdate()` were intentionally kept as transitional scaffolding. Once all users have loaded the app at least once on v0.2.5+, they can be removed.

## What to remove

### 1. `skipWaiting()` in `service-worker.js`

**Line**: `.then(() => self.skipWaiting())` in the install handler

Remove it so new SWs enter `waiting` state instead of immediately activating. The nuclear update flow in `onlineStatus.js` (`performUpdate()`) handles activation by unregistering + clearing caches + re-registering.

### 2. `window.swUpdate()` in `templates/base.html`

**Lines**: The `window.swUpdate = async function() { ... }` block in the second inline `<script>`.

This console utility is now redundant — `performUpdate()` in `onlineStatus.js` does the same thing. Removing it shrinks the inline script and simplifies CSP.

**After removing, regenerate CSP hashes**: `./scripts/build/CSP/update-hashes.sh`

## How to verify users have migrated

Users on the new system will have:
- A `<meta name="app-version">` tag in their cached HTML
- The health-ping version check running in `onlineStatus.js`
- No `controllerchange` listener

There's no server-side telemetry for this. A reasonable heuristic: wait until the version has been deployed long enough that all active users have opened the app at least once (the SW update + one final auto-reload transitions them automatically).
