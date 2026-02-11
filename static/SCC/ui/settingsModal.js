import { getStoredPassphrase, switchIdentity, pullCurrentIdentity } from '/static/Server/syncDevice.js';
import { createBackupData, restoreFromBackup } from '/static/SCC/storage/backupStorage.js';
import { validatePassphrase, getUserId } from '/static/SCC/storage/passphrase.js';
import { listCharts } from '/static/SCC/storage/chartStorage.js';
import { setUserPreference, getUserPreferences, getDisplayName, setDisplayName } from '/static/Server/init.js';
import { downloadFile } from '/static/SCC/util/download.js';

let syncPassphrase = null;
let syncPassphraseVisible = false;
let pendingNewPassphrase = null;
let pendingAction = null;
let pendingBackupData = null;

let onChartsChanged = () => {};

function renderPassphraseDisplay() {
    const display = document.getElementById('sync-passphrase-display');
    const eyeIcon = document.getElementById('sync-eye-icon');
    const eyeOffIcon = document.getElementById('sync-eye-off-icon');

    if (!syncPassphrase) {
        display.textContent = 'No passphrase generated yet';
        display.classList.add('text-gray-400', 'italic');
        display.classList.remove('text-gray-800');
        return;
    }

    display.classList.remove('text-gray-400', 'italic');
    display.classList.add('text-gray-800');

    if (syncPassphraseVisible) {
        display.textContent = syncPassphrase;
        eyeIcon.classList.add('hidden');
        eyeOffIcon.classList.remove('hidden');
    } else {
        display.textContent = syncPassphrase.split(' ').map(() => '\u2022\u2022\u2022\u2022').join(' ');
        eyeIcon.classList.remove('hidden');
        eyeOffIcon.classList.add('hidden');
    }
}

function showSyncStatus(message, isError) {
    const el = document.getElementById('sync-status');
    el.textContent = message;
    el.className = `text-sm mt-2 ${isError ? 'text-red-600' : 'text-green-600'}`;
    el.classList.remove('hidden');
}

function hideSyncStatus() {
    const el = document.getElementById('sync-status');
    el.classList.add('hidden');
    el.textContent = '';
}

function showImportStatus(message, isError) {
    const el = document.getElementById('import-status');
    el.textContent = message;
    el.className = `text-sm mt-2 ${isError ? 'text-red-600' : 'text-green-600'}`;
    el.classList.remove('hidden');
}

function hideImportStatus() {
    const el = document.getElementById('import-status');
    el.classList.add('hidden');
    el.textContent = '';
}

async function openSettingsModal() {
    const prefs = getUserPreferences();
    document.getElementById('settings-sync-checkbox').checked = prefs.syncAllChartsToServer;

    const displayName = await getDisplayName();
    document.getElementById('settings-owner-name').value = displayName || '';

    // Initialize sync passphrase section
    syncPassphraseVisible = false;
    document.getElementById('sync-paste-input').value = '';
    document.getElementById('sync-copy-btn').textContent = 'Copy';

    getStoredPassphrase().then(p => {
        syncPassphrase = p || null;
        renderPassphraseDisplay();
    });

    document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('settings-modal').classList.add('flex');
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('settings-modal').classList.remove('flex');

    // Reset sync state
    syncPassphrase = null;
    syncPassphraseVisible = false;
    pendingAction = null;
    pendingBackupData = null;
    document.getElementById('sync-paste-section').classList.remove('hidden');
    document.getElementById('backup-import-section').classList.remove('hidden');
    document.getElementById('sync-confirm').classList.add('hidden');
    hideSyncStatus();
    hideImportStatus();

    // Collapse both groups
    document.getElementById('backup-group').classList.add('hidden');
    document.getElementById('sync-group').classList.add('hidden');
    document.getElementById('backup-chevron').style.transform = '';
    document.getElementById('sync-chevron').style.transform = '';
}

async function performSync(discardExisting) {
    const newPassphrase = pendingNewPassphrase;
    if (!newPassphrase) return;

    try {
        const { downloads } = await switchIdentity(newPassphrase, { discardExisting });
        pendingNewPassphrase = null;

        if (downloads === 0) {
            document.getElementById('sync-confirm').classList.add('hidden');
            document.getElementById('sync-paste-section').classList.remove('hidden');
            document.getElementById('backup-import-section').classList.remove('hidden');
            showSyncStatus('Identity switched. No shared charts found on the server for this passphrase.', false);
            await onChartsChanged();
            return;
        }

        closeSettingsModal();
        await onChartsChanged();
    } catch (err) {
        console.error('[Sync] Error:', err);
        document.getElementById('sync-confirm').classList.add('hidden');
        document.getElementById('sync-paste-section').classList.remove('hidden');
        document.getElementById('backup-import-section').classList.remove('hidden');
        showSyncStatus(`Sync failed: ${err.message}`, true);
    }
}

async function performBackupImport(discardExisting) {
    const backup = pendingBackupData;
    if (!backup) return;

    try {
        await restoreFromBackup(backup, { discardExisting });

        pendingBackupData = null;
        pendingAction = null;

        closeSettingsModal();
        await onChartsChanged();
    } catch (err) {
        console.error('[Backup Import] Error:', err);
        document.getElementById('sync-confirm').classList.add('hidden');
        document.getElementById('sync-paste-section').classList.remove('hidden');
        document.getElementById('backup-import-section').classList.remove('hidden');
        showImportStatus(`Import failed: ${err.message}`, true);
    }
}

export function initSettingsModal(deps) {
    onChartsChanged = deps.onChartsChanged;

    document.getElementById('settings-btn').addEventListener('click', openSettingsModal);
    document.getElementById('settings-close-btn').addEventListener('click', closeSettingsModal);

    document.getElementById('settings-modal').addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') closeSettingsModal();
    });

    document.getElementById('settings-sync-checkbox').addEventListener('change', (e) => {
        setUserPreference('syncAllChartsToServer', e.target.checked);
    });

    document.getElementById('settings-owner-name').addEventListener('blur', (e) => {
        setDisplayName(e.target.value.trim());
    });

    // --- Section Toggle Handlers ---
    document.getElementById('backup-toggle').addEventListener('click', () => {
        const group = document.getElementById('backup-group');
        const chevron = document.getElementById('backup-chevron');
        group.classList.toggle('hidden');
        chevron.style.transform = group.classList.contains('hidden') ? '' : 'rotate(90deg)';
    });

    document.getElementById('sync-toggle').addEventListener('click', () => {
        const group = document.getElementById('sync-group');
        const chevron = document.getElementById('sync-chevron');
        group.classList.toggle('hidden');
        chevron.style.transform = group.classList.contains('hidden') ? '' : 'rotate(90deg)';
    });

    // --- Backup Export ---
    document.getElementById('backup-export-btn').addEventListener('click', async () => {
        const btn = document.getElementById('backup-export-btn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = 'Exporting...';

        try {
            const backup = await createBackupData();
            const json = JSON.stringify(backup);
            const today = new Date().toISOString().slice(0, 10);
            downloadFile(json, `tc2-backup-${today}.json`, 'application/json;charset=utf-8;');
        } catch (err) {
            console.error('Backup export failed:', err);
            alert('Backup export failed. Check console for details.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });

    // --- Sync Passphrase ---
    document.getElementById('sync-toggle-visibility').addEventListener('click', () => {
        if (!syncPassphrase) return;
        syncPassphraseVisible = !syncPassphraseVisible;
        renderPassphraseDisplay();
    });

    document.getElementById('sync-copy-btn').addEventListener('click', async () => {
        if (!syncPassphrase) return;
        try {
            await navigator.clipboard.writeText(syncPassphrase);
            const btn = document.getElementById('sync-copy-btn');
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        } catch {
            // Fallback silently
        }
    });

    document.getElementById('sync-submit-btn').addEventListener('click', async () => {
        const input = document.getElementById('sync-paste-input');
        const value = input.value.trim();
        if (!value) return;

        hideSyncStatus();

        // Validate passphrase format
        if (!validatePassphrase(value)) {
            showSyncStatus('Invalid passphrase format', true);
            return;
        }

        // Check if same identity — just pull from server, no passphrase switch needed
        const currentPassphrase = await getStoredPassphrase();
        if (currentPassphrase) {
            const [currentId, newId] = await Promise.all([
                getUserId(currentPassphrase),
                getUserId(value)
            ]);
            if (currentId === newId) {
                try {
                    const { downloads } = await pullCurrentIdentity();
                    if (downloads > 0) {
                        closeSettingsModal();
                        await onChartsChanged();
                    } else {
                        showSyncStatus('Same identity — no new charts on server.', false);
                    }
                } catch (err) {
                    console.error('[Sync] Pull error:', err);
                    showSyncStatus(`Sync failed: ${err.message}`, true);
                }
                return;
            }
        }

        pendingNewPassphrase = value;
        pendingAction = 'passphrase';

        // Check for existing charts
        const existingCharts = await listCharts();
        if (existingCharts.length > 0) {
            // Show confirmation sub-modal
            document.getElementById('sync-chart-count').textContent = existingCharts.length;
            document.getElementById('sync-paste-section').classList.add('hidden');
            document.getElementById('backup-import-section').classList.add('hidden');
            document.getElementById('sync-confirm').classList.remove('hidden');
        } else {
            // No existing charts, proceed directly
            await performSync(false);
        }
    });

    // Confirmation buttons (shared by passphrase sync and backup import)
    document.getElementById('sync-keep-btn').addEventListener('click', () => {
        if (pendingAction === 'backup-import') performBackupImport(false);
        else performSync(false);
    });
    document.getElementById('sync-discard-btn').addEventListener('click', () => {
        if (pendingAction === 'backup-import') performBackupImport(true);
        else performSync(true);
    });

    // --- Backup Import ---
    document.getElementById('backup-import-btn').addEventListener('click', () => {
        document.getElementById('backup-import-input').click();
    });

    document.getElementById('backup-import-input').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        hideImportStatus();

        try {
            const text = await file.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch (parseErr) {
                showImportStatus(`Invalid JSON file: ${parseErr.message}`, true);
                return;
            }

            if (!json.backupVersionFormat) {
                showImportStatus('Invalid backup file: missing backup format identifier.', true);
                return;
            }

            pendingBackupData = json;
            pendingAction = 'backup-import';

            const existingCharts = await listCharts();
            if (existingCharts.length > 0) {
                document.getElementById('sync-chart-count').textContent = existingCharts.length;
                document.getElementById('sync-paste-section').classList.add('hidden');
                document.getElementById('backup-import-section').classList.add('hidden');
                document.getElementById('sync-confirm').classList.remove('hidden');
            } else {
                await performBackupImport(false);
            }
        } catch (err) {
            console.error('[Backup Import] Parse error:', err);
            showImportStatus(`Import failed: ${err.message}`, true);
        }
    });
}
