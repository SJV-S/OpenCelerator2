# Presence System for Shared Charts

## Context
Shared charts use WebSocket rooms (`chart:{uuid}`) for real-time sync notifications. The server already tracks which sockets are in which rooms via Flask-SocketIO, and the client already sends `user_id` in `join_chart` — but the server ignores it. This plan adds presence tracking so collaborators can see who else is currently viewing a shared chart.

**Key constraint:** The server never sees display names. It only tracks `user_id` values (SHA-256 hex of public keys). The client resolves names locally from `chartState.collaborators` and `chartState.ownerName`.

## File Changes

### 1. `app.py` — Server-side presence tracking

Add two in-memory dicts (single-process, no Redis needed):
```python
# chart room → {sid: user_id}
_chart_presence = defaultdict(dict)
# sid → set of room names (for disconnect cleanup)
_sid_rooms = defaultdict(set)
```

**Modify `join_chart`:**
- Read `user_id` from data (currently ignored)
- Store in `_chart_presence[room][request.sid] = user_id`
- Store in `_sid_rooms[request.sid].add(room)`
- Emit `presence_update` with `{ user_ids: [list of unique user_ids in room] }` to the room

**Modify `leave_chart`:**
- Remove `request.sid` from `_chart_presence[room]` and `_sid_rooms`
- Emit `presence_update` to the room with updated list

**Add `disconnect` handler:**
- Iterate `_sid_rooms.pop(request.sid, set())`
- For each room, remove from `_chart_presence`, emit `presence_update` to that room
- Clean up empty rooms from `_chart_presence`

### 2. `static/Server/wsClient.js` — Listen for presence events

Add a `presence_update` socket listener inside `connectToChart()`:
```javascript
socket.on('presence_update', (data) => {
    eventBus.emit(EVENTS.PRESENCE_UPDATED, data);
});
```

This means wsClient.js will import `eventBus` and `EVENTS`. This is clean — it's a transport-layer notification, and using the eventBus avoids changing the `connectToChart` function signature.

### 3. `static/SCC/eventBus.js` — Add event constant

Add to the Sync Events section:
```javascript
PRESENCE_UPDATED: 'sync:presence_updated',
```

### 4. `static/SCC/ui/presence.js` — New file: name resolution + UI

**Lookup table:** On `STORAGE_CHART_LOADED` and `SYNC_CHART_UPDATED`, build a `Map<userId, displayName>` by hashing each known public key:
- Hash `chartState.publicKey` → map to `chartState.ownerName`
- Hash each `chartState.collaborators[i].publicKey` → map to `.displayName`
- Also store own user_id (from `init.js` exports) to identify self

**Render:** On `PRESENCE_UPDATED`, receive `{ user_ids: [...] }`:
- Filter out own user_id
- Look up each in the map → display name or "(unknown)" fallback
- Render into a container in the share tab

**DOM target:** Insert a `<div id="presence-container">` in `share_tab.html`. The module finds it by ID and populates it.

**What it shows:**
- When alone (no other user_ids after filtering self): nothing / hidden
- When others present: "Currently viewing" header + list of names (or "(unknown)" for unresolved IDs)

### 5. `templates/SCC/menu/share_tab.html` — Add presence container

Add a `<div id="presence-container" class="hidden"></div>` between the share link buttons and the unshare button.

### 6. `static/SCC/main.js` — Import presence module

Add `import './ui/presence.js'` so it initializes on page load. (Self-initializing pattern like `onlineStatus.js`.)

## Event Flow

```
Server                          wsClient.js              eventBus              presence.js
  |                                |                        |                      |
  |--presence_update-------------->|                        |                      |
  |  {user_ids: [a,b,c]}          |--PRESENCE_UPDATED------>|                      |
  |                                |  {user_ids: [a,b,c]}   |--------------------->|
  |                                |                        |   filter self,       |
  |                                |                        |   resolve names,     |
  |                                |                        |   render DOM         |
```

## userId → displayName Resolution

```javascript
async function buildLookup() {
    const map = new Map();
    if (chartState.publicKey) {
        const ownerId = await sha256(chartState.publicKey);
        map.set(ownerId, chartState.ownerName || '(unnamed)');
    }
    for (const c of chartState.collaborators || []) {
        const cId = await sha256(c.publicKey);
        map.set(cId, c.displayName || '(unnamed)');
    }
    return map;
}
```

Rebuilt on `STORAGE_CHART_LOADED` and `SYNC_CHART_UPDATED` (collaborators may change).

## Edge Cases

- **Alone on chart:** Presence container stays hidden (only self in user_ids)
- **Unknown user_id:** Shows "(unknown)" — could be a viewer who joined via view link and never pushed (so they're not in collaborators array)
- **Reconnect:** Socket.IO reconnect → re-emits `join_chart` → server re-adds to tracking → broadcasts `presence_update` → UI refreshes
- **Tab sleep/wake:** Visibility handler reconnects socket → triggers join → fresh presence_update
- **Non-shared charts:** wsClient only connects for shared charts, so no presence events fire

## Verification
- Open same shared chart in two browser tabs/profiles
- Share tab should show the other user's name under "Currently viewing"
- Close one tab → other tab's presence indicator should update within seconds
- Reconnect test: put laptop to sleep, wake → presence should recover
