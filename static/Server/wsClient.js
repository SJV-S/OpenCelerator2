/**
 * WebSocket client for shared chart real-time notifications
 *
 * Uses Socket.IO for transport (auto-reconnect, fallback to polling).
 * Receives lightweight "chart_updated" events; does NOT receive chart data
 * over the socket. Data is fetched over HTTP using existing endpoints.
 */

let socket = null;
let currentChartId = null;
let onChartUpdated = null;

/**
 * Connect to the WebSocket server and join a chart room.
 * @param {string} chartId - The chart UUID to subscribe to
 * @param {Function} callback - Called with { chartUuid, updatedAt } on remote update
 */
export function connectToChart(chartId, callback) {
    disconnectFromChart();

    currentChartId = chartId;
    onChartUpdated = callback;

    // io() is globally available from the Socket.IO CDN script
    socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000
    });

    socket.on('connect', () => {
        console.log('[WS] Connected, joining chart room:', chartId);
        socket.emit('join_chart', { chart_uuid: chartId });
    });

    socket.on('chart_updated', (data) => {
        console.log('[WS] Chart updated notification:', data.chart_uuid);
        if (data.chart_uuid === currentChartId && onChartUpdated) {
            onChartUpdated({
                chartUuid: data.chart_uuid,
                updatedAt: data.updated_at
            });
        }
    });

    socket.on('reconnect', () => {
        console.log('[WS] Reconnected, rejoining chart room');
        socket.emit('join_chart', { chart_uuid: chartId });
        // Force a catch-up check — may have missed updates while disconnected
        if (onChartUpdated) {
            onChartUpdated({ chartUuid: chartId, updatedAt: null });
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('[WS] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
        console.warn('[WS] Connection error:', err.message);
    });

    // When tab becomes visible again, check connection health
    document.addEventListener('visibilitychange', onVisibilityChange);
}

function onVisibilityChange() {
    if (document.visibilityState !== 'visible' || !socket) return;

    if (!socket.connected) {
        console.log('[WS] Tab visible, socket disconnected — reconnecting');
        socket.connect();
    } else {
        // Connected but may have missed updates during background/sleep
        if (onChartUpdated && currentChartId) {
            onChartUpdated({ chartUuid: currentChartId, updatedAt: null });
        }
    }
}

/**
 * Disconnect from WebSocket and leave the chart room.
 */
export function disconnectFromChart() {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (socket) {
        if (currentChartId) {
            socket.emit('leave_chart', { chart_uuid: currentChartId });
        }
        socket.disconnect();
        socket = null;
    }
    currentChartId = null;
    onChartUpdated = null;
}

/**
 * Check if WebSocket is currently connected.
 * @returns {boolean}
 */
export function isConnected() {
    return socket !== null && socket.connected;
}

/**
 * Check if a WebSocket exists (connected or reconnecting).
 * Use this to avoid creating duplicate sockets while one is already trying to reconnect.
 * @returns {boolean}
 */
export function hasSocket() {
    return socket !== null;
}