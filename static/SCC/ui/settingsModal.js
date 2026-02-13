import { createBackupData, restoreFromBackup } from '/static/SCC/storage/backupStorage.js';
import { listCharts } from '/static/SCC/storage/chartStorage.js';
import { setUserPreference, getUserPreferences, getDisplayName, setDisplayName } from '/static/Server/init.js';
import { downloadFile } from '/static/SCC/util/download.js';
import { createAccountLink } from '/static/Server/accountLink.js';
import { getStoredPassphrase } from '/static/Server/syncDevice.js';

let pendingBackupData = null;
let linkCountdownTimer = null;

let onChartsChanged = () => {};

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

    document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('settings-modal').classList.add('flex');
}

function resetAccountLinkUI() {
    if (linkCountdownTimer) {
        clearInterval(linkCountdownTimer);
        linkCountdownTimer = null;
    }
    document.getElementById('account-link-section').classList.remove('hidden');
    const resultEl = document.getElementById('account-link-result');
    resultEl.classList.add('hidden');
    document.getElementById('account-link-qr').innerHTML = '';
    document.getElementById('account-link-url').value = '';
    const genBtn = document.getElementById('generate-link-btn');
    genBtn.disabled = false;
    genBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
    </svg>
    Generate sync link`;
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('settings-modal').classList.remove('flex');

    // Reset sync state
    pendingBackupData = null;
    document.getElementById('backup-import-section').classList.remove('hidden');
    document.getElementById('sync-confirm').classList.add('hidden');
    hideImportStatus();
    resetAccountLinkUI();

    // Collapse both groups
    document.getElementById('backup-group').classList.add('hidden');
    document.getElementById('sync-group').classList.add('hidden');
    document.getElementById('backup-chevron').style.transform = '';
    document.getElementById('sync-chevron').style.transform = '';
}

async function performBackupImport(discardExisting) {
    const backup = pendingBackupData;
    if (!backup) return;

    try {
        await restoreFromBackup(backup, { discardExisting });

        pendingBackupData = null;

        closeSettingsModal();
        await onChartsChanged();
    } catch (err) {
        console.error('[Backup Import] Error:', err);
        document.getElementById('sync-confirm').classList.add('hidden');
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
            const name = backup.identity?.display_name
                ?.replaceAll(' ', '-')
                .replace(/[\/\\:*?"<>|]/g, '-');
            const filename = name ? `${name}-scc-full-backup-${today}.json` : `scc-full-backup-${today}.json`;
            downloadFile(json, filename, 'application/json;charset=utf-8;');
        } catch (err) {
            console.error('Backup export failed:', err);
            alert('Backup export failed. Check console for details.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });

    // Confirmation buttons (backup import)
    document.getElementById('sync-keep-btn').addEventListener('click', () => performBackupImport(false));
    document.getElementById('sync-discard-btn').addEventListener('click', () => performBackupImport(true));

    // --- Backup Import ---
    document.getElementById('backup-import-btn').addEventListener('click', () => {
        document.getElementById('backup-import-input').click();
    });

    // --- Account Link ---
    document.getElementById('generate-link-btn').addEventListener('click', async () => {
        const btn = document.getElementById('generate-link-btn');
        btn.disabled = true;
        btn.textContent = 'Generating...';

        try {
            const passphrase = await getStoredPassphrase();
            if (!passphrase) {
                btn.disabled = false;
                btn.textContent = 'Generate sync link';
                return;
            }
            const displayName = await getDisplayName();
            const { url } = await createAccountLink(passphrase, displayName);

            // Hide generate button, show result
            document.getElementById('account-link-section').classList.add('hidden');
            const resultEl = document.getElementById('account-link-result');
            resultEl.classList.remove('hidden');

            // Render QR code
            const qrContainer = document.getElementById('account-link-qr');
            qrContainer.innerHTML = '';
            /* global qrcode */
            const qr = qrcode(0, 'M');
            qr.addData(url);
            qr.make();
            qrContainer.innerHTML = qr.createSvgTag(4, 0);

            // Set URL input
            document.getElementById('account-link-url').value = url;

            // Start countdown (15 minutes = 900 seconds)
            let remaining = 900;
            const countdownEl = document.getElementById('link-countdown');
            const tick = () => {
                const min = Math.floor(remaining / 60);
                const sec = remaining % 60;
                countdownEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
                if (remaining <= 0) {
                    clearInterval(linkCountdownTimer);
                    linkCountdownTimer = null;
                    resetAccountLinkUI();
                }
                remaining--;
            };
            tick();
            linkCountdownTimer = setInterval(tick, 1000);
        } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Generate sync link';
            console.error('[AccountLink] Error:', err);
            alert(err.message);
        }
    });

    document.getElementById('copy-link-btn').addEventListener('click', () => {
        const urlInput = document.getElementById('account-link-url');
        const btn = document.getElementById('copy-link-btn');
        navigator.clipboard.writeText(urlInput.value).then(() => {
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        });
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

            const existingCharts = await listCharts();
            if (existingCharts.length > 0) {
                document.getElementById('sync-chart-count').textContent = existingCharts.length;
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
