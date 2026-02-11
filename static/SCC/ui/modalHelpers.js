/**
 * Shared modal utilities - DRY helpers for modal close behavior.
 */

/**
 * Sets up standard modal close behavior: click-outside and Escape key.
 * @param {HTMLElement} overlay - The modal overlay element
 * @param {Function} hideFn - Function to call when closing
 */
export function setupModalClose(overlay, hideFn) {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideFn();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.style.display !== 'none') {
            hideFn();
        }
    });
}
