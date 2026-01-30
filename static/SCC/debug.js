/**
 * Debug utilities - exposes internals to window for console access
 */

import { chartState } from './chartState.js';
import { createToast, createInfoToast, createConfirmToast } from './util/toaster.js';

window.chartState = chartState;

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
