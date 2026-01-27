// credit.js
// Handles credit form submission functionality

import { chartState } from '../chartState.js';
import { createToast } from '../util/toaster.js';
import { eventBus, EVENTS } from '../eventBus.js';

/**
 * Submits credit information from the credit form
 *
 * Data flow:
 * - Reads form field values from DOM (defined in credit_tab.html via Jinja template)
 * - Updates chartState.credits object (two string rows)
 */
function submitCredit() {
    // Collect form data (two credit line strings)
    const creditLine0 = document.getElementById('credit-line-0').value;
    const creditLine1 = document.getElementById('credit-line-1').value;

    // Update chartState.credits object
    // chartState defined in: static/chartState.js (loaded globally in base.html)
    chartState.credits = {
        0: creditLine0,
        1: creditLine1
    };

    console.log('Credit information updated in chartState:', chartState.credits);

    // Show toast notification
    createToast({
        message: 'Updated',
        duration: 2000,
        position: 'top-right'
    });
}

/**
 * Populates the credit form fields from chartState
 *
 * Defined in: static/misc/credit.js
 * Accessible from: Other scripts via window object
 * Mechanism: Called when credit tab is selected to load saved credit information
 *
 * Data flow:
 * - Reads chartState.credits object (defined in chartState.js, loaded globally)
 * - Sets DOM input element values to populate the form fields
 * - If chartState.credits doesn't exist, form fields remain empty
 */
function loadCreditData() {
    // Check if chartState and credits section exist
    // chartState defined in: static/chartState.js (loaded globally)
    if (typeof chartState === 'undefined' || !chartState.credits) {
        console.log('No credit data available to load');
        return;
    }

    // Populate form fields from chartState.credits (two string rows)
    // Data flow: chartState.credits (JavaScript object) → DOM input elements
    document.getElementById('credit-line-0').value = chartState.credits[0] || '';
    document.getElementById('credit-line-1').value = chartState.credits[1] || '';

    console.log('Credit data loaded into form from chartState');
}

/**
 * Initialize event subscriptions
 */
function init() {
    eventBus.subscribe(EVENTS.NAV_TAB_SWITCH, (data) => {
        if (data.tab === 'credit') {
            loadCreditData();
        }
    }, true);
}

export { submitCredit, loadCreditData, init };