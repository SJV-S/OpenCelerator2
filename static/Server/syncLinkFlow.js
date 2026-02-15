/**
 * Sync link redemption flow — redeem an account link on a new device.
 * Extracted from sync_link.html inline script for CSP compliance.
 */

import { openDB } from '/static/lib/idb.js';
import { redeemAccountLink } from '/static/Server/accountLink.js';
import { deriveSigningKeyPair, exportPublicKey } from '/static/Server/crypto.js';

const DB_NAME = 'SCC_Identity';
const STORE_NAME = 'credentials';

const loadingEl = document.getElementById('link-loading');
const errorEl = document.getElementById('link-error');
const errorMsg = document.getElementById('link-error-msg');
const confirmEl = document.getElementById('link-confirm');
const successEl = document.getElementById('link-success');

function showError(msg) {
    loadingEl.classList.add('hidden');
    errorMsg.textContent = msg;
    errorEl.classList.remove('hidden');
}

function showSuccess() {
    loadingEl.classList.add('hidden');
    confirmEl.classList.add('hidden');
    successEl.classList.remove('hidden');
}

async function storeIdentity(passphrase, displayName) {
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
}

async function getExistingIdentity() {
    try {
        const db = await openDB(DB_NAME, 1);
        const passphrase = await db.get(STORE_NAME, 'passphrase');
        if (!passphrase) return null;
        const displayName = await db.get(STORE_NAME, 'display_name') || null;
        return { passphrase, displayName };
    } catch {
        return null;
    }
}

// Extract linkId from path and linkSecret from fragment: /sync/<linkId>#<linkSecret>
const pathParts = window.location.pathname.split('/').filter(Boolean);
const linkSecret = window.location.hash?.slice(1) || null;
if (pathParts.length < 2 || pathParts[0] !== 'sync' || !linkSecret) {
    showError('Invalid link format.');
} else {
    const linkId = pathParts[1];

    (async () => {
        try {
            const { passphrase, displayName } = await redeemAccountLink(linkId, linkSecret);
            const existing = await getExistingIdentity();

            loadingEl.classList.add('hidden');
            document.getElementById('confirm-old-name').textContent = existing?.displayName || 'Nameless';
            document.getElementById('confirm-new-name').textContent = displayName || 'Nameless';
            confirmEl.classList.remove('hidden');

            document.getElementById('confirm-switch-btn').addEventListener('click', async () => {
                document.getElementById('confirm-switch-btn').disabled = true;
                document.getElementById('confirm-switch-btn').textContent = 'Syncing...';

                if (!document.getElementById('keep-charts').checked) {
                    const chartsDb = await openDB('SCC_Charts', 1);
                    const tx = chartsDb.transaction('charts', 'readwrite');
                    await tx.objectStore('charts').clear();
                    await tx.done;
                }

                await storeIdentity(passphrase, displayName);
                showSuccess();
            });
        } catch (err) {
            showError(err.message);
        }
    })();
}
