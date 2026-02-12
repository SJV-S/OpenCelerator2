/**
 * Phase Line Editor - Per-line style editor for event markers (phase lines)
 *
 * Opened when the user clicks an existing phase line and selects "Edit".
 * Reads/writes the specific line's metadata.style (color, width).
 * Triggers a redraw on close so changes are reflected immediately.
 */

import { EVENTS } from '../eventBus.js';
import { createLineEditor, buildLabelSection } from './lineEditorFactory.js';

const editor = createLineEditor({
    id: 'phase-line-editor-overlay',
    stateKey: 'PhaseLines',
    styleChangedEvent: EVENTS.LINE_PHASE_STYLE_CHANGED,
    getTitle: (metadata) => `Edit: ${metadata.text || 'Event Marker'}`,
    buildSections: buildLabelSection('PhaseLines')
});

export function showPhaseLineEditor(lineId) {
    editor.show(lineId);
}
