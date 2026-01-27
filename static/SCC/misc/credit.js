// credit.js
// Handles credit form submission and display functionality

import { chartState } from '../chartState.js';
import { createToast } from '../util/toaster.js';
import { eventBus, EVENTS } from '../eventBus.js';

let isEditMode = false;
let originalValues = [];

/**
 * Renders credit lines in #credit-container
 * Click on a line to edit it inline via contenteditable
 */
function renderCredits() {
    const container = document.getElementById('credit-container');
    if (!container) return;

    isEditMode = false;
    container.innerHTML = '';

    if (!chartState.credits) {
        chartState.credits = { 0: '', 1: '' };
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'credit-display';

    [0, 1].forEach(index => {
        const line = document.createElement('div');
        line.className = 'credit-line';
        line.textContent = chartState.credits[index] || '';
        line.dataset.line = index;

        line.addEventListener('click', (e) => {
            e.stopPropagation();
            enterEditMode(line);
        });

        wrapper.appendChild(line);
    });

    container.appendChild(wrapper);
}

/**
 * Makes a single credit line editable
 */
function enterEditMode(lineElement) {
    if (isEditMode) return;
    isEditMode = true;

    const index = lineElement.dataset.line;
    originalValues[index] = lineElement.textContent;

    lineElement.contentEditable = 'true';
    lineElement.classList.add('editing');
    lineElement.focus();

    lineElement.addEventListener('keydown', handleKeydown);
    lineElement.addEventListener('blur', handleBlur);
}

function handleKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        const index = e.target.dataset.line;
        e.target.textContent = originalValues[index];
        e.target.blur();
    }
}

function handleBlur(e) {
    const lineElement = e.target;
    lineElement.removeEventListener('keydown', handleKeydown);
    lineElement.removeEventListener('blur', handleBlur);

    lineElement.contentEditable = 'false';
    lineElement.classList.remove('editing');

    const index = lineElement.dataset.line;
    const newValue = lineElement.textContent;

    if (newValue !== originalValues[index]) {
        chartState.credits[index] = newValue;

        // Sync sidebar form fields
        const sidebarInput = document.getElementById(`credit-line-${index}`);
        if (sidebarInput) sidebarInput.value = newValue;

        createToast({
            message: 'Credit updated',
            duration: 2000,
            position: 'top-right'
        });
    }

    isEditMode = false;
}

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

    // Re-render credits display
    renderCredits();

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
 * Initialize event subscriptions and render initial credits
 */
function init() {
    eventBus.subscribe(EVENTS.NAV_TAB_SWITCH, (data) => {
        if (data.tab === 'credit') {
            loadCreditData();
        }
    }, true);

    // Render credits on initialization
    renderCredits();
}

export { submitCredit, loadCreditData, renderCredits, init };