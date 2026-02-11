// Online/Offline status indicator
// Pings /api/health to detect actual server reachability (not just network adapter state)

import { TIMING_MS } from '../SCC/config.js';

let statusElement = null;
let appVersion = null;
let _serverReachable = true;    // optimistic until first ping
let _pingIntervalId = null;

const HEALTH_URL = '/api/health';

/**
 * Check if the server is reachable (cached result from periodic ping)
 */
export function isOnline() {
    return _serverReachable;
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

        const response = await fetch(HEALTH_URL, {
            method: 'GET',
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
 * Update reachable state and refresh the indicator
 */
function setReachable(reachable) {
    const changed = _serverReachable !== reachable;
    _serverReachable = reachable;
    if (changed) {
        console.log(`[Status] ${reachable ? 'Server reachable' : 'Server unreachable'}`);
    }
    updateStatus();
}

/**
 * Request version from service worker via MessageChannel
 */
function fetchVersion() {
    if (!navigator.serviceWorker) return;

    navigator.serviceWorker.ready.then((registration) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
            appVersion = event.data.version;
            updateStatus();
        };
        registration.active.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    });
}

/**
 * Create and inject the status indicator element
 */
function createStatusElement() {
    if (statusElement) return statusElement;

    statusElement = document.createElement('div');
    statusElement.id = 'online-status';
    statusElement.style.cssText = `
        position: fixed;
        top: 12px;
        right: 12px;
        font-size: 11px;
        font-family: "Open Sans", sans-serif;
        padding: 4px 8px;
        border-radius: 4px;
        z-index: 9999;
        transition: opacity 0.3s, background-color 0.3s;
        pointer-events: none;
    `;

    document.body.appendChild(statusElement);
    return statusElement;
}

/**
 * Update the status indicator display
 */
function updateStatus() {
    if (!statusElement) createStatusElement();

    const prefix = appVersion ? `v${appVersion} · ` : '';

    if (_serverReachable) {
        statusElement.textContent = `${prefix}online`;
        statusElement.style.color = '#059669';
        statusElement.style.backgroundColor = 'rgba(209, 250, 229, 0.9)';
        statusElement.style.opacity = '1';
    } else {
        statusElement.textContent = `${prefix}offline`;
        statusElement.style.color = '#dc2626';
        statusElement.style.backgroundColor = 'rgba(254, 226, 226, 0.9)';
        statusElement.style.opacity = '1';
    }
}

/**
 * Initialize the online status indicator
 * Call this on page load
 */
export function initOnlineStatus() {
    createStatusElement();
    updateStatus();
    fetchVersion();

    navigator.serviceWorker?.addEventListener('message', (event) => {
        if (event.data?.type === 'SW_VERSION') {
            appVersion = event.data.version;
            updateStatus();
        }
    });

    // Immediate first ping, then periodic
    pingServer();
    _pingIntervalId = setInterval(pingServer, TIMING_MS.HEALTH_PING_INTERVAL);

    // Browser offline → instant unreachable (no need to wait for ping)
    window.addEventListener('offline', () => {
        console.log('[Status] Browser reports offline');
        setReachable(false);
    });

    // Browser online → verify with actual server ping
    window.addEventListener('online', () => {
        console.log('[Status] Browser reports online — verifying');
        pingServer();
    });

    // Tab becomes visible → refresh status (intervals throttled in background tabs)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            pingServer();
        }
    });
}