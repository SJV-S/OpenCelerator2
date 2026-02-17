/**
 * Cel Settings Modal - Change line settings (Fit Method, Bounce Envelope, Forecast, Label Format)
 *
 * Triggered by the gear icon next to "Add change line" in the lines tab.
 * Reads/writes IDB user_preferences.celLineSettings on change (no save button).
 */

import { chartState } from '../chartState.js';
import { WINDOW_UNITS } from '../config.js';
import { setupModalClose } from './modalHelpers.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { getUserPreferences, setUserPreference } from '../../Server/init.js';

let modalOverlay = null;

// Control references for syncing values on open
let fitMethodSelect = null;
let bounceEnvelopeSelect = null;
let forecastInput = null;
let forecastUnitSpan = null;
let labelFormatSelect = null;

const CEL_DEFAULTS = {
    fitMethod: 'Theil-Sen',
    bounceEnvelope: 'None',
    forecast: 0,
    labelFormat: 'celeration'
};

/**
 * Get the effective cel line settings.
 * Falls back to CEL_DEFAULTS when no IDB preference exists.
 * @returns {{ fitMethod: string, bounceEnvelope: string, forecast: number, labelFormat: string }}
 */
export function getCelLineSettings() {
    const stored = getUserPreferences().celLineSettings;
    return { ...CEL_DEFAULTS, ...stored };
}

/**
 * Persist a single setting to IDB user_preferences
 */
async function persistSetting(key, value) {
    const current = getUserPreferences().celLineSettings || {};
    current[key] = value;
    await setUserPreference('celLineSettings', current);
}

/**
 * Create the modal DOM structure (once, lazily)
 */
function createModal() {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'cel-settings-modal-overlay';
    modalOverlay.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center';
    modalOverlay.style.display = 'none';

    const content = document.createElement('div');
    content.className = 'bg-white rounded-lg shadow-xl p-6 min-w-[300px] max-w-[90vw]';

    // Title
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold text-gray-700 mb-4 text-center';
    title.textContent = 'Change Line Settings';

    // --- Fit Method ---
    const fitRow = document.createElement('div');
    fitRow.className = 'mb-3';

    const fitLabel = document.createElement('label');
    fitLabel.className = 'block text-sm text-gray-500 mb-1';
    fitLabel.textContent = 'Fit Method';

    fitMethodSelect = document.createElement('select');
    fitMethodSelect.className = 'w-full px-3 py-2 lg:px-2 lg:py-1 text-sm border-2 border-gray-300 rounded focus:outline-none focus:border-[#6ad1e3] transition-colors bg-white';
    const fitOptions = ['Theil-Sen', 'Least-squares', 'Quarter-intersect', 'Split-middle-line', 'Mean', 'Median'];
    fitOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        fitMethodSelect.appendChild(option);
    });

    fitMethodSelect.addEventListener('change', (e) => {
        persistSetting('fitMethod', e.target.value);
        e.target.blur();
        eventBus.emit(EVENTS.LINE_CEL_SETTINGS_CHANGED);
    });

    fitRow.appendChild(fitLabel);
    fitRow.appendChild(fitMethodSelect);

    // --- Bounce Envelope ---
    const bounceRow = document.createElement('div');
    bounceRow.className = 'mb-3';

    const bounceLabel = document.createElement('label');
    bounceLabel.className = 'block text-sm text-gray-500 mb-1';
    bounceLabel.textContent = 'Bounce Envelope';

    bounceEnvelopeSelect = document.createElement('select');
    bounceEnvelopeSelect.className = 'w-full px-3 py-2 lg:px-2 lg:py-1 text-sm border-2 border-gray-300 rounded focus:outline-none focus:border-[#6ad1e3] transition-colors bg-white';
    const bounceOptions = ['None', '5-95 percentile', 'Interquartile range', 'Standard deviation', '90% confidence interval'];
    bounceOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        bounceEnvelopeSelect.appendChild(option);
    });

    bounceEnvelopeSelect.addEventListener('change', (e) => {
        persistSetting('bounceEnvelope', e.target.value);
        e.target.blur();
        eventBus.emit(EVENTS.LINE_CEL_SETTINGS_CHANGED);
    });

    bounceRow.appendChild(bounceLabel);
    bounceRow.appendChild(bounceEnvelopeSelect);

    // --- Forecast ---
    const forecastRow = document.createElement('div');
    forecastRow.className = 'mb-4';

    const forecastLabel = document.createElement('label');
    forecastLabel.className = 'block text-sm text-gray-500 mb-1';
    forecastLabel.textContent = 'Forecast';

    const forecastWrapper = document.createElement('div');
    forecastWrapper.className = 'flex items-center gap-2';

    forecastInput = document.createElement('input');
    forecastInput.type = 'number';
    forecastInput.min = '0';
    forecastInput.max = '100';
    forecastInput.className = 'w-16 px-2 py-2 lg:py-1 text-sm text-center border-2 border-gray-300 rounded focus:outline-none focus:border-[#6ad1e3] transition-colors';

    forecastInput.addEventListener('change', (e) => {
        const value = Math.max(0, parseInt(e.target.value) || 0);
        e.target.value = value;
        persistSetting('forecast', value);
        e.target.blur();
        eventBus.emit(EVENTS.LINE_CEL_SETTINGS_CHANGED);
    });

    forecastUnitSpan = document.createElement('span');
    forecastUnitSpan.className = 'text-sm text-gray-500';

    forecastWrapper.appendChild(forecastInput);
    forecastWrapper.appendChild(forecastUnitSpan);
    forecastRow.appendChild(forecastLabel);
    forecastRow.appendChild(forecastWrapper);

    // --- Label Format ---
    const labelFormatRow = document.createElement('div');
    labelFormatRow.className = 'mb-4';

    const labelFormatLabel = document.createElement('label');
    labelFormatLabel.className = 'block text-sm text-gray-500 mb-1';
    labelFormatLabel.textContent = 'Label Format';

    labelFormatSelect = document.createElement('select');
    labelFormatSelect.className = 'w-full px-3 py-2 lg:px-2 lg:py-1 text-sm border-2 border-gray-300 rounded focus:outline-none focus:border-[#6ad1e3] transition-colors bg-white';
    const labelFormatOptions = [
        { value: 'celeration', text: 'Celeration (×/÷ per period)' },
        { value: 'doubling', text: 'Doubling time' }
    ];
    labelFormatOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        labelFormatSelect.appendChild(option);
    });

    labelFormatSelect.addEventListener('change', (e) => {
        persistSetting('labelFormat', e.target.value);
        e.target.blur();
        eventBus.emit(EVENTS.LINE_CEL_SETTINGS_CHANGED);
    });

    labelFormatRow.appendChild(labelFormatLabel);
    labelFormatRow.appendChild(labelFormatSelect);

    // --- Close button ---
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'w-full py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-medium transition-colors';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', hideModal);

    // Assemble
    content.appendChild(title);
    content.appendChild(fitRow);
    content.appendChild(bounceRow);
    content.appendChild(forecastRow);
    content.appendChild(labelFormatRow);
    content.appendChild(closeBtn);
    modalOverlay.appendChild(content);

    setupModalClose(modalOverlay, hideModal);

    document.body.appendChild(modalOverlay);
}

/**
 * Sync control values from chartState before showing
 */
function syncValues() {
    const settings = getCelLineSettings();
    fitMethodSelect.value = settings.fitMethod;
    bounceEnvelopeSelect.value = settings.bounceEnvelope;
    forecastInput.value = settings.forecast;
    labelFormatSelect.value = settings.labelFormat;
    const wu = WINDOW_UNITS[chartState.chartType];
    forecastUnitSpan.textContent = wu ? wu.name.toLowerCase() + 's' : 'days';
}

/**
 * Show the cel settings modal
 */
export function showCelSettingsModal() {
    if (!modalOverlay) createModal();
    syncValues();
    modalOverlay.style.display = 'flex';
}

/**
 * Hide the modal
 */
function hideModal() {
    if (modalOverlay) modalOverlay.style.display = 'none';
}

/**
 * Initialize (no-op for now, keeps pattern consistent)
 */
export function initCelSettingsModal() {
    // Nothing to do — modal is created lazily on first open
}
