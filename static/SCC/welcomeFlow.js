/**
 * Welcome page flow — create new user or import existing.
 * Extracted from welcome.html inline script for CSP compliance.
 */

import { openDB } from '/static/lib/idb.js';
import { generatePassphrase } from '/static/SCC/storage/passphrase.js';
import { deriveSigningKeyPair, exportPublicKey } from '/static/Server/crypto.js';
import { restoreFromBackup } from '/static/SCC/storage/backupStorage.js';
import { redeemAccountLink } from '/static/Server/accountLink.js';

const DB_NAME = 'SCC_Identity';
const STORE_NAME = 'credentials';

// --- Path choice ---
const pathChoice = document.getElementById('path-choice');
const createFlow = document.getElementById('create-flow');
const importFlow = document.getElementById('import-flow');

function showView(view) {
    pathChoice.classList.add('hidden');
    createFlow.classList.add('hidden');
    importFlow.classList.add('hidden');
    view.classList.remove('hidden');
}

document.getElementById('choose-create').addEventListener('click', () => {
    showView(createFlow);
    document.getElementById('display-name').focus();
});

document.getElementById('choose-import').addEventListener('click', () => {
    showView(importFlow);
});

document.getElementById('back-from-create').addEventListener('click', () => {
    showView(pathChoice);
});

document.getElementById('back-from-import').addEventListener('click', () => {
    showView(pathChoice);
    clearImportStatus();
});

// --- Create new user (existing logic, unchanged) ---
const nameInput = document.getElementById('display-name');
const useCaseRadios = document.querySelectorAll('input[name="use-case"]');
const getStartedBtn = document.getElementById('get-started-btn');
const useCaseBtns = document.querySelectorAll('.use-case-btn');

function updateReady() {
    const hasName = nameInput.value.trim().length > 0;
    const hasUseCase = document.querySelector('input[name="use-case"]:checked');
    getStartedBtn.disabled = !(hasName && hasUseCase);
}

nameInput.addEventListener('input', updateReady);
useCaseRadios.forEach(r => r.addEventListener('change', () => {
    useCaseBtns.forEach(btn => btn.classList.remove('selected'));
    r.closest('.use-case-btn').classList.add('selected');
    updateReady();
}));

getStartedBtn.addEventListener('click', async () => {
    const displayName = nameInput.value.trim();
    const useCase = document.querySelector('input[name="use-case"]:checked')?.value;
    if (!displayName || !useCase) return;

    getStartedBtn.disabled = true;
    getStartedBtn.textContent = 'Setting up...';

    const db = await openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        }
    });

    const passphrase = generatePassphrase();
    const keyPair = await deriveSigningKeyPair(passphrase);
    const publicKeyB64 = await exportPublicKey(keyPair.publicKey);

    await db.put(STORE_NAME, passphrase, 'passphrase');
    await db.put(STORE_NAME, publicKeyB64, 'publicKey');
    await db.put(STORE_NAME, displayName, 'display_name');
    await db.put(STORE_NAME, useCase, 'use_case');
    await db.put(STORE_NAME, { syncAllChartsToServer: true }, 'user_preferences');

    window.location.href = '/';
});

// --- Import: shared status helpers ---
const importStatus = document.getElementById('import-status');

function showImportStatus(msg, isError) {
    importStatus.textContent = msg;
    importStatus.className = isError
        ? 'mt-4 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200'
        : 'mt-4 px-4 py-3 rounded-lg text-sm bg-blue-50 text-blue-700 border border-blue-200';
    importStatus.classList.remove('hidden');
}

function clearImportStatus() {
    importStatus.classList.add('hidden');
    importStatus.textContent = '';
}

// --- Import: backup file ---
const backupFileInput = document.getElementById('backup-file');
const backupFileBtn = document.getElementById('backup-file-btn');
const backupFileName = document.getElementById('backup-file-name');

backupFileBtn.addEventListener('click', () => backupFileInput.click());

backupFileInput.addEventListener('change', async () => {
    const file = backupFileInput.files[0];
    if (!file) return;

    clearImportStatus();
    backupFileName.textContent = file.name;
    backupFileName.classList.remove('hidden');
    backupFileBtn.disabled = true;
    backupFileBtn.textContent = 'Importing...';

    try {
        const text = await file.text();
        let backup;
        try {
            backup = JSON.parse(text);
        } catch {
            throw new Error('File is not valid JSON.');
        }

        if (!backup.backupVersionFormat) {
            throw new Error('Not a valid backup file (missing backupVersionFormat).');
        }

        if (!backup.identity?.passphrase) {
            throw new Error('Backup file does not contain identity data.');
        }

        await restoreFromBackup(backup, { discardExisting: false });
        window.location.href = '/';
    } catch (err) {
        showImportStatus(err.message, true);
        backupFileBtn.disabled = false;
        backupFileBtn.textContent = 'Choose .json backup file...';
        backupFileName.classList.add('hidden');
        backupFileInput.value = '';
    }
});

// --- Import: sync link ---
const syncLinkInput = document.getElementById('sync-link-input');
const importLinkBtn = document.getElementById('import-link-btn');

syncLinkInput.addEventListener('input', () => {
    importLinkBtn.disabled = !syncLinkInput.value.trim();
});

function parseSyncLink(raw) {
    const trimmed = raw.trim();
    try {
        const url = new URL(trimmed);
        const parts = url.pathname.split('/').filter(Boolean);
        const hash = url.hash?.slice(1) || null;
        // Expected: /sync/<linkId>#<linkSecret>
        if (parts.length >= 2 && parts[0] === 'sync' && hash) {
            return { linkId: parts[1], linkSecret: hash };
        }
    } catch { /* not a valid URL */ }
    return null;
}

importLinkBtn.addEventListener('click', async () => {
    clearImportStatus();
    const parsed = parseSyncLink(syncLinkInput.value);
    if (!parsed) {
        showImportStatus('Invalid sync link. Expected format: https://.../sync/<id>#<secret>', true);
        return;
    }

    importLinkBtn.disabled = true;
    importLinkBtn.textContent = 'Importing...';

    try {
        const { passphrase, displayName } = await redeemAccountLink(parsed.linkId, parsed.linkSecret);

        const db = await openDB(DB_NAME, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            }
        });

        const keyPair = await deriveSigningKeyPair(passphrase);
        const publicKeyB64 = await exportPublicKey(keyPair.publicKey);

        await db.put(STORE_NAME, passphrase, 'passphrase');
        await db.put(STORE_NAME, publicKeyB64, 'publicKey');
        if (displayName) {
            await db.put(STORE_NAME, displayName, 'display_name');
        }
        await db.put(STORE_NAME, { syncAllChartsToServer: true }, 'user_preferences');

        window.location.href = '/';
    } catch (err) {
        showImportStatus(err.message, true);
        importLinkBtn.disabled = false;
        importLinkBtn.textContent = 'Import from link';
    }
});
