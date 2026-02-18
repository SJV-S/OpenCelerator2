// Online/Offline status indicator + version update detection
// Pings /api/health to detect server reachability and version changes

import { TIMING_MS } from '../SCC/config.js';
import { eventBus, EVENTS } from '../SCC/eventBus.js';
import { api } from './client-api.js';

let statusElement = null;
let _serverReachable = true;    // optimistic until first ping
let _pingIntervalId = null;
let _updateVersion = null;      // non-null when server reports a newer version
let _versionNoticeReported = false;

const HEALTH_URL = '/api/health';
const _pageVersion = document.querySelector('meta[name="app-version"]')?.content || null;

/**
 * Check if the server is reachable (cached result from periodic ping)
 */
export function isOnline() {
    return _serverReachable;
}

/**
 * Ping the server health endpoint and check for version updates
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

        if (response.ok) {
            const data = await response.json();
            if (_pageVersion && data.v && data.v !== _pageVersion) {
                _updateVersion = data.v;
                if (!_versionNoticeReported) {
                    _versionNoticeReported = true;
                    api('/api/version-notice', {
                        method: 'POST',
                        body: { comment: `${_pageVersion} → ${data.v}` },
                    }).catch(() => {});
                }
            }
        }
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
        if (reachable) {
            eventBus.emit(EVENTS.SYNC_SERVER_RECONNECTED);
        }
    }
    updateStatus();
}

/**
 * Unregister SW, clear all caches, re-register, and reload
 */
async function performUpdate() {
    if (!('serviceWorker' in navigator)) {
        location.reload();
        return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.unregister();
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await navigator.serviceWorker.register('/service-worker.js');
    location.reload();
}

/**
 * Create and inject the status indicator element
 * Mounts inside .chart-menu-tabs (sidebar tab column) at the bottom,
 * or falls back to document.body for non-chart pages.
 */
function createStatusElement() {
    if (statusElement) return statusElement;

    statusElement = document.createElement('div');
    statusElement.id = 'online-status';

    const tabsColumn = document.querySelector('.chart-menu-tabs');
    if (tabsColumn) {
        statusElement.style.cssText = `
            margin-top: auto;
            font-size: 11px;
            font-family: "Open Sans", sans-serif;
            padding: 6px 0;
            text-align: center;
            transition: opacity 0.3s, background-color 0.3s;
            pointer-events: none;
        `;
        tabsColumn.appendChild(statusElement);
    } else {
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
    }

    statusElement.addEventListener('click', () => {
        if (_updateVersion) performUpdate();
    });

    return statusElement;
}

/**
 * Update the status indicator display
 */
function updateStatus() {
    if (!statusElement) createStatusElement();

    if (_updateVersion) {
        statusElement.textContent = `update to v${_updateVersion}`;
        statusElement.style.color = '#c2410c';
        statusElement.style.backgroundColor = 'rgba(255, 237, 213, 0.9)';
        statusElement.style.opacity = '1';
        statusElement.style.pointerEvents = 'auto';
        statusElement.style.cursor = 'pointer';
        return;
    }

    const prefix = _pageVersion ? `v${_pageVersion} · ` : '';

    if (_serverReachable) {
        statusElement.textContent = `${prefix}online`;
        statusElement.style.color = '#059669';
        statusElement.style.backgroundColor = 'rgba(209, 250, 229, 0.9)';
    } else {
        statusElement.textContent = `${prefix}offline`;
        statusElement.style.color = '#dc2626';
        statusElement.style.backgroundColor = 'rgba(254, 226, 226, 0.9)';
    }
    statusElement.style.opacity = '1';
    statusElement.style.pointerEvents = 'none';
    statusElement.style.cursor = 'default';
}

/**
 * Initialize the online status indicator
 * Call this on page load
 */
export function initOnlineStatus() {
    createStatusElement();
    updateStatus();

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

// Self-initialize on import
initOnlineStatus();