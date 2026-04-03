# Socket.IO Source Map 404

## Issue

Browser dev tools reported a 404 on the production server:

```
Source map error: request failed with status 404
Resource URL: https://scc.pigeondev.net/static/lib/socket.io-4.7.4.min.js
Source Map URL: socket.io.min.js.map
```

`socket.io-4.7.4.min.js` contained a `//# sourceMappingURL=socket.io.min.js.map` comment at the end, but the `.map` file is not shipped with the project.

## Temporary Fix Applied

Removed the `sourceMappingURL` comment from `static/lib/socket.io-4.7.4.min.js`. This stops the browser from requesting the missing file.

## Proper Fix (TODO)

Obtain the matching `socket.io.min.js.map` from the socket.io 4.7.4 release and place it at `static/lib/socket.io.min.js.map`. This restores full source-mapped debugging in dev tools.

The map file is available in the socket.io npm package:

```
node_modules/socket.io-client/dist/socket.io.min.js.map
```

Or from the socket.io CDN release assets for version 4.7.4. Once added, restore the `sourceMappingURL` comment in the minified file and update the SRI hash per the instructions in CLAUDE.md.
