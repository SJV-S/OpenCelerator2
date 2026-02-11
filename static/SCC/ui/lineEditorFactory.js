/**
 * Line Editor Factory - shared builder for per-line style editor modals.
 *
 * All line editors share: overlay, title, color/width/dash controls, close button.
 * Each line type adds custom sections (label editing, bounce envelope, etc.).
 *
 * @param {Object} config
 * @param {string} config.id - Overlay element id (e.g. 'phase-line-editor-overlay')
 * @param {string} config.stateKey - chartState key (e.g. 'PhaseLines')
 * @param {string} config.styleChangedEvent - EVENTS constant to emit on close
 * @param {Function} [config.getTitle] - (metadata) => title string
 * @param {Function} [config.buildSections] - (refs) => { elements: HTMLElement[], onShow: fn, onInput: fn }
 */

import { chartState } from '../chartState.js';
import { eventBus } from '../eventBus.js';
import { DASH_OPTIONS } from '../config.js';
import { setupModalClose } from './modalHelpers.js';

export function createLineEditor(config) {
    let modalOverlay = null;
    let colorInput = null;
    let widthInput = null;
    let dashSelect = null;
    let titleEl = null;
    let activeLineId = null;
    let sectionRefs = {};

    function getActiveStyle() {
        if (activeLineId == null) return null;
        const metadata = chartState[config.stateKey][activeLineId];
        if (!metadata) return null;
        return metadata.style;
    }

    function createModal() {
        modalOverlay = document.createElement('div');
        modalOverlay.id = config.id;
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

        // Assemble base
        content.appendChild(titleEl);
        content.appendChild(colorRow);
        content.appendChild(widthRow);
        content.appendChild(dashRow);

        // Custom sections
        if (config.buildSections) {
            const result = config.buildSections({ getActiveStyle, getActiveLineId: () => activeLineId });
            sectionRefs = result;
            for (const el of result.elements) {
                content.appendChild(el);
            }
        }

        // --- Close button ---
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'w-full py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-medium transition-colors';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', hideModal);

        content.appendChild(closeBtn);
        modalOverlay.appendChild(content);

        setupModalClose(modalOverlay, hideModal);

        document.body.appendChild(modalOverlay);
    }

    function hideModal() {
        if (modalOverlay) modalOverlay.style.display = 'none';

        if (activeLineId != null) {
            eventBus.emit(config.styleChangedEvent, { lineId: activeLineId });
            activeLineId = null;
        }
    }

    function show(lineId) {
        if (!modalOverlay) createModal();

        activeLineId = lineId;
        const metadata = chartState[config.stateKey][lineId];
        if (!metadata) return;

        if (config.getTitle) {
            titleEl.textContent = config.getTitle(metadata);
        } else {
            titleEl.textContent = `Edit: ${metadata.text || 'Line'}`;
        }

        const style = metadata.style;
        colorInput.value = style.color;
        widthInput.value = style.width;
        dashSelect.value = style.dash;

        if (sectionRefs.onShow) {
            sectionRefs.onShow(metadata, style);
        }

        modalOverlay.style.display = 'flex';
    }

    return { show };
}

/**
 * Build a label editing section (text, font color, font size).
 * Used by phase and aim line editors.
 */
export function buildLabelSection(stateKey) {
    let textInput, fontColorInput, fontSizeInput;

    function build({ getActiveStyle, getActiveLineId }) {
        const divider = document.createElement('div');
        divider.className = 'border-t border-gray-200 my-4';

        const sectionLabel = document.createElement('div');
        sectionLabel.className = 'text-sm font-semibold text-gray-600 mb-3 text-center';
        sectionLabel.textContent = 'Label';

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
            const lineId = getActiveLineId();
            if (lineId == null) return;
            const metadata = chartState[stateKey][lineId];
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

        return {
            elements: [divider, sectionLabel, textRow, fontColorRow, fontSizeRow],
            onShow(metadata, style) {
                textInput.value = metadata.text || '';
                fontColorInput.value = style.fontColor;
                fontSizeInput.value = style.fontSize;
            }
        };
    }

    return build;
}

/**
 * Build a bounce envelope editing section (color, width, dash).
 * Used by cel line editor.
 */
export function buildBounceSection() {
    let bounceContainer, bounceColorInput, bounceWidthInput, bounceDashSelect;

    function build({ getActiveStyle }) {
        bounceContainer = document.createElement('div');
        bounceContainer.style.display = 'none';

        const divider = document.createElement('div');
        divider.className = 'border-t border-gray-200 my-4';

        const sectionLabel = document.createElement('div');
        sectionLabel.className = 'text-sm font-semibold text-gray-600 mb-3 text-center';
        sectionLabel.textContent = 'Bounce Envelope';

        // Bounce Color
        const colorRow = document.createElement('div');
        colorRow.className = 'mb-3';
        const colorLabel = document.createElement('label');
        colorLabel.className = 'block text-sm text-gray-500 mb-1';
        colorLabel.textContent = 'Color';
        bounceColorInput = document.createElement('input');
        bounceColorInput.type = 'color';
        bounceColorInput.className = 'w-full h-9 border-2 border-gray-300 rounded cursor-pointer';
        bounceColorInput.addEventListener('input', (e) => {
            const style = getActiveStyle();
            if (style) style.bounceColor = e.target.value;
        });
        colorRow.appendChild(colorLabel);
        colorRow.appendChild(bounceColorInput);

        // Bounce Width
        const widthRow = document.createElement('div');
        widthRow.className = 'mb-3';
        const widthLabel = document.createElement('label');
        widthLabel.className = 'block text-sm text-gray-500 mb-1';
        widthLabel.textContent = 'Width';
        bounceWidthInput = document.createElement('input');
        bounceWidthInput.type = 'number';
        bounceWidthInput.min = '0.5';
        bounceWidthInput.max = '8';
        bounceWidthInput.step = '0.5';
        bounceWidthInput.className = 'w-full px-3 py-2 lg:px-2 lg:py-1 text-sm border-2 border-gray-300 rounded focus:outline-none focus:border-[#6ad1e3] transition-colors';
        bounceWidthInput.addEventListener('change', (e) => {
            const style = getActiveStyle();
            if (!style) return;
            const value = parseFloat(e.target.value) || 1;
            style.bounceWidth = Math.max(0.5, Math.min(8, value));
            e.target.value = style.bounceWidth;
            e.target.blur();
        });
        widthRow.appendChild(widthLabel);
        widthRow.appendChild(bounceWidthInput);

        // Bounce Dash
        const dashRow = document.createElement('div');
        dashRow.className = 'mb-4';
        const dashLabel = document.createElement('label');
        dashLabel.className = 'block text-sm text-gray-500 mb-1';
        dashLabel.textContent = 'Dash Style';
        bounceDashSelect = document.createElement('select');
        bounceDashSelect.className = 'w-full px-3 py-2 lg:px-2 lg:py-1 text-sm border-2 border-gray-300 rounded focus:outline-none focus:border-[#6ad1e3] transition-colors bg-white';
        DASH_OPTIONS.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            bounceDashSelect.appendChild(option);
        });
        bounceDashSelect.addEventListener('change', (e) => {
            const style = getActiveStyle();
            if (style) style.bounceDash = e.target.value;
            e.target.blur();
        });
        dashRow.appendChild(dashLabel);
        dashRow.appendChild(bounceDashSelect);

        bounceContainer.appendChild(divider);
        bounceContainer.appendChild(sectionLabel);
        bounceContainer.appendChild(colorRow);
        bounceContainer.appendChild(widthRow);
        bounceContainer.appendChild(dashRow);

        return {
            elements: [bounceContainer],
            onShow(metadata, style) {
                const hasBounce = metadata.bounceUpperY1 != null || metadata.bounceLowerY1 != null;
                bounceContainer.style.display = hasBounce ? '' : 'none';
                if (hasBounce) {
                    bounceColorInput.value = style.bounceColor;
                    bounceWidthInput.value = style.bounceWidth;
                    bounceDashSelect.value = style.bounceDash;
                }
            }
        };
    }

    return build;
}
