/**
 * Cel Line Editor - Per-line style editor for change lines
 *
 * Opened when the user clicks an existing change line and selects "Edit".
 * Reads/writes the specific line's metadata.style (color, width, dash).
 * Triggers a redraw on close so changes are reflected immediately.
 */

import { EVENTS } from '../eventBus.js';
import { createLineEditor, buildBounceSection } from './lineEditorFactory.js';

const editor = createLineEditor({
    id: 'cel-line-editor-overlay',
    stateKey: 'CelLines',
    styleChangedEvent: EVENTS.LINE_CEL_STYLE_CHANGED,
    getTitle: (metadata) => `Edit: ${metadata.text}`,
    buildSections: buildBounceSection()
});

export function showCelLineEditor(lineId) {
    editor.show(lineId);
}

console.log('celLineEditor.js loaded');
