# Design Proposal: Local Backup via File System Access API

## Problem

Users — particularly older, less technical users — want to see backup files in a folder on their local system. The server already stores backups, but this creates a single point of failure. The PWA browser sandbox prevents silent writes to the local filesystem.

## Constraints

- No native app installs (triggers virus warnings, defeats the purpose of a PWA)
- No browser extensions
- No dependency on third-party APIs (Dropbox, Google Drive, etc.)
- No recurring permission prompts
- Minimal user interaction per backup

## Solution

Use the File System Access API's `showSaveFilePicker` to write a real file to a user-chosen folder, triggered by an in-app reminder system.

### User flow

**One-time setup:**

1. User sets their preferred reminder interval in app settings (e.g. weekly, monthly)

**Each backup:**

1. On app load, check if the reminder interval has elapsed since the last backup
2. If due, display a banner prompting the user to back up
3. User clicks a single "Back up now" button
4. Native Save As dialog opens, pre-navigated to the same folder as last time, with a filename like `backup-2026-02-12.json` pre-filled
5. User clicks Save
6. File is written directly to the chosen folder

**Total interaction: two clicks.** The dialog remembers the folder after first use.

### Technical implementation

```js
async function triggerBackup(data) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const today = new Date().toISOString().split('T')[0];

  if ('showSaveFilePicker' in window) {
    const handle = await window.showSaveFilePicker({
      id: 'backup',
      suggestedName: `backup-${today}.json`,
      types: [{ accept: { 'application/json': ['.json'] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    // Fallback for Firefox/Safari
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
```

### Reminder system

- Store `lastBackupDate` and `reminderIntervalDays` in IndexedDB
- On each app load, compare `Date.now()` against `lastBackupDate + intervalDays`
- If elapsed, render a non-dismissable (or persistent) banner with the backup button
- After successful backup, update `lastBackupDate`

No push notifications. No service worker involvement. Reminder only fires when the app is open.

### Browser support

| Browser        | Behavior                                                                 |
|----------------|--------------------------------------------------------------------------|
| Chrome / Edge  | Full experience. `showSaveFilePicker` with remembered folder and filename. |
| Firefox        | Fallback. `<a download>` sends file to default Downloads folder silently. |
| Safari         | Fallback. Same `<a download>` behavior.                                  |

### Data resilience

The architecture is distributed with no single point of failure:

- **Server:** already stores backups via existing sync
- **Local filesystem:** real file in a real folder, independent of the browser and server

Either copy can be lost without data loss. The browser's IndexedDB/local storage is treated as a cache, not a source of truth.

## What this proposal does not cover

- Backup file format and schema
- Restore flow (importing a backup file back into the PWA)
- Encryption of local backup files
- Automatic/silent backups (impossible without a user gesture per browser security policy)
