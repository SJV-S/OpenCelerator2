/**
 * Plotly Wrapper
 *
 * Wraps Plotly operations to emit events through the eventBus after completion.
 * Guarantees events fire reliably, regardless of Plotly's native event quirks.
 */

import { eventBus, EVENTS } from '../eventBus.js';

/**
 * Wrapper for Plotly.relayout
 * Set name=true to treat first arg as a shape name to remove
 */
export async function relayout(chartDiv, updates, name = false) {
    if (name) {
        const index = chartDiv.layout.shapes.findIndex(s => s.name === updates);
        if (index === -1) return;
        updates = { [`shapes[${index}]`]: null };
    }
    await Plotly.relayout(chartDiv, updates);
    eventBus.emit(EVENTS.PLOTLY_RELAYOUT_COMPLETE, { updates });
}

/**
 * Wrapper for Plotly.react
 * Emits PLOTLY_REACT_COMPLETE after the operation finishes
 */
export async function react(chartDiv, data, layout, config) {
    await Plotly.react(chartDiv, data, layout, config);
    eventBus.emit(EVENTS.PLOTLY_REACT_COMPLETE);
}

/**
 * Wrapper for Plotly.restyle
 * Emits PLOTLY_RESTYLE_COMPLETE after the operation finishes
 */
export async function restyle(chartDiv, updates, traceIndices) {
    await Plotly.restyle(chartDiv, updates, traceIndices);
    eventBus.emit(EVENTS.PLOTLY_RESTYLE_COMPLETE, { updates, traceIndices });
}

/**
 * Wrapper for Plotly.newPlot
 * Emits PLOTLY_NEWPLOT_COMPLETE after the operation finishes
 */
export async function newPlot(chartDiv, data, layout, config) {
    await Plotly.newPlot(chartDiv, data, layout, config);
    eventBus.emit(EVENTS.PLOTLY_NEWPLOT_COMPLETE);
}

/**
 * Wrapper for Plotly.addTraces
 * Emits PLOTLY_ADDTRACES_COMPLETE after the operation finishes
 */
export async function addTraces(chartDiv, traces, indices) {
    await Plotly.addTraces(chartDiv, traces, indices);
    eventBus.emit(EVENTS.PLOTLY_ADDTRACES_COMPLETE, { traces, indices });
}

/**
 * Wrapper for Plotly.deleteTraces
 * Emits PLOTLY_DELETETRACES_COMPLETE after the operation finishes
 */
export async function deleteTraces(chartDiv, indices) {
    await Plotly.deleteTraces(chartDiv, indices);
    eventBus.emit(EVENTS.PLOTLY_DELETETRACES_COMPLETE, { indices });
}