// Online/Offline status indicator
// Pings /api/health to detect server reachability

import { TIMING_MS, APP_VERSION } from '../SCC/config.js';
import { eventBus, EVENTS } from '../SCC/eventBus.js';
import { api } from './client-api.js';

let _serverReachable = true;    // optimistic until first ping
let _pingIntervalId = null;

const HEALTH_URL = '/api/health';
const _jsVersion = APP_VERSION;

/**
 * Check if the server is reachable (cached result from periodic ping)
 */
export function isOnline() {
    return _serverReachable;
}

/**
 * Return the current status text and reachable flag.
 * @returns {{ text: string, reachable: boolean }}
 */
export function getStatusText() {
    const prefix = _jsVersion ? `v${_jsVersion} · ` : '';
    return {
        text: `${prefix}${_serverReachable ? 'online' : 'offline'}`,
        reachable: _serverReachable,
    };
}

/**
 * Ping the server health endpoint
 */
async function pingServer() {
    if (!navigator.onLine) {
        setReachable(false);
        return;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMING_MS.HEALTH_PING_TIMEOUT);

        const response = await api(HEALTH_URL, {
            cache: 'no-store',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        setReachable(response.ok);
    } catch {
        setReachable(false);
    }
}

/**
 * Update reachable state
 */
function setReachable(reachable) {
    const changed = _serverReachable !== reachable;
    _serverReachable = reachable;
    if (changed) {
        console.log(`[Status] ${reachable ? 'Server reachable' : 'Server unreachable'}`);
        if (reachable) {
            eventBus.emit(EVENTS.SYNC_SERVER_RECONNECTED);
        }
    }
}

// Self-initialize ping loop on import (no DOM element)
pingServer();
_pingIntervalId = setInterval(pingServer, TIMING_MS.HEALTH_PING_INTERVAL);

window.addEventListener('offline', () => {
    console.log('[Status] Browser reports offline');
    setReachable(false);
});

window.addEventListener('online', () => {
    console.log('[Status] Browser reports online — verifying');
    pingServer();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        pingServer();
    }
});
