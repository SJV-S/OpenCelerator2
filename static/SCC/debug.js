/**
 * Debug utilities - exposes internals to window for console access
 *
 * Debug Log Capture:
 * - All console.log/error calls with '[CEL DEBUG]' or '[STORAGE]' are captured
 * - Call window.downloadDebugLog() to download the log file
 * - Call window.clearDebugLog() to clear collected logs
 *
 * Current debug focus (misc series change line bugs):
 * - Series selection flow (which series is selected)
 * - Trace meta.seriesName values (are they distinct?)
 * - Date storage/retrieval round-trip (timezone shifts)
 */

import { chartState } from './chartState.js';
import { createToast, createInfoToast, createConfirmToast } from './util/toaster.js';
import { eventBus, EVENTS } from './eventBus.js';

window.chartState = chartState;

// ============================================================================
// DEBUG LOG CAPTURE
// ============================================================================

const debugLog = [];
const DEBUG_PREFIXES = ['[CEL DEBUG]', '[STORAGE]'];

// Store original console methods
const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);

// Override console.log
console.log = function(...args) {
    const message = args.map(a => {
        if (typeof a === 'object') {
            try {
                return JSON.stringify(a, null, 2);
            } catch {
                return String(a);
            }
        }
        return String(a);
    }).join(' ');

    // Check if this is a debug message we want to capture
    if (DEBUG_PREFIXES.some(prefix => message.includes(prefix))) {
        const timestamp = new Date().toISOString();
        debugLog.push(`[${timestamp}] ${message}`);
    }

    // Call original
    originalLog.apply(console, args);
};

// Override console.error
console.error = function(...args) {
    const message = args.map(a => {
        if (typeof a === 'object') {
            try {
                return JSON.stringify(a, null, 2);
            } catch {
                return String(a);
            }
        }
        return String(a);
    }).join(' ');

    // Capture all errors
    const timestamp = new Date().toISOString();
    debugLog.push(`[${timestamp}] ERROR: ${message}`);

    // Call original
    originalError.apply(console, args);
};

// Function to download the log
window.downloadDebugLog = function() {
    if (debugLog.length === 0) {
        alert('No debug logs collected yet. Try performing some actions first.');
        return;
    }

    const content = debugLog.join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`Downloaded ${debugLog.length} log entries`);
};

// Function to clear the log
window.clearDebugLog = function() {
    debugLog.length = 0;
    console.log('Debug log cleared');
};

// Function to get log as string (for copying)
window.getDebugLog = function() {
    return debugLog.join('\n\n');
};

// Expose log array for direct console access
window.debugLog = debugLog;

/**
 * Test toaster stacking - creates multiple notifications
 */
window.testToaster = function() {
    console.log('Starting toaster test...');

    createToast({
        message: 'Toast 1: Auto-dismiss in 5s',
        duration: 5000,
        position: 'top-right'
    });

    setTimeout(() => {
        createToast({
            message: 'Toast 2: With button',
            buttons: [{ label: 'OK', type: 'primary' }],
            layout: 'horizontal',
            position: 'top-right'
        });
    }, 500);

    setTimeout(() => {
        createToast({
            message: 'Toast 3: Auto-dismiss in 4s',
            duration: 4000,
            position: 'top-right'
        });
    }, 1000);

    setTimeout(() => {
        createInfoToast({
            message: 'Toast 4: Info at secondary',
            onCancel: () => console.log('Info cancelled'),
            position: 'top-right'
        });
    }, 1500);

    setTimeout(() => {
        createToast({
            message: 'Toast 5: Also at secondary',
            duration: 6000,
            position: 'top-right'
        });
    }, 2000);

    setTimeout(() => {
        createConfirmToast({
            message: 'Toast 6: Confirm dialog',
            onYes: () => console.log('Yes clicked'),
            onNo: () => console.log('No clicked'),
            position: 'top-right'
        });
    }, 2500);

    console.log('All toasts queued');
};

/**
 * Clear all cel (celeration/change) lines from chart and state
 * Useful for testing cel line creation without reloading the page
 */
window.clearCelLines = function() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) {
        console.log('No chart found');
        return;
    }

    // Remove from Plotly
    const shapes = (chartDiv.layout.shapes || []).filter(s => !s.name?.startsWith('cel-'));
    const annotations = (chartDiv.layout.annotations || []).filter(a => !a.name?.startsWith('cel-'));

    Plotly.relayout(chartDiv, { shapes, annotations });

    // Clear from chartState (preserve settings object)
    const settings = chartState.CelLines.settings;
    Object.keys(chartState.CelLines).forEach(key => {
        if (key !== 'settings') {
            delete chartState.CelLines[key];
        }
    });

    // Trigger save to persist the cleared state
    eventBus.emit(EVENTS.LINE_CEL_SAVED, { cleared: true });

    console.log('Cleared all cel lines and triggered save');
};
