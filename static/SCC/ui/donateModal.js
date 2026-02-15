import { DONATE } from '../config.js';

let copyTimer = null;

function openModal(id) {
    const el = document.getElementById(id);
    el.classList.remove('hidden');
    el.classList.add('flex');
}

function closeModal(id) {
    const el = document.getElementById(id);
    el.classList.add('hidden');
    el.classList.remove('flex');
}

function renderQR(containerId, data) {
    /* global qrcode */
    const qr = qrcode(0, 'M');
    qr.addData(data);
    qr.make();
    document.getElementById(containerId).innerHTML = qr.createSvgTag(4, 0);
}

function copyAddress(address, button) {
    navigator.clipboard.writeText(address);
    button.textContent = 'Copied!';
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
        button.textContent = 'Copy Address';
    }, 3000);
}

export function initDonateModal() {
    const donateModal = 'donate-modal';
    const bitcoinModal = 'bitcoin-modal';
    const baseView = document.getElementById('bitcoin-base-view');
    const lightningView = document.getElementById('bitcoin-lightning-view');
    const toggleBtn = document.getElementById('bitcoin-toggle-btn');

    // Open donate modal
    document.getElementById('donate-btn').addEventListener('click', () => {
        openModal(donateModal);
    });

    // Close button and backdrop close
    document.getElementById('donate-close-btn').addEventListener('click', () => {
        closeModal(donateModal);
    });

    document.getElementById(donateModal).addEventListener('click', (e) => {
        if (e.target.id === donateModal) closeModal(donateModal);
    });

    // PayPal
    document.getElementById('donate-paypal-btn').addEventListener('click', () => {
        window.open(DONATE.PAYPAL_URL, '_blank');
    });

    // Bitcoin — switch modals
    document.getElementById('donate-bitcoin-btn').addEventListener('click', () => {
        closeModal(donateModal);
        openModal(bitcoinModal);
    });

    // Bitcoin back button
    document.getElementById('bitcoin-back-btn').addEventListener('click', () => {
        closeModal(bitcoinModal);
        openModal(donateModal);
    });

    // Bitcoin backdrop close
    document.getElementById(bitcoinModal).addEventListener('click', (e) => {
        if (e.target.id === bitcoinModal) closeModal(bitcoinModal);
    });

    // Toggle base chain / lightning
    toggleBtn.addEventListener('click', () => {
        const showingBase = !baseView.classList.contains('hidden');
        if (showingBase) {
            baseView.classList.add('hidden');
            lightningView.classList.remove('hidden');
            toggleBtn.textContent = 'Base chain';
        } else {
            lightningView.classList.add('hidden');
            baseView.classList.remove('hidden');
            toggleBtn.textContent = 'Lightning';
        }
    });

    // Render QR codes
    renderQR('btc-qr', DONATE.BTC_ADDRESS);
    renderQR('ln-qr', DONATE.LIGHTNING_ADDRESS);

    // Copy addresses
    document.getElementById('copy-btc-btn').addEventListener('click', (e) => {
        copyAddress(DONATE.BTC_ADDRESS, e.currentTarget);
    });

    document.getElementById('copy-ln-btn').addEventListener('click', (e) => {
        copyAddress(DONATE.LIGHTNING_ADDRESS, e.currentTarget);
    });
}
