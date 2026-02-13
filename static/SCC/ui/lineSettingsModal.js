/**
 * Line Settings Modal - Style defaults editor for phase/aim lines
 *
 * Triggered by gear icons next to "Event markers" and "Count markers"
 * headings in the lines tab. The cel category delegates to celSettingsModal.js.
 *
 * Defaults persist in IDB user_preferences (user-level, not chart-level).
 * Called at line creation time via getLineDefaults(category).
 */

import { showCelSettingsModal } from './celSettingsModal.js';
import { setupModalClose } from './modalHelpers.js';
import { DASH_OPTIONS, COLORS, LINE_DEFAULTS } from '../config.js';
import { getUserPreferences, setUserPreference } from '../../Server/init.js';

const CATEGORY_LABELS = {
    phase: 'Event Markers',
    aim: 'Count Markers',
    cel: 'Change Line'
};

const STYLE_DEFAULTS = {
    phase: { color: COLORS.PHASE_LINE, width: LINE_DEFAULTS.PHASE_WIDTH, dash: 'solid', fontColor: COLORS.PHASE_LINE, fontSize: 12 },
    aim:   { color: COLORS.AIM_LINE,   width: LINE_DEFAULTS.AIM_WIDTH,   dash: 'solid', fontColor: COLORS.AIM_LINE,   fontSize: 12 }
};

let modalOverlay = null;
let activeCategory = null;

// Control references
let colorInput = null;
let widthInput = null;
let dashSelect = null;
let fontColorInput = null;
let fontSizeInput = null;

/**
 * Get the effective defaults for a line category.
 * Falls back to STYLE_DEFAULTS when no IDB preference exists.
 * @param {'phase'|'aim'} category
 * @returns {{ color: string, width: number, dash: string, fontColor: string, fontSize: number }}
 */
export function getLineDefaults(category) {
    const stored = getUserPreferences().lineStyleDefaults?.[category];
    return { ...STYLE_DEFAULTS[category], ...stored };
}

/**
 * Persist current control values to IDB user_preferences
 */
async function persistDefaults() {
    if (!activeCategory) return;

    const current = getUserPreferences().lineStyleDefaults || {};
    current[activeCategory] = {
        color: colorInput.value,
        width: parseFloat(widthInput.value),
        dash: dashSelect.value,
        fontColor: fontColorInput.value,
        fontSize: parseInt(fontSizeInput.value)
    };
    await setUserPreference('lineStyleDefaults', current);
}

/**
 * Create the modal DOM structure (once, lazily)
 */
function createModal() {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'line-settings-modal-overlay';
    modalOverlay.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center';
    modalOverlay.style.display = 'none';

    const content = document.createElement('div');
    content.className = 'bg-white rounded-lg shadow-xl p-6 min-w-[280px] max-w-[90vw]';

    // Title
    const title = document.createElement('h2');
    title.id = 'line-settings-modal-title';
    title.className = 'text-lg font-semibold text-gray-700 mb-4 text-center';

    // --- Line Style section header ---
    const lineStyleHeader = document.createElement('p');
    lineStyleHeader.className = 'text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2';
    lineStyleHeader.textContent = 'Line Style';

    // --- Color ---
    const colorRow = document.createElement('div');
    colorRow.className = 'mb-3';

    const colorLabel = document.createElement('label');
    colorLabel.className = 'block text-sm text-gray-500 mb-1';
    colorLabel.textContent = 'Color';

    colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'w-full h-9 border-2 border-gray-300 rounded cursor-pointer';
    colorInput.addEventListener('input', persistDefaults);

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
        const value = parseFloat(e.target.value) || 2;
        e.target.value = Math.max(0.5, Math.min(8, value));
        e.target.blur();
        persistDefaults();
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
        e.target.blur();
        persistDefaults();
    });

    dashRow.appendChild(dashLabel);
    dashRow.appendChild(dashSelect);

    // --- Label section header ---
    const labelHeader = document.createElement('p');
    labelHeader.className = 'text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2';
    labelHeader.textContent = 'Label';

    // --- Font Color ---
    const fontColorRow = document.createElement('div');
    fontColorRow.className = 'mb-3';

    const fontColorLabel = document.createElement('label');
    fontColorLabel.className = 'block text-sm text-gray-500 mb-1';
    fontColorLabel.textContent = 'Font Color';

    fontColorInput = document.createElement('input');
    fontColorInput.type = 'color';
    fontColorInput.className = 'w-full h-9 border-2 border-gray-300 rounded cursor-pointer';
    fontColorInput.addEventListener('input', persistDefaults);

    fontColorRow.appendChild(fontColorLabel);
    fontColorRow.appendChild(fontColorInput);

    // --- Font Size ---
    const fontSizeRow = document.createElement('div');
    fontSizeRow.className = 'mb-4';

    const fontSizeLabel = document.createElement('label');
    fontSizeLabel.className = 'block text-sm text-gray-500 mb-1';
    fontSizeLabel.textContent = 'Font Size';

    fontSizeInput = document.createElement('input');
    fontSizeInput.type = 'number';
    fontSizeInput.min = '6';
    fontSizeInput.max = '24';
    fontSizeInput.step = '1';
    fontSizeInput.className = 'w-full px-3 py-2 lg:px-2 lg:py-1 text-sm border-2 border-gray-300 rounded focus:outline-none focus:border-[#6ad1e3] transition-colors';

    fontSizeInput.addEventListener('change', (e) => {
        const value = parseInt(e.target.value) || 12;
        e.target.value = Math.max(6, Math.min(24, value));
        e.target.blur();
        persistDefaults();
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
    content.appendChild(title);
    content.appendChild(lineStyleHeader);
    content.appendChild(colorRow);
    content.appendChild(widthRow);
    content.appendChild(dashRow);
    content.appendChild(labelHeader);
    content.appendChild(fontColorRow);
    content.appendChild(fontSizeRow);
    content.appendChild(closeBtn);
    modalOverlay.appendChild(content);

    setupModalClose(modalOverlay, hideModal);

    document.body.appendChild(modalOverlay);
}

/**
 * Populate controls from stored/default values
 * @param {'phase'|'aim'} category
 */
function syncValues(category) {
    const defaults = getLineDefaults(category);
    colorInput.value = defaults.color;
    widthInput.value = defaults.width;
    dashSelect.value = defaults.dash;
    fontColorInput.value = defaults.fontColor;
    fontSizeInput.value = defaults.fontSize;
}

/**
 * Show the modal for a given line category
 * @param {string} category - 'phase', 'aim', or 'cel'
 */
function showModal(category) {
    if (category === 'cel') {
        showCelSettingsModal();
        return;
    }

    if (!modalOverlay) createModal();

    activeCategory = category;
    const label = CATEGORY_LABELS[category] || category;
    document.getElementById('line-settings-modal-title').textContent = `${label} Defaults`;
    syncValues(category);
    modalOverlay.style.display = 'flex';
}

/**
 * Hide the modal
 */
function hideModal() {
    if (modalOverlay) modalOverlay.style.display = 'none';
    activeCategory = null;
}

/**
 * Initialize - attach click listeners to gear buttons via delegation
 */
export function initLineSettingsModal() {
    document.addEventListener('click', (e) => {
        const gear = e.target.closest('.line-settings-gear');
        if (!gear) return;

        e.stopPropagation();
        const target = gear.dataset.settingsTarget;
        if (target) showModal(target);
    });
}
