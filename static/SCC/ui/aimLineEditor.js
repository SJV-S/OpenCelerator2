/**
 * Aim Line Editor - Per-line style editor for count markers (aim lines)
 *
 * Opened when the user clicks an existing aim line and selects "Edit".
 * Reads/writes the specific line's metadata.style (color, width, dash).
 * Triggers a redraw on close so changes are reflected immediately.
 */

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';

let modalOverlay = null;
let colorInput = null;
let widthInput = null;
let dashSelect = null;
let textInput = null;
let fontColorInput = null;
let fontSizeInput = null;
let titleEl = null;

// Currently editing line
let activeLineId = null;

const DASH_OPTIONS = [
    { value: 'solid', label: 'Solid' },
    { value: 'dash', label: 'Dash' },
    { value: 'dot', label: 'Dot' },
    { value: 'dashdot', label: 'Dash-Dot' },
    { value: 'longdash', label: 'Long Dash' },
    { value: 'longdashdot', label: 'Long Dash-Dot' }
];

/**
 * Create the modal DOM structure (once, lazily)
 */
function createModal() {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'aim-line-editor-overlay';
    modalOverlay.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center';
    modalOverlay.style.display = 'none';

    const content = document.createElement('div');
    content.className = 'bg-white rounded-lg shadow-xl p-6 min-w-[280px] max-w-[90vw]';

    // Title
    titleEl = document.createElement('h2');
    titleEl.className = 'text-lg font-semibold text-gray-700 mb-4 text-center';

    // --- Color ---
    const colorRow = document.createElement('div');
    colorRow.className = 'mb-3';

    const colorLabel = document.createElement('label');
    colorLabel.className = 'block text-sm text-gray-500 mb-1';
    colorLabel.textContent = 'Color';

    colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'w-full h-9 border-2 border-gray-300 rounded cursor-pointer';

    colorInput.addEventListener('input', (e) => {
        const style = getActiveStyle();
        if (style) style.color = e.target.value;
    });

    colorRow.appendChild(colorLabel);
    colorRow.appendChild(colorInput);

    // --- Width ---
    const widthRow = document.createElement('div');
    widthRow.className = 'mb-3';

    const widthLabel = document.createElement('label');
    widthLabel.className = 'block text-sm text-gray-500 mb-1';
    widthLabel.textContent = 'Width';

    widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.min = '0.5';
    widthInput.max = '8';
    widthInput.step = '0.5';
    widthInput.className = 'w-full px-3 py-2 lg:px-2 lg:py-1 text-sm border-2 border-gray-300 rounded focus:outline-none focus:border-[#6ad1e3] transition-colors';

    widthInput.addEventListener('change', (e) => {
        const style = getActiveStyle();
        if (!style) return;
        const value = parseFloat(e.target.value) || 2;
        style.width = Math.max(0.5, Math.min(8, value));
        e.target.value = style.width;
        e.target.blur();
    });

    widthRow.appendChild(widthLabel);
    widthRow.appendChild(widthInput);

    // --- Dash ---
    const dashRow = document.createElement('div');
    dashRow.className = 'mb-4';

    const dashLabel = document.createElement('label');
    dashLabel.className = 'block text-sm text-gray-500 mb-1';
    dashLabel.textContent = 'Dash Style';

    dashSelect = document.createElement('select');
    dashSelect.className = 'w-full px-3 py-2 lg:px-2 lg:py-1 text-sm border-2 border-gray-300 rounded focus:outline-none focus:border-[#6ad1e3] transition-colors bg-white';
    DASH_OPTIONS.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        dashSelect.appendChild(option);
    });

    dashSelect.addEventListener('change', (e) => {
        const style = getActiveStyle();
        if (style) style.dash = e.target.value;
        e.target.blur();
    });

    dashRow.appendChild(dashLabel);
    dashRow.appendChild(dashSelect);

    // --- Divider ---
    const divider = document.createElement('div');
    divider.className = 'border-t border-gray-200 my-4';

    const fontSectionLabel = document.createElement('div');
    fontSectionLabel.className = 'text-sm font-semibold text-gray-600 mb-3 text-center';
    fontSectionLabel.textContent = 'Label';

    // --- Text ---
    const textRow = document.createElement('div');
    textRow.className = 'mb-3';

    const textLabel = document.createElement('label');
    textLabel.className = 'block text-sm text-gray-500 mb-1';
    textLabel.textContent = 'Text';

    textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'w-full px-3 py-2 lg:px-2 lg:py-1 text-sm border-2 border-gray-300 rounded focus:outline-none focus:border-[#6ad1e3] transition-colors';

    textInput.addEventListener('input', (e) => {
        if (activeLineId == null) return;
        const metadata = chartState.AimLines[activeLineId];
        if (metadata) metadata.text = e.target.value;
    });

    textRow.appendChild(textLabel);
    textRow.appendChild(textInput);

    // --- Font Color ---
    const fontColorRow = document.createElement('div');
    fontColorRow.className = 'mb-3';

    const fontColorLabel = document.createElement('label');
    fontColorLabel.className = 'block text-sm text-gray-500 mb-1';
    fontColorLabel.textContent = 'Color';

    fontColorInput = document.createElement('input');
    fontColorInput.type = 'color';
    fontColorInput.className = 'w-full h-9 border-2 border-gray-300 rounded cursor-pointer';

    fontColorInput.addEventListener('input', (e) => {
        const style = getActiveStyle();
        if (style) style.fontColor = e.target.value;
    });

    fontColorRow.appendChild(fontColorLabel);
    fontColorRow.appendChild(fontColorInput);

    // --- Font Size ---
    const fontSizeRow = document.createElement('div');
    fontSizeRow.className = 'mb-4';

    const fontSizeLabel = document.createElement('label');
    fontSizeLabel.className = 'block text-sm text-gray-500 mb-1';
    fontSizeLabel.textContent = 'Size';

    fontSizeInput = document.createElement('input');
    fontSizeInput.type = 'number';
    fontSizeInput.min = '6';
    fontSizeInput.max = '24';
    fontSizeInput.step = '1';
    fontSizeInput.className = 'w-full px-3 py-2 lg:px-2 lg:py-1 text-sm border-2 border-gray-300 rounded focus:outline-none focus:border-[#6ad1e3] transition-colors';

    fontSizeInput.addEventListener('change', (e) => {
        const style = getActiveStyle();
        if (!style) return;
        const value = parseInt(e.target.value) || 12;
        style.fontSize = Math.max(6, Math.min(24, value));
        e.target.value = style.fontSize;
        e.target.blur();
    });

    fontSizeRow.appendChild(fontSizeLabel);
    fontSizeRow.appendChild(fontSizeInput);

    // --- Close button ---
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'w-full py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-medium transition-colors';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', hideModal);

    // Assemble
    content.appendChild(titleEl);
    content.appendChild(colorRow);
    content.appendChild(widthRow);
    content.appendChild(dashRow);
    content.appendChild(divider);
    content.appendChild(fontSectionLabel);
    content.appendChild(textRow);
    content.appendChild(fontColorRow);
    content.appendChild(fontSizeRow);
    content.appendChild(closeBtn);
    modalOverlay.appendChild(content);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) hideModal();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay.style.display !== 'none') {
            hideModal();
        }
    });

    document.body.appendChild(modalOverlay);
}

/**
 * Get the style object for the currently active line
 */
function getActiveStyle() {
    if (activeLineId == null) return null;
    const metadata = chartState.AimLines[activeLineId];
    if (!metadata) return null;
    return metadata.style;
}

/**
 * Show the per-line style editor
 * @param {number} lineId - The AimLines key to edit
 */
export function showAimLineEditor(lineId) {
    if (!modalOverlay) createModal();

    activeLineId = lineId;
    const metadata = chartState.AimLines[lineId];
    if (!metadata) return;

    titleEl.textContent = `Edit: ${metadata.text || 'Count Marker'}`;

    textInput.value = metadata.text || '';

    const style = metadata.style;
    colorInput.value = style.color;
    widthInput.value = style.width;
    dashSelect.value = style.dash;
    fontColorInput.value = style.fontColor;
    fontSizeInput.value = style.fontSize;

    modalOverlay.style.display = 'flex';
}

/**
 * Hide the modal and trigger redraw
 */
function hideModal() {
    if (modalOverlay) modalOverlay.style.display = 'none';

    if (activeLineId != null) {
        eventBus.emit(EVENTS.LINE_AIM_STYLE_CHANGED, { lineId: activeLineId });
        activeLineId = null;
    }
}

console.log('aimLineEditor.js loaded');
