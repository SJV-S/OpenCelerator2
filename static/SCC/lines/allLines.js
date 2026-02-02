/**
 * allLines.js
 * Standard definitions for all line metadata objects
 *
 * Line styling configuration is accessed via chartState.lineStyles:
 *   - chartState.lineStyles.phase.color
 *   - chartState.lineStyles.phase.width
 *   - chartState.lineStyles.aim.color
 *   - chartState.lineStyles.aim.width
 */

import { chartState, DEFAULT_PHASE_LINE_COLOR, DEFAULT_PHASE_LINE_WIDTH, DEFAULT_AIM_LINE_COLOR, DEFAULT_AIM_LINE_WIDTH } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';

/**
 * Creates a phase line metadata object
 * @param {string} direction - 'top' or 'bottom'
 * @param {Date} verticalLineDate - Date for vertical line position
 * @param {number} verticalLineY - Y position where vertical meets horizontal
 * @param {Date} horizontalEndDate - Date for horizontal line end position
 * @param {string} text - Text label
 * @param {Array<number>} shapeIndices - Indices of the shapes [vertical, horizontal]
 * @param {number} annotationIndex - Index of the annotation
 */
function phaseLineMetadata(direction, verticalLineDate, verticalLineY, horizontalEndDate, text, shapeIndices, annotationIndex) {
    return {
        id: Date.now(),
        direction: direction,
        verticalLineDate: verticalLineDate,
        verticalLineY: verticalLineY,
        horizontalEndDate: horizontalEndDate,
        text: text,
        shapeIndices: shapeIndices,
        annotationIndex: annotationIndex
    };
}

/**
 * Creates an aim line metadata object
 * @param {string} direction - 'horizontal' or 'diagonal'
 * @param {Date} date1 - Start date
 * @param {number} y1 - Start Y coordinate
 * @param {Date} date2 - End date
 * @param {number} y2 - End Y coordinate
 * @param {string} text - Text label
 * @param {Array<number>} shapeIndices - Index of the shape [lineIndex]
 * @param {number} annotationIndex - Index of the annotation
 */
function aimLineMetadata(direction, date1, y1, date2, y2, text, shapeIndices, annotationIndex) {
    return {
        id: Date.now(),
        direction: direction,
        date1: date1,
        y1: y1,
        date2: date2,
        y2: y2,
        text: text,
        shapeIndices: shapeIndices,
        annotationIndex: annotationIndex
    };
}

/**
 * Removes a specific line from chartState and the chart
 * Step 1: Find the line by ID and get its shape/annotation indices
 * Step 2: Remove the clickable trace (if it exists)
 * Step 3: Remove those specific shapes and annotation from the chart
 * Step 4: Remove the line from chartState
 *
 * @param {string} lineType - The type of line ('PhaseLines', 'AimLines', 'CelLines', or 'LineCuts')
 * @param {number} lineId - The ID of the line to remove
 * @returns {boolean} True if successful, false otherwise
 */
function removeLine(lineType, lineId) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv || !chartState[lineType] || !chartState[lineType][lineId]) return false;

    // Map line type to category name for line naming
    const categoryMap = {
        'PhaseLines': 'phase',
        'AimLines': 'aim',
        'CelLines': 'cel',
        'LineCuts': 'cut'
    };
    const category = categoryMap[lineType];

    if (!category) {
        console.error(`Unknown line type: ${lineType}`);
        return false;
    }

    eventBus.emit(EVENTS.LINE_REMOVE_CLICKABLE, { lineName: `${category}-${lineId}` });

    // Cut lines don't have shapes/annotations in the same way - they affect data aggregation
    if (lineType === 'LineCuts') {
        delete chartState[lineType][lineId];
        // Trigger chart refresh to recalculate aggregations
        eventBus.emit(EVENTS.DATA_CHART_REFRESH);
        return true;
    }

    const lineIdStr = `${category}-${lineId}`;
    const shapes = (chartDiv.layout.shapes || []).filter(s => s.name !== lineIdStr);
    const annotations = (chartDiv.layout.annotations || []).filter(a => a.name !== lineIdStr);

    Plotly.relayout(chartDiv, { shapes, annotations });
    delete chartState[lineType][lineId];
    return true;
}

// Export functions as ES modules
export {
    phaseLineMetadata,
    aimLineMetadata,
    removeLine
};