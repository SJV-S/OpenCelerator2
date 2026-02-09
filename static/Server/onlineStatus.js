// Online/Offline status indicator
// Displays connection status in top-right corner and provides isOnline() check

let statusElement = null;
let appVersion = null;

/**
 * Check if the browser is online
 */
export function isOnline() {
    return navigator.onLine;
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

    if (navigator.onLine) {
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

    window.addEventListener('online', () => {
        console.log('[Status] Back online');
        updateStatus();
    });

    window.addEventListener('offline', () => {
        console.log('[Status] Gone offline');
        updateStatus();
    });
}
