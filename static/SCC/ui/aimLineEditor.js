/**
 * Aim Line Editor - Per-line style editor for count markers (aim lines)
 *
 * Opened when the user clicks an existing aim line and selects "Edit".
 * Reads/writes the specific line's metadata.style (color, width, dash).
 * Triggers a redraw on close so changes are reflected immediately.
 */

import { EVENTS } from '../eventBus.js';
import { createLineEditor, buildLabelSection } from './lineEditorFactory.js';

const editor = createLineEditor({
    id: 'aim-line-editor-overlay',
    stateKey: 'AimLines',
    styleChangedEvent: EVENTS.LINE_AIM_STYLE_CHANGED,
    getTitle: (metadata) => `Edit: ${metadata.text || 'Count Marker'}`,
    buildSections: buildLabelSection('AimLines')
});

export function showAimLineEditor(lineId) {
    editor.show(lineId);
}

console.log('aimLineEditor.js loaded');
