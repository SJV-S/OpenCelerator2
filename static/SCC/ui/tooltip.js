/**
 * tooltip.js
 * Simple, discrete menu hint tooltip with upward-pointing arrow
 */

import { TIMING_MS } from '../config.js';

// Global variable to control tooltip display
let tooltipEnabled = false;

/**
 * Shows a menu hint tooltip with custom message
 * @param {string} message - The message to display
 * @param {string} arrowDirection - Arrow direction: 'up' or 'down' (default: 'up')
 * @param {boolean} showArrow - Whether to show arrow (default: true, set false for desktop)
 * @param {number} duration - Duration in milliseconds before auto-dismiss (default: 4000)
 */
function showMenuTooltip(message, arrowDirection = 'up', showArrow = true, duration = TIMING_MS.TOOLTIP_DISPLAY) {
    // Don't show tooltip if disabled
    if (!tooltipEnabled) {
        return;
    }

    const hintElement = document.getElementById('menu-hint');
    const hintText = document.getElementById('menu-hint-text');
    const arrowUp = document.getElementById('menu-hint-arrow-up');
    const arrowDown = document.getElementById('menu-hint-arrow-down');

    if (!hintElement || !hintText || !arrowUp || !arrowDown) {
        console.warn('Menu tooltip elements not found');
        return;
    }

    // Show/hide arrows based on showArrow parameter
    if (showArrow) {
        if (arrowDirection === 'down') {
            arrowUp.style.display = 'none';
            arrowDown.style.display = 'block';
        } else {
            arrowUp.style.display = 'block';
            arrowDown.style.display = 'none';
        }
    } else {
        // Hide both arrows for desktop
        arrowUp.style.display = 'none';
        arrowDown.style.display = 'none';
    }

    hintText.textContent = message;
    hintElement.style.display = 'flex';

    // Fade in
    setTimeout(() => {
        hintElement.style.opacity = '1';
    }, TIMING_MS.TOOLTIP_FADE_IN);

    // Fade out and hide after duration
    setTimeout(() => {
        hintElement.style.opacity = '0';
        setTimeout(() => {
            hintElement.style.display = 'none';
        }, TIMING_MS.TOOLTIP_FADE_DURATION);
    }, duration);
}

/**
 * Shows the initial menu hint on chart load
 * Detects mobile vs desktop and shows appropriate message
 */
function showInitialMenuHint() {
    const isMobile = ('ontouchstart' in window) ||
                     (navigator.maxTouchPoints > 0) ||
                     (window.matchMedia("(pointer: coarse)").matches);

    const message = isMobile ? 'Swipe up for menu' : 'Press spacebar for menu';
    showMenuTooltip(message, 'up', isMobile, TIMING_MS.TOOLTIP_DISPLAY);
}

/**
 * Shows the dismiss menu hint when menu is open
 * Detects mobile vs desktop and shows appropriate message
 */
function showDismissMenuHint() {
    const isMobile = ('ontouchstart' in window) ||
                     (navigator.maxTouchPoints > 0) ||
                     (window.matchMedia("(pointer: coarse)").matches);

    const message = isMobile ? 'Swipe down to remove menu' : 'Press spacebar to remove menu';
    showMenuTooltip(message, 'down', isMobile, TIMING_MS.TOOLTIP_DISPLAY);
}

// Export as ES module
export {
    showMenuTooltip,
    showInitialMenuHint,
    showDismissMenuHint,
    tooltipEnabled
};
