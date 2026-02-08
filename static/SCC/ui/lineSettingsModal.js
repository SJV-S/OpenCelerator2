/**
 * Line Settings Modal - Placeholder modal for line category settings
 *
 * Triggered by gear icons next to "Event markers", "Count markers",
 * and "Add change line" headings in the lines tab.
 *
 * The cel category delegates to celSettingsModal.js for real settings.
 */

import { showCelSettingsModal } from './celSettingsModal.js';

let modalOverlay = null;
let modalTitle = null;
let modalBody = null;

const CATEGORY_LABELS = {
    phase: 'Event Markers',
    aim: 'Count Markers',
    cel: 'Change Line'
};

/**
 * Create the modal DOM structure (once, lazily)
 */
function createModal() {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'line-settings-modal-overlay';
    modalOverlay.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center';
    modalOverlay.style.display = 'none';

    const content = document.createElement('div');
    content.className = 'bg-white rounded-lg shadow-xl p-6 min-w-[280px] max-w-[90vw]';

    modalTitle = document.createElement('h2');
    modalTitle.className = 'text-lg font-semibold text-gray-700 mb-4 text-center';

    modalBody = document.createElement('p');
    modalBody.className = 'text-sm text-gray-500 text-center mb-4';
    modalBody.textContent = 'Settings coming soon.';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'w-full py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-medium transition-colors';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', hideModal);

    content.appendChild(modalTitle);
    content.appendChild(modalBody);
    content.appendChild(closeBtn);
    modalOverlay.appendChild(content);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) hideModal();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay.style.display !== 'none') {
            hideModal();
        }
    });

    document.body.appendChild(modalOverlay);
}

/**
 * Show the modal for a given line category
 * @param {string} category - 'phase', 'aim', or 'cel'
 */
function showModal(category) {
    // Cel has its own dedicated modal with real settings
    if (category === 'cel') {
        showCelSettingsModal();
        return;
    }

    if (!modalOverlay) createModal();

    const label = CATEGORY_LABELS[category] || category;
    modalTitle.textContent = `${label} Settings`;
    modalOverlay.style.display = 'flex';
}

/**
 * Hide the modal
 */
function hideModal() {
    if (modalOverlay) modalOverlay.style.display = 'none';
}

/**
 * Initialize - attach click listeners to gear buttons via delegation
 */
export function initLineSettingsModal() {
    // Click delegation for gear buttons
    document.addEventListener('click', (e) => {
        const gear = e.target.closest('.line-settings-gear');
        if (!gear) return;

        e.stopPropagation();
        const target = gear.dataset.settingsTarget;
        if (target) showModal(target);
    });

    console.log('lineSettingsModal.js initialized');
}

console.log('lineSettingsModal.js loaded');
