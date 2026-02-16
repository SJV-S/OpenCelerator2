import { initStorage, listCharts, deleteChart, updateChartTags } from '/static/SCC/storage/chartStorage.js';

import { openDB } from '/static/lib/idb.js';
import { checkForUpdates, pushCharts } from '/static/Server/syncClient.js';
import { initServerSync, isSyncEnabled, getUserPreferences, setUserPreference, getDisplayNameCached } from '/static/Server/init.js';
import { initSettingsModal, performBackupExport } from '/static/SCC/ui/settingsModal.js';
import { createConfirmToast, createToast } from '/static/SCC/ui/toaster.js';
import { initDonateModal } from '/static/SCC/ui/donateModal.js';

const titleEl = document.getElementById('explorer-title');

function updateTitle() {
    const name = getDisplayNameCached();
    titleEl.textContent = name ? `${name}'s Chart Explorer` : 'Chart Explorer';
}

let charts = [];
let chartToDelete = null;
let chartToEditTags = null;
let editingTags = [];
let searchQuery = '';
let searchMode = localStorage.getItem('scc-search-mode') || 'name';
let filterShared = false;
let searchDebounceTimer = null;
let currentPage = 1;
const CHARTS_PER_PAGE = 20;

function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatChartType(chartType, minuteChart) {
    const typeLabel = chartType === 'FrequencyCollections' ? 'Freq. Collections' : chartType;
    const variant = minuteChart ? 'Minute' : 'Count';
    return `${typeLabel} (${variant})`;
}

function parseCredits(credits) {
    if (!credits || typeof credits !== 'object') return [];
    const lines = [];
    if (credits[0]) lines.push(credits[0]);
    if (credits[1]) lines.push(credits[1]);
    return lines;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function createTagHtml(tag) {
    const escaped = escapeHtml(tag);
    return `<span class="tag inline-flex items-center px-2 py-0.5 rounded text-xs border border-gray-300 text-gray-600">${escaped}</span>`;
}

function createChartRow(chart) {
    const credits = parseCredits(chart.credits);
    const hasCredits = credits.length > 0 && credits.some(c => c && c.trim());
    const tags = chart.tags || [];

    const row = document.createElement('tr');
    row.className = 'table-row';
    row.dataset.id = chart.id;
    row.dataset.tags = JSON.stringify(tags);
    row.innerHTML = `
        <td class="py-3 pl-2 pr-3">
            ${hasCredits ? `
                <button class="expand-btn text-gray-400 hover:text-gray-600 p-1" data-id="${chart.id}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                    </svg>
                </button>
            ` : '<span class="w-6 inline-block"></span>'}
        </td>
        <td class="py-3">
            <a href="/chart/${chart.id}" class="chart-link text-gray-800 text-[15px] font-medium hover:underline">${escapeHtml(chart.chartName || 'Unnamed')}</a>
            <div class="text-xs text-gray-400 mt-0.5">Updated ${formatDate(chart.updatedAt)}</div>
        </td>
        <td class="py-3 text-gray-600 text-sm">${formatChartType(chart.chartType, chart.minuteChart)}</td>
        <td class="py-3">
            <div class="flex items-center gap-1 flex-wrap">
                ${tags.map(t => createTagHtml(t)).join('')}
                <button class="edit-tags-btn text-gray-400 hover:text-gray-600 p-1" data-id="${chart.id}">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                </button>
            </div>
        </td>
        <td class="py-3 text-center">
            ${chart.shared
                ? `<svg class="w-5 h-5 text-green-500 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                   </svg>`
                : `<span class="text-gray-400 text-sm">-</span>`}
        </td>
        <td class="py-3 pr-2 text-right">
            <button class="delete-btn text-gray-400 hover:text-red-500 p-1" data-id="${chart.id}" data-name="${escapeHtml(chart.chartName || 'Unnamed')}">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
            </button>
        </td>
    `;

    // Create credits expansion row
    const creditsRow = document.createElement('tr');
    creditsRow.className = 'credits-row';
    creditsRow.id = `credits-${chart.id}`;
    creditsRow.innerHTML = `
        <td></td>
        <td colspan="5" class="pb-4 pt-1">
            <div class="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 font-mono leading-relaxed">
                ${credits.map(line => `<div class="mb-1 last:mb-0">${escapeHtml(line || '')}</div>`).join('')}
            </div>
        </td>
    `;

    return { row, creditsRow };
}


function searchCharts(charts) {
    if (!searchQuery.trim()) return charts;

    const query = searchQuery.toLowerCase().trim();

    return charts.filter(chart => {
        switch (searchMode) {
            case 'name':
                return (chart.chartName || '').toLowerCase().includes(query);
            case 'credits':
                const credits = chart.credits || {};
                const creditText = [credits[0] || '', credits[1] || ''].join(' ').toLowerCase();
                return creditText.includes(query);
            case 'tags':
                return (chart.tags || []).some(t => t.toLowerCase().includes(query));
            default:
                return true;
        }
    });
}

function filterCharts(charts) {
    let filtered = searchCharts(charts);
    if (filterShared) {
        filtered = filtered.filter(chart => chart.shared);
    }
    return filtered;
}

function renderCharts(resetPage = false) {
    if (resetPage) currentPage = 1;

    const emptyState = document.getElementById('empty-state');
    const noResults = document.getElementById('no-results');
    const chartsContainer = document.getElementById('charts-container');
    const tableBody = document.getElementById('charts-table');
    const pagination = document.getElementById('pagination');

    if (charts.length === 0) {
        emptyState.classList.remove('hidden');
        noResults.classList.add('hidden');
        chartsContainer.classList.add('hidden');
        pagination.classList.add('hidden');
        return;
    }

    const filteredCharts = filterCharts(charts);

    if (filteredCharts.length === 0) {
        emptyState.classList.add('hidden');
        noResults.classList.remove('hidden');
        chartsContainer.classList.add('hidden');
        pagination.classList.add('hidden');
        return;
    }

    // Sort by most recently modified
    filteredCharts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    // Pagination
    const totalPages = Math.ceil(filteredCharts.length / CHARTS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    const startIndex = (currentPage - 1) * CHARTS_PER_PAGE;
    const pageCharts = filteredCharts.slice(startIndex, startIndex + CHARTS_PER_PAGE);

    emptyState.classList.add('hidden');
    noResults.classList.add('hidden');
    chartsContainer.classList.remove('hidden');
    tableBody.innerHTML = '';

    for (const chart of pageCharts) {
        const { row, creditsRow } = createChartRow(chart);
        tableBody.appendChild(row);
        tableBody.appendChild(creditsRow);
    }

    attachRowListeners();
    updatePagination(filteredCharts.length, totalPages);
}

function updatePagination(totalCharts, totalPages) {
    const pagination = document.getElementById('pagination');
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (totalPages <= 1) {
        pagination.classList.add('hidden');
        return;
    }

    pagination.classList.remove('hidden');
    const start = (currentPage - 1) * CHARTS_PER_PAGE + 1;
    const end = Math.min(currentPage * CHARTS_PER_PAGE, totalCharts);
    pageInfo.textContent = `${start}-${end} of ${totalCharts}`;

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}

function attachRowListeners() {
    // Single-click row to toggle credits, double-click to open chart
    document.querySelectorAll('.table-row').forEach(row => {
        row.addEventListener('click', (e) => {
            // Don't toggle if clicking on interactive elements
            if (e.target.closest('a, button')) return;

            const chartId = row.dataset.id;
            const expandBtn = row.querySelector('.expand-btn');
            const creditsRow = document.getElementById(`credits-${chartId}`);

            // Only toggle if this chart has credits (has expand button)
            if (expandBtn && creditsRow) {
                expandBtn.classList.toggle('expanded');
                creditsRow.classList.toggle('expanded');
            }
        });

        row.addEventListener('dblclick', () => {
            const chartId = row.dataset.id;
            if (chartId) {
                window.location.href = `/chart/${chartId}`;
            }
        });
    });

    // Expand buttons (still functional for direct clicks)
    document.querySelectorAll('.expand-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent row click from also firing
            const id = btn.dataset.id;
            const creditsRow = document.getElementById(`credits-${id}`);
            btn.classList.toggle('expanded');
            creditsRow.classList.toggle('expanded');
        });
    });

    // Delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            chartToDelete = btn.dataset.id;
            document.getElementById('delete-chart-name').textContent = btn.dataset.name;
            document.getElementById('delete-modal').classList.remove('hidden');
            document.getElementById('delete-modal').classList.add('flex');
        });
    });

    // Edit tags buttons
    document.querySelectorAll('.edit-tags-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const chartId = btn.dataset.id;
            const chart = charts.find(c => c.id === chartId);
            chartToEditTags = chartId;
            editingTags = chart ? [...(chart.tags || [])] : [];
            openTagsModal();
        });
    });
}

// Tags modal functions
function openTagsModal() {
    document.getElementById('tags-input').value = '';
    renderCurrentTags();
    document.getElementById('tags-modal').classList.remove('hidden');
    document.getElementById('tags-modal').classList.add('flex');
    document.getElementById('tags-input').focus();
}

function closeTagsModal() {
    chartToEditTags = null;
    editingTags = [];
    document.getElementById('tags-modal').classList.add('hidden');
    document.getElementById('tags-modal').classList.remove('flex');
}

function renderCurrentTags() {
    const container = document.getElementById('current-tags');
    const input = document.getElementById('tags-input');

    container.innerHTML = editingTags.map(tag => `
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-100 text-gray-700">
            ${escapeHtml(tag)}
            <button class="remove-tag hover:text-red-500" data-tag="${escapeHtml(tag)}">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </span>
    `).join('');

    // Disable input when max tags reached
    input.disabled = editingTags.length >= MAX_TAGS;

    container.querySelectorAll('.remove-tag').forEach(btn => {
        btn.addEventListener('click', () => {
            const tagToRemove = btn.dataset.tag.toLowerCase();
            editingTags = editingTags.filter(t => t.toLowerCase() !== tagToRemove);
            renderCurrentTags();
        });
    });
}

const MAX_TAGS = 5;

function addTagsFromInput() {
    const input = document.getElementById('tags-input');
    const newTags = input.value
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0);

    for (const tag of newTags) {
        if (editingTags.length >= MAX_TAGS) break;
        if (!editingTags.some(t => t.toLowerCase() === tag)) {
            editingTags.push(tag);
        }
    }

    input.value = '';
    renderCurrentTags();
}

const UNIT_SECONDS = { days: 86400, weeks: 604800, months: 2592000 };

function checkBackupReminder() {
    const prefs = getUserPreferences();
    if (!prefs.backupRemindersEnabled) return;

    const intervalSec = (prefs.backupReminderInterval || 1) * (UNIT_SECONDS[prefs.backupReminderUnit] || UNIT_SECONDS.weeks);
    const nextDue = (prefs.lastBackupTimestamp || 0) + intervalSec;

    if (Math.floor(Date.now() / 1000) < nextDue) return;

    createConfirmToast({
        message: 'Backup reminder.',
        yesLabel: 'Backup',
        noLabel: 'Dismiss',
        onYes: async () => {
            try { await performBackupExport(); } catch (e) { console.error('[BackupReminder]', e); }
            setUserPreference('lastBackupTimestamp', Math.floor(Date.now() / 1000));
        },
        onNo: () => {
            setUserPreference('lastBackupTimestamp', Math.floor(Date.now() / 1000));
        }
    });
}

async function loadCharts() {
    await initStorage();
    charts = await listCharts();
    renderCharts();

    // Pull updates from server if sync enabled
    await initServerSync();
    updateTitle();
    checkBackupReminder();
    if (isSyncEnabled()) {
        try {
            const manifest = charts.map(c => ({ chart_uuid: c.id, updated_at: c.updatedAt || 0 }));
            const { downloads, tombstones, serverManifest } = await checkForUpdates(manifest);
            let changed = false;

            // Delete locally any non-shared charts tombstoned on another device
            if (tombstones?.length > 0) {
                for (const t of tombstones) {
                    const local = charts.find(c => c.id === t.chart_uuid && !c.shared);
                    if (local) {
                        await deleteChart(t.chart_uuid);
                        changed = true;
                    }
                }
            }

            if (downloads.length > 0) {
                const chartsDb = await openDB('SCC_Charts', 1);
                for (const dl of downloads) {
                    dl.data.id = dl.id;
                    dl.data.lastModified = dl.updatedAt;
                    await chartsDb.put('charts', dl.data);
                }
                changed = true;
            }

            if (changed) {
                charts = await listCharts();
                renderCharts();
            }

            // Push charts the server is missing or has stale versions of
            if (serverManifest) {
                const serverMap = new Map(serverManifest.map(s => [s.chart_uuid, s.updated_at]));
                const toPush = [];
                for (const c of charts) {
                    if (c.shared) continue;
                    const serverTs = serverMap.get(c.id);
                    if (serverTs === undefined || (c.updatedAt && c.updatedAt > serverTs)) {
                        toPush.push(c.id);
                    }
                }
                if (toPush.length > 0) {
                    try {
                        await pushCharts(toPush);
                    } catch (err) {
                        console.warn('[Sync] Batch push failed:', err);
                    }
                }
            }
        } catch (err) {
            console.warn('[Sync] Pull on load failed:', err);
        }
    }
}

// Delete modal handlers
document.getElementById('cancel-delete').addEventListener('click', () => {
    chartToDelete = null;
    document.getElementById('delete-modal').classList.add('hidden');
    document.getElementById('delete-modal').classList.remove('flex');
});

document.getElementById('confirm-delete').addEventListener('click', async () => {
    if (chartToDelete) {
        await deleteChart(chartToDelete);
        chartToDelete = null;
        document.getElementById('delete-modal').classList.add('hidden');
        document.getElementById('delete-modal').classList.remove('flex');
        await loadCharts();
    }
});

document.getElementById('delete-modal').addEventListener('click', (e) => {
    if (e.target.id === 'delete-modal') {
        chartToDelete = null;
        document.getElementById('delete-modal').classList.add('hidden');
        document.getElementById('delete-modal').classList.remove('flex');
    }
});

// Tags modal handlers
document.getElementById('cancel-tags').addEventListener('click', closeTagsModal);

document.getElementById('save-tags').addEventListener('click', async () => {
    if (chartToEditTags) {
        // Add any remaining input
        addTagsFromInput();
        await updateChartTags(chartToEditTags, editingTags);
        closeTagsModal();
        await loadCharts();
    }
});

document.getElementById('tags-modal').addEventListener('click', (e) => {
    if (e.target.id === 'tags-modal') {
        closeTagsModal();
    }
});

document.getElementById('tags-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addTagsFromInput();
    }
});

// Search input with debounce
document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        searchQuery = e.target.value;
        renderCharts(true);
    }, 200);
});

// Search mode radio buttons
document.querySelectorAll('input[name="search-mode"]').forEach(radio => {
    // Set initial state from localStorage
    radio.checked = radio.value === searchMode;

    radio.addEventListener('change', (e) => {
        searchMode = e.target.value;
        localStorage.setItem('scc-search-mode', searchMode);
        if (searchQuery.trim()) {
            renderCharts(true);
        }
    });
});

// Filter shared toggle
document.getElementById('filter-shared').addEventListener('change', (e) => {
    filterShared = e.target.checked;
    renderCharts(true);
});

// Pagination
document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderCharts();
    }
});

document.getElementById('next-page').addEventListener('click', () => {
    currentPage++;
    renderCharts();
});

// Show share-link error banner if redirected from an expired/invalid link
function showShareError() {
    const msg = sessionStorage.getItem('scc-share-error');
    if (!msg) return;
    sessionStorage.removeItem('scc-share-error');

    const banner = document.createElement('div');
    banner.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-300 text-red-800 px-5 py-3 rounded-lg shadow-md text-sm font-medium flex items-center gap-3';
    banner.innerHTML = `<span>${msg}</span><button class="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>`;
    banner.querySelector('button').addEventListener('click', () => banner.remove());
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 8000);
}
showShareError();

function checkInstallSupport() {
    // Skip if already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Chromium-based browsers (Chrome, Edge, Opera, etc.) include "Chrome/" in the UA
    if (/Chrome\//.test(navigator.userAgent)) return;

    const key = 'scc-install-notice-count';
    const count = parseInt(localStorage.getItem(key) || '0', 10);
    if (count >= 2) return;

    localStorage.setItem(key, String(count + 1));
    createToast({
        message: 'Install option is only available in Chromium-based browsers (Chrome, Edge, Opera, etc.).',
        buttons: [{ label: 'Got it', onClick: () => {}, type: 'secondary' }],
        layout: 'horizontal',
        duration: 8000
    });
}
checkInstallSupport();

// Load on page show (handles back button)
window.addEventListener('pageshow', loadCharts);

initSettingsModal({ onChartsChanged: loadCharts, onDisplayNameChanged: updateTitle });
initDonateModal();
