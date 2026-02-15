// navigation.js
// Handles tab switching, counter overlay control, and gesture/keyboard navigation

import { chartState } from './chartState.js';
import { TIMING_MS } from './config.js';
import { updateDateDisplay, formatDateInputValue } from './util/dates.js';
import { createToast, removeAllToasts } from './ui/toaster.js';
import { showDismissMenuHint } from './ui/tooltip.js';
import { eventBus, EVENTS } from './eventBus.js';

/**
 * Shows the counter overlay
 */
function showCounter() {
    const counterOverlay = document.getElementById('counter-overlay');
    if (counterOverlay) {
        counterOverlay.style.display = 'flex';

        // Clear all toast notifications when menu opens
        removeAllToasts();

        // Auto-disable all line category editing when menu opens (without showing toast)
        disableAllLineEditing();

        // Update the date input to reflect current startDate
        const otherDateInput = document.getElementById('other-date');
        if (otherDateInput && chartState.startDate) {
            otherDateInput.value = formatDateInputValue(chartState.startDate);
            // Update the visible display
            updateDateDisplay(chartState.startDate);
        }

        // Emit counter show event for entry date indicator
        eventBus.emit(EVENTS.COUNTER_SHOW);

        // Show dismiss menu hint tooltip
        setTimeout(showDismissMenuHint, 300);
    }
}

/**
 * Hides the counter overlay
 *
 * Defined in: static/navigation.js
 * Accessible from: Other scripts and inline handlers via window object
 */
function hideCounter() {
    const counterOverlay = document.getElementById('counter-overlay');
    if (counterOverlay) {
        counterOverlay.style.display = 'none';
    }

    // Emit counter hide event to remove entry date indicator
    eventBus.emit(EVENTS.COUNTER_HIDE);
}

/**
 * Switches between tabs in the counter overlay
 * @param {string} tabName - The name of the tab to switch to ('counter', 'credit', or 'lines')
 *
 * Defined in: static/navigation.js
 * Accessible from: Inline HTML onclick handlers in chart.html via window object
 * Mechanism: Function attached to window object, called from template buttons
 */
function switchTab(tabName) {
    document.querySelectorAll('.chart-menu-tab-pane').forEach(content => {
        content.classList.remove('active');
    });

    document.querySelectorAll('.chart-menu-tabs .chart-menu-tab-btn').forEach(button => {
        button.classList.remove('active');
    });

    const activeContent = document.getElementById(tabName + '-content');
    if (activeContent) {
        activeContent.classList.add('active');
    }

    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    eventBus.emit(EVENTS.NAV_TAB_SWITCH, { tab: tabName });
}

/**
 * Switches between sub-tabs in the Data tab (New / Previous)
 * @param {string} subtab - The sub-tab to switch to ('new' or 'previous')
 */
function switchDataSubtab(subtab) {
    document.querySelectorAll('.data-subtabs .chart-menu-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.querySelectorAll('.data-subpane').forEach(pane => {
        pane.classList.remove('active');
    });

    const activeBtn = document.querySelector(`[data-subtab="${subtab}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    const activePane = document.getElementById(`${subtab}-subpane`);
    if (activePane) {
        activePane.classList.add('active');
    }

    eventBus.emit(EVENTS.NAV_DATA_SUBTAB_SWITCH, { subtab });
}

/**
 * Phase line button functions - coordinate between overlay and line drawing
 * These hide the counter overlay and activate line drawing modes
 *
 * Defined in: static/navigation.js
 * Accessible from: Inline HTML onclick handlers in lines.html via window object
 * Mechanism: Functions call hideCounter() (local), then specific drawing functions
 */

function phaseTextTop() {
    hideCounter();
    eventBus.emit(EVENTS.MODE_PHASE_ACTIVATE, { direction: 'top' });
}

function phaseTextBottom() {
    hideCounter();
    eventBus.emit(EVENTS.MODE_PHASE_ACTIVATE, { direction: 'bottom' });
}

/**
 * Aim button functions - activate aim line mode
 */
function aimDiagonal() {
    hideCounter();
    eventBus.emit(EVENTS.MODE_AIM_ACTIVATE, { direction: 'diagonal' });
}

function aimHorizontal() {
    hideCounter();
    eventBus.emit(EVENTS.MODE_AIM_ACTIVATE, { direction: 'horizontal' });
}

/**
 * Other button functions - activate drawing modes
 */
function otherScissors() {
    hideCounter();
    eventBus.emit(EVENTS.MODE_CUT_ACTIVATE);
}

function otherCeleration() {
    hideCounter();
    eventBus.emit(EVENTS.MODE_CEL_ACTIVATE);
}

// Per-category edit state
const lineEditState = {
    phase: false,
    aim: false,
    cut: false,
    cel: false
};

/**
 * Toggle line clickability for a specific category
 * @param {string} category - 'phase', 'aim', 'cut', or 'cel'
 * @param {boolean} enabled - Whether to enable or disable
 * @param {boolean} showToast - Whether to show the toast notification (default: true)
 */
function toggleLineCategoryEdit(category, enabled, showToast = true) {
    if (!lineEditState.hasOwnProperty(category)) {
        console.warn(`Unknown line category: ${category}`);
        return;
    }

    lineEditState[category] = enabled;

    // Emit event with category and enabled state
    eventBus.emit(EVENTS.NAV_LINE_CLICKABILITY_TOGGLE, { category, enabled });
    // Show feedback to user
    if (showToast) {
        const categoryLabels = {
            phase: 'Event marker',
            aim: 'Count marker',
            cut: 'Cut line',
            cel: 'Change line'
        };
        createToast({
            message: `${categoryLabels[category]} editing ${enabled ? 'enabled' : 'disabled'}`,
            duration: 2000,
            position: 'top-right'
        });
    }
}

/**
 * Get current line edit state for a category
 * @param {string} category - 'phase', 'aim', 'cut', or 'cel'
 * @returns {boolean} Whether editing is enabled for that category
 */
function isLineCategoryEditEnabled(category) {
    return lineEditState[category] || false;
}

/**
 * Disable all line category editing (called when menu opens)
 */
function disableAllLineEditing() {
    for (const category of Object.keys(lineEditState)) {
        if (lineEditState[category]) {
            lineEditState[category] = false;
            eventBus.emit(EVENTS.NAV_LINE_CLICKABILITY_TOGGLE, { category, enabled: false });
        }
    }
}

/**
 * Initialize Enter key handler for form submission
 */
function initFormKeyboardShortcuts() {
    document.querySelectorAll('input[type="number"]').forEach(field => {
        field.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                // Find and click the submit button in the counter tab
                const submitBtn = document.querySelector('[data-action="submit-entry"]');
                if (submitBtn) {
                    submitBtn.click();
                }
            }
        });
    });
}

function initGestureNavigation() {
    let touchStartY = null;
    let touchStartX = null;

    // Touch start
    document.addEventListener('touchstart', function(e) {
        const counterOverlay = document.getElementById('counter-overlay');
        const counterVisible = counterOverlay && counterOverlay.style.display === 'flex';

        // Only ignore touches on inputs/textareas when overlay is NOT visible
        // This allows swipe-down to work from anywhere when overlay is open
        if (!counterVisible) {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' ||
                e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
                touchStartY = null;
                touchStartX = null;
                return;
            }
        }

        if (e.touches.length === 1) {
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
        }
    }, { passive: true });

    // Touch end - detect swipe
    document.addEventListener('touchend', function(e) {
        if (touchStartY === null || touchStartX === null) {
            return;
        }

        const touchEndY = e.changedTouches[0].clientY;
        const touchEndX = e.changedTouches[0].clientX;
        const deltaY = touchStartY - touchEndY;
        const deltaX = Math.abs(touchEndX - touchStartX);

        // Ensure vertical swipe (not horizontal)
        if (deltaX < TIMING_MS.SWIPE_THRESHOLD) {
            const counterOverlay = document.getElementById('counter-overlay');
            const counterVisible = counterOverlay && counterOverlay.style.display === 'flex';

            if (deltaY > TIMING_MS.SWIPE_THRESHOLD) {
                // Swipe up - show counter
                if (!counterVisible) {
                    showCounter();
                }
            } else if (deltaY < -TIMING_MS.SWIPE_THRESHOLD) {
                // Swipe down - hide counter
                if (counterVisible) {
                    hideCounter();
                }
            }
        }

        touchStartY = null;
        touchStartX = null;
    }, { passive: true });

    // Spacebar to toggle counter
    document.addEventListener('keydown', function(e) {
        if (e.key === ' ' || e.code === 'Space') {
            // Don't trigger if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            e.preventDefault();
            const counterOverlay = document.getElementById('counter-overlay');
            if (counterOverlay) {
                if (counterOverlay.style.display === 'flex') {
                    hideCounter();
                } else {
                    showCounter();
                }
            }
        }

        // Shift+F to toggle fullscreen
        if (e.key === 'F' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            e.preventDefault();
            eventBus.emit(EVENTS.FULLSCREEN_TOGGLE);
        }
    });
}

/**
 * Initialize subscriptions for this module
 * Called by main.js coordinator
 */
function init() {
    // Subscribe to data entry submitted event to hide counter
    eventBus.subscribe(EVENTS.DATA_ENTRY_SUBMITTED, () => {
        hideCounter();
    });
}

// Export functions for use in main.js
export { showCounter, hideCounter, switchTab, switchDataSubtab, phaseTextTop, phaseTextBottom, aimDiagonal, aimHorizontal, otherScissors, otherCeleration, toggleLineCategoryEdit, isLineCategoryEditEnabled, disableAllLineEditing, initGestureNavigation, initFormKeyboardShortcuts, init };