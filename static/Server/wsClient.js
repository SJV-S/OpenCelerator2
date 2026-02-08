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
}

/**
 * Disconnect from WebSocket and leave the chart room.
 */
export function disconnectFromChart() {
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