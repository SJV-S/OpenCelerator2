// Online/Offline status indicator
// Displays connection status in top-right corner and provides isOnline() check

let statusElement = null;

/**
 * Check if the browser is online
 */
export function isOnline() {
    return navigator.onLine;
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

    if (navigator.onLine) {
        statusElement.textContent = 'online';
        statusElement.style.color = '#059669';
        statusElement.style.backgroundColor = 'rgba(209, 250, 229, 0.9)';
        statusElement.style.opacity = '1';
    } else {
        statusElement.textContent = 'offline';
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

    window.addEventListener('online', () => {
        console.log('[Status] Back online');
        updateStatus();
    });

    window.addEventListener('offline', () => {
        console.log('[Status] Gone offline');
        updateStatus();
    });
}
