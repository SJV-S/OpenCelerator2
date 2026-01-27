// credit.js
// Handles credit form submission and display functionality

import { chartState } from '../chartState.js';
import { createToast } from '../util/toaster.js';
import { eventBus, EVENTS } from '../eventBus.js';

let isEditMode = false;
let originalValues = [];

/**
 * Renders credit lines in #credit-container (desktop) and mobile credit tab
 * Click on a line to edit it inline via contenteditable
 */
function renderCredits() {
    if (!chartState.credits) {
        chartState.credits = { 0: '', 1: '' };
    }

    isEditMode = false;

    // Render desktop credit container
    const container = document.getElementById('credit-container');
    if (container) {
        container.innerHTML = '';

        // Pad container to match chart's plot area margins
        const chartDiv = document.getElementById('chart');
        if (chartDiv && chartDiv.layout) {
            const layout = chartDiv.layout;
            const marginLeft = layout.margin?.l || 0;
            const marginRight = layout.margin?.r || 0;

            container.style.paddingLeft = `${marginLeft}px`;
            container.style.paddingRight = `${marginRight}px`;
            container.style.boxSizing = 'border-box';
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

    // Render mobile credit lines (display only)
    [0, 1].forEach(index => {
        const mobileLine = document.getElementById(`mobile-credit-${index}`);
        if (mobileLine) {
            mobileLine.textContent = chartState.credits[index] || '';
        }
    });
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

        createToast({
            message: 'Credit updated',
            duration: 2000,
            position: 'top-right'
        });
    }

    isEditMode = false;
}


/**
 * Initialize event subscriptions and render initial credits
 */
function init() {
    eventBus.subscribe(EVENTS.NAV_TAB_SWITCH, (data) => {
        if (data.tab === 'credit') {
            // Refresh mobile credit lines when switching to credit tab
            renderCredits();
        }
    }, true);

    // Render credits on initialization
    renderCredits();
}

export { renderCredits, init };