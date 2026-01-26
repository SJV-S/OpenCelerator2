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
 * - Updates chartState.credits object
 * - Hides counter overlay by manipulating DOM element
 */
function submitCredit() {
    // Collect form data (JavaScript variables = values from DOM input elements)
    const supervisor = document.getElementById('supervisor').value;
    const performer = document.getElementById('performer').value;
    const timer = document.getElementById('timer').value;
    const counted = document.getElementById('counted').value;
    const advisor = document.getElementById('advisor').value;
    const organization = document.getElementById('organization').value;
    const manager = document.getElementById('manager').value;
    const counter = document.getElementById('counter').value;
    const charter = document.getElementById('charter').value;
    const room = document.getElementById('room').value;
    const notes = document.getElementById('notes').value;

    // Update chartState.credits object
    // chartState defined in: static/chartState.js (loaded globally in base.html)
    // Access: Direct property assignment to global chartState object
    chartState.credits = {
        supervisor: supervisor,
        performer: performer,
        timer: timer,
        counted: counted,
        advisor: advisor,
        organization: organization,
        manager: manager,
        counter: counter,
        charter: charter,
        room: room,
        notes: notes
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

    // Populate form fields from chartState.credits
    // Data flow: chartState.credits (JavaScript object) → DOM input elements
    document.getElementById('supervisor').value = chartState.credits.supervisor || '';
    document.getElementById('performer').value = chartState.credits.performer || '';
    document.getElementById('timer').value = chartState.credits.timer || '';
    document.getElementById('counted').value = chartState.credits.counted || '';
    document.getElementById('advisor').value = chartState.credits.advisor || '';
    document.getElementById('organization').value = chartState.credits.organization || '';
    document.getElementById('manager').value = chartState.credits.manager || '';
    document.getElementById('counter').value = chartState.credits.counter || '';
    document.getElementById('charter').value = chartState.credits.charter || '';
    document.getElementById('room').value = chartState.credits.room || '';
    document.getElementById('notes').value = chartState.credits.notes || '';

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