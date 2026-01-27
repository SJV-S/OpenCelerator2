// navigation.js
// Handles tab switching, counter overlay control, and gesture/keyboard navigation

import { chartState } from './chartState.js';
import { updateDateDisplay } from './util/dates.js';
import { createToast, removeAllToasts } from './util/toaster.js';
import { showDismissMenuHint } from './util/tooltip.js';
import { eventBus, EVENTS } from './eventBus.js';

// ============================================================================
// COUNTER OVERLAY CONTROL
// ============================================================================

/**
 * Shows the counter overlay
 */
function showCounter() {
    const counterOverlay = document.getElementById('counter-overlay');
    if (counterOverlay) {
        counterOverlay.style.display = 'flex';

        // Clear all toast notifications when menu opens
        removeAllToasts();

        // Auto-disable line editing when menu opens (without showing toast)
        if (lineClickabilityEnabled) {
            toggleLineClickability(false);
        }

        // Update the date input to reflect current startDate
        const otherDateInput = document.getElementById('other-date');
        if (otherDateInput && chartState.startDate) {
            otherDateInput.value = chartState.startDate.toISOString().split('T')[0];
            // Update the visible display
            updateDateDisplay(chartState.startDate);
        }

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
}

// ============================================================================
// TAB SWITCHING
// ============================================================================

/**
 * Switches between tabs in the counter overlay
 * @param {string} tabName - The name of the tab to switch to ('counter', 'credit', or 'lines')
 *
 * Defined in: static/navigation.js
 * Accessible from: Inline HTML onclick handlers in chart.html via window object
 * Mechanism: Function attached to window object, called from template buttons
 */
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });

    // Remove active styling from all tabs (reset to transparent)
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('bg-[#6ad1e3]');
        button.classList.add('bg-transparent');
    });

    // Show selected tab content
    document.getElementById(tabName + '-content').style.display = 'block';

    // Add active styling to selected tab
    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    activeButton.classList.remove('bg-transparent');
    activeButton.classList.add('bg-[#6ad1e3]');

    // Emit tab switch event - subscribers load data as needed
    eventBus.emit(EVENTS.NAV_TAB_SWITCH, { tab: tabName });
}

// ============================================================================
// LINE DRAWING BUTTON FUNCTIONS
// ============================================================================

/**
 * Phase line button functions - coordinate between overlay and line drawing
 * These hide the counter overlay and activate line drawing modes
 *
 * Defined in: static/navigation.js
 * Accessible from: Inline HTML onclick handlers in lines.html via window object
 * Mechanism: Functions call hideCounter() (local), then specific drawing functions
 */

function phaseTextTop() {
    console.log('Phase Text Top button clicked');
    hideCounter();
    eventBus.emit(EVENTS.MODE_PHASE_ACTIVATE, { direction: 'top' });
}

function phaseTextBottom() {
    console.log('Phase Text Bottom button clicked');
    hideCounter();
    eventBus.emit(EVENTS.MODE_PHASE_ACTIVATE, { direction: 'bottom' });
}

/**
 * Aim button functions - activate aim line mode
 */
function aimDiagonal() {
    console.log('Aim Diagonal button clicked');
    hideCounter();
    eventBus.emit(EVENTS.MODE_AIM_ACTIVATE, { direction: 'diagonal' });
}

function aimHorizontal() {
    console.log('Aim Horizontal button clicked');
    hideCounter();
    eventBus.emit(EVENTS.MODE_AIM_ACTIVATE, { direction: 'horizontal' });
}

/**
 * Other button functions - activate drawing modes
 */
function otherScissors() {
    console.log('Other Scissors button clicked');
    hideCounter();
    eventBus.emit(EVENTS.MODE_CUT_ACTIVATE);
}

function otherCeleration() {
    console.log('Other Celeration button clicked');
    hideCounter();
    eventBus.emit(EVENTS.MODE_CEL_ACTIVATE);
}

// ============================================================================
// LINE CLICKABILITY TOGGLE
// ============================================================================

// Track current state of line clickability
let lineClickabilityEnabled = false;

/**
 * Toggle line clickability on/off
 * Triggered by long press (touch) or long mouse hold
 * @param {boolean} showToast - Whether to show the toast notification (default: true)
 */
function toggleLineClickability(showToast = true) {
    // Toggle state
    lineClickabilityEnabled = !lineClickabilityEnabled;

    // Emit event to toggle line clickability
    eventBus.emit(EVENTS.NAV_LINE_CLICKABILITY_TOGGLE, { enabled: lineClickabilityEnabled });
    console.log(`Line clickability ${lineClickabilityEnabled ? 'enabled' : 'disabled'}`);

    // Show feedback to user
    if (showToast) {
        createToast({
            message: `Line editing ${lineClickabilityEnabled ? 'enabled' : 'disabled'}`,
            duration: lineClickabilityEnabled ? undefined : 3000,  // No time limit when ON, 3s when OFF
            position: 'top-left'
        });
    }
}

// ============================================================================
// GESTURE AND KEYBOARD NAVIGATION
// ============================================================================

/**
 * Initialize Enter key handler for form submission
 * Allows pressing Enter in any number input field to submit data entry
 */
function initFormKeyboardShortcuts() {
    // Allow Enter key to submit from any number input field
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
    const SWIPE_THRESHOLD = 100; // minimum distance for a swipe
    const LONG_PRESS_DURATION = 500; // milliseconds for long press

    let touchTimer = null;
    let mouseTimer = null;
    let touchMoved = false;

    // Touch start
    document.addEventListener('touchstart', function(e) {
        touchMoved = false;
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

            // Start long press timer
            touchTimer = setTimeout(() => {
                if (!touchMoved) {
                    toggleLineClickability();
                }
            }, LONG_PRESS_DURATION);
        }
    }, { passive: true });

    // Touch move - cancel long press if significant movement
    document.addEventListener('touchmove', function(e) {
        if (touchStartY !== null && touchStartX !== null && e.touches.length === 1) {
            const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
            const deltaX = Math.abs(e.touches[0].clientX - touchStartX);

            // If moved more than 10px, consider it a move (not a long press)
            if (deltaY > 10 || deltaX > 10) {
                touchMoved = true;
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
            }
        }
    }, { passive: true });

    // Touch end - detect swipe and clear long press timer
    document.addEventListener('touchend', function(e) {
        // Clear long press timer
        if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
        }

        if (touchStartY === null || touchStartX === null) {
            return;
        }

        const touchEndY = e.changedTouches[0].clientY;
        const touchEndX = e.changedTouches[0].clientX;
        const deltaY = touchStartY - touchEndY;
        const deltaX = Math.abs(touchEndX - touchStartX);

        // Ensure vertical swipe (not horizontal)
        if (deltaX < SWIPE_THRESHOLD) {
            const counterOverlay = document.getElementById('counter-overlay');
            const counterVisible = counterOverlay && counterOverlay.style.display === 'flex';

            if (deltaY > SWIPE_THRESHOLD) {
                // Swipe up - show counter
                if (!counterVisible) {
                    console.log('Swipe up detected - showing counter');
                    showCounter();
                }
            } else if (deltaY < -SWIPE_THRESHOLD) {
                // Swipe down - hide counter
                if (counterVisible) {
                    console.log('Swipe down detected - hiding counter');
                    hideCounter();
                }
            }
        }

        touchStartY = null;
        touchStartX = null;
        touchMoved = false;
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
    });

    // ========================================================================
    // MOUSE LONG PRESS (Desktop)
    // ========================================================================

    let mouseStartX = null;
    let mouseStartY = null;
    let mouseMoved = false;

    // Mouse down - start long press timer
    document.addEventListener('mousedown', function(e) {
        // Ignore right-click and middle-click
        if (e.button !== 0) return;

        // Ignore clicks on UI elements
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' ||
            e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        mouseMoved = false;
        mouseStartX = e.clientX;
        mouseStartY = e.clientY;

        // Start long press timer
        mouseTimer = setTimeout(() => {
            if (!mouseMoved) {
                toggleLineClickability();
            }
        }, LONG_PRESS_DURATION);
    });

    // Mouse move - cancel long press if significant movement
    document.addEventListener('mousemove', function(e) {
        if (mouseStartX !== null && mouseStartY !== null) {
            const deltaX = Math.abs(e.clientX - mouseStartX);
            const deltaY = Math.abs(e.clientY - mouseStartY);

            // If moved more than 10px, consider it a drag (not a long press)
            if (deltaX > 10 || deltaY > 10) {
                mouseMoved = true;
                if (mouseTimer) {
                    clearTimeout(mouseTimer);
                    mouseTimer = null;
                }
            }
        }
    });

    // Mouse up - clear long press timer
    document.addEventListener('mouseup', function(e) {
        if (mouseTimer) {
            clearTimeout(mouseTimer);
            mouseTimer = null;
        }

        mouseStartX = null;
        mouseStartY = null;
        mouseMoved = false;
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
export { showCounter, hideCounter, switchTab, phaseTextTop, phaseTextBottom, aimDiagonal, aimHorizontal, otherScissors, otherCeleration, toggleLineClickability, initGestureNavigation, initFormKeyboardShortcuts, init };