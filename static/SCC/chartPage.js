/**
 * Chart page bootstrap — orchestrates initialization for /chart/:id routes.
 *
 * Loaded by view_chart.html as a module script. Handles:
 * - Storage + sync initialization
 * - Shared chart joining (via URL secret)
 * - Chart loading from IndexedDB
 * - Event listeners + chart rendering
 * - Sync watch + server update checking
 */

import { initializeChart, setupEventListeners } from './main.js';
import { initStorage, loadChart } from './storage/chartStorage.js';
import { joinSharedChart, startSyncWatch, checkForUpdates, isChartOwner } from '../Server/syncClient.js';
import { initServerSync, isSyncEnabled } from '../Server/init.js';
import { icons } from './ui/icons.js';
import { openDB } from '../lib/idb.js';
import { eventBus, EVENTS } from './eventBus.js';
import { chartState } from './chartState.js';

const pathParts = window.location.pathname.split('/'); // /chart/{uuid}
const chartId = pathParts[2];
const shareSecret = window.location.hash?.slice(1) || null; // #<secret>

async function init() {
    await initStorage();
    await initServerSync();

    if (shareSecret) {
        try {
            await joinSharedChart(chartId, shareSecret);
            window.history.replaceState({}, '', `/chart/${chartId}`);
        } catch (err) {
            console.error('Share link failed:', err);
            sessionStorage.setItem('scc-share-error', err.message);
            window.location.href = '/';
            return;
        }
    }

    const success = await loadChart(chartId);
    if (!success) {
        window.location.href = '/';
        return;
    }

    // Default to fullscreen for view-only shared charts
    if (!isChartOwner(chartState) && !chartState.acceptingEdits) {
        document.body.classList.add('fullscreen-mode');
        const btn = document.getElementById('fullscreen-toggle');
        if (btn) btn.innerHTML = icons.fullscreenCompress();
    }

    const menuContent = document.getElementById('chart-menu-content');
    menuContent.classList.remove('menu-loading');
    requestAnimationFrame(() => menuContent.classList.add('visible'));
    setupEventListeners();
    initializeChart();

    // When sync fetches new data, reload into memory and replot
    eventBus.subscribe(EVENTS.SYNC_CHART_UPDATED, async ({ chartId: updatedId }) => {
        if (updatedId === chartId) {
            const oldChartWindow = chartState.chartWindow;
            await loadChart(chartId);

            // Apply chart window change if it differs
            if (chartState.chartWindow !== oldChartWindow) {
                eventBus.emit(EVENTS.CHART_WINDOW_CHANGED, chartState.chartWindow);
            }

            eventBus.emit(EVENTS.DATA_CHART_REFRESH);
        }
    }, true);

    if (chartState.shared || isSyncEnabled()) {
        startSyncWatch(chartId);
    }

    // For non-shared charts with sync enabled, check server for newer version
    if (!chartState.shared && isSyncEnabled()) {
        checkForUpdates([{ chart_uuid: chartId, updated_at: chartState.lastModified || 0 }])
            .then(async ({ downloads, tombstones }) => {
                // Chart was deleted on another device — remove locally and go to menu
                if (tombstones?.some(t => t.chart_uuid === chartId)) {
                    const idb = await openDB('SCC_Charts', 1);
                    await idb.delete('charts', chartId);
                    window.location.href = '/';
                    return;
                }
                if (downloads.length > 0) {
                    const dl = downloads[0];
                    dl.data.id = dl.id;
                    dl.data.lastModified = dl.updatedAt;
                    const db = await openDB('SCC_Charts', 1);
                    await db.put('charts', dl.data);
                    eventBus.emit(EVENTS.SYNC_CHART_UPDATED, { chartId: dl.id, chartData: dl.data });
                }
            })
            .catch(err => console.warn('[Sync] Pull on load failed:', err));
    }
}

init();
