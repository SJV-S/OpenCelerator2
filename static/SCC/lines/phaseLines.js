/**
 * drawPhaseLine.js
 * Handles phase line drawing functionality for the chart
 *
 * Three-phase drawing process:
 * 1. Click to draw vertical line from top/bottom to clicked point (purple)
 * 2. Click to the right to draw horizontal line (purple)
 * 3. Add text label at endpoint
 *
 * IMPORTANT NOTE - Plotly Coordinate System Inconsistency:
 * When working with logarithmic y-axes, Plotly has different coordinate requirements:
 * - SHAPES (lines): Use actual data values (e.g., y: 0.6679)
 * - ANNOTATIONS (text): Use log10 values (e.g., y: log10(0.6679) ≈ -0.175)
 * Both use yref: 'y', but Plotly interprets them differently.
 * This file handles this conversion properly in getPlotCoordinates() and addPhaseTextLabel().
 */

import { chartState } from '../chartState.js';
import { createToast, createTextInputDialog, createNumberInputDialog, removeToast, createConfirmToast, createArrowControls } from '../util/toaster.js';
import { xPositionToDate, timestampsToXPositions } from '../util/dates.js';
import { icons } from '../util/icons.js';
import { applySvgCursor, restoreCursor } from '../util/cursorIcon.js';
import { phaseLineMetadata, removeLine } from './allLines.js';
import { eventBus, EVENTS } from '../eventBus.js';

// Phase line drawing state (ephemeral UI state)
var phaseLineState = {
    active: false,              // Whether phase line mode is active
    direction: null,            // 'top' or 'bottom' - where line extends from
    currentPhase: 0,            // Current phase (0=inactive, 1=vertical, 2=horizontal, 3=text)
    clickHandler: null,         // Reference to click handler function
    touchHandler: null,         // Reference to touch handler function
    verticalLineX: null,        // X coordinate of vertical line
    verticalLineY: null,        // Y coordinate of vertical line endpoint
    horizontalEndX: null,       // X coordinate of horizontal line endpoint
    horizontalEndY: null,       // Y coordinate of horizontal line endpoint
    tempShapes: [],            // Track temporary shape indices
    textInputOverlay: null,    // Reference to text input overlay element
    tempAnnotationIndex: null, // Index of annotation awaiting save confirmation
    saveToast: null,           // Reference to save confirmation toast element
    arrowControls: null,       // Reference to arrow control UI element
    modeToast: null            // Reference to "Phase mode" toaster element
};

/**
 * Activates phase line drawing mode
 * @param {string} direction - 'top' or 'bottom'
 */
function activatePhaseLineMode(direction) {
    console.log(`%c[PHASE LINE] Activating phase line mode: ${direction}`, 'color: purple; font-weight: bold');

    const chartDiv = document.getElementById('chart');

    if (!chartDiv) {
        console.error('[PHASE LINE] Chart div not found!');
        return;
    }

    if (!chartDiv._fullLayout) {
        console.error('[PHASE LINE] Chart not fully initialized!');
        return;
    }

    // Deactivate any other active drawing modes
    eventBus.emit(EVENTS.MODE_ALL_DEACTIVATE);

    phaseLineState.active = true;
    phaseLineState.direction = direction;
    phaseLineState.currentPhase = 1;
    phaseLineState.verticalLineX = null;
    phaseLineState.verticalLineY = null;
    phaseLineState.horizontalEndX = null;
    phaseLineState.horizontalEndY = null;
    phaseLineState.tempShapes = [];

    // Create click/tap handler
    phaseLineState.clickHandler = function(event) {
        console.log('[PHASE LINE] Click detected!', event);
        handlePhaseLineDrawClick(event, chartDiv);
    };

    phaseLineState.touchHandler = function(event) {
        console.log('[PHASE LINE] Touch detected!', event);
        // Prevent default to avoid triggering click as well
        event.preventDefault();

        // Convert touch event to have similar properties as mouse event
        if (event.touches && event.touches.length > 0) {
            const touch = event.touches[0];
            const syntheticEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => event.preventDefault()
            };
            handlePhaseLineDrawClick(syntheticEvent, chartDiv);
        }
    };

    // Add click and touch listeners to chart
    chartDiv.addEventListener('click', phaseLineState.clickHandler);
    chartDiv.addEventListener('touchstart', phaseLineState.touchHandler);

    // Apply flag cursor (hotspot at bottom of pole)
    applySvgCursor(chartDiv, icons.otherFlag, {size: 32, hotspotX: 6, hotspotY: 29});

    // Show "Phase mode" toaster on the left
    showPhaseModeToaster(1);

    console.log('%c[PHASE LINE] Phase line mode activated - Phase 1: Click to place vertical line', 'color: green; font-weight: bold');
    console.log('[PHASE LINE] Current state:', phaseLineState);
}

/**
 * Creates and shows arrow controls for adjusting x position
 * @param {HTMLElement} chartDiv - Chart container element
 */
function showArrowControls(chartDiv) {
    createArrowControls({
        id: 'phase-arrow-controls',
        color: '#6ad1e3',
        onLeft: () => adjustVerticalLineX(chartDiv, -1),
        onRight: () => adjustVerticalLineX(chartDiv, 1),
        stateRef: {
            state: phaseLineState,
            key: 'arrowControls'
        }
    });
}

/**
 * Hides and removes arrow controls
 */
function hideArrowControls() {
    removeToast('phase-arrow-controls');
    phaseLineState.arrowControls = null;
}

/**
 * Adjusts the vertical line x position or horizontal line length by one increment
 * @param {HTMLElement} chartDiv - Chart container element
 * @param {number} direction - -1 for left, 1 for right
 */
function adjustVerticalLineX(chartDiv, direction) {
    if (phaseLineState.currentPhase !== 2 && phaseLineState.currentPhase !== 3) {
        return;
    }

    // Phase 2: Adjust vertical line x position
    if (phaseLineState.currentPhase === 2) {
        // Update x position by exactly +1 or -1
        phaseLineState.verticalLineX += direction;

        // Redraw the vertical line at new position
        redrawVerticalLine(chartDiv);
    }
    // Phase 3: Adjust horizontal line length
    else if (phaseLineState.currentPhase === 3) {
        // Update horizontal endpoint by +7 or -7 (to maintain rounding to multiples of 7)
        const newEndX = phaseLineState.horizontalEndX + (direction * 7);

        // Ensure it doesn't go past the vertical line
        if (newEndX <= phaseLineState.verticalLineX) {
            return;
        }

        phaseLineState.horizontalEndX = newEndX;

        // Redraw the horizontal line with new length
        redrawHorizontalLine(chartDiv);
    }
}

/**
 * Redraws the vertical line at the current stored position
 * @param {HTMLElement} chartDiv - Chart container element
 */
function redrawVerticalLine(chartDiv) {
    // Get axis information
    const yaxis = chartDiv._fullLayout.yaxis;
    const isLogY = yaxis.type === 'log';

    // Get current visible range
    const visibleYMin = yaxis.range[0];
    const visibleYMax = yaxis.range[1];

    // Convert to actual data values if log scale
    let yTop, yBottom;
    if (isLogY) {
        yBottom = Math.pow(10, visibleYMin);
        yTop = Math.pow(10, visibleYMax);
    } else {
        yBottom = visibleYMin;
        yTop = visibleYMax;
    }

    // Create vertical line shape
    let verticalLine;
    if (phaseLineState.direction === 'top') {
        verticalLine = {
            type: 'line',
            x0: phaseLineState.verticalLineX,
            y0: yBottom,
            x1: phaseLineState.verticalLineX,
            y1: phaseLineState.verticalLineY,
            xref: 'x',
            yref: 'y',
            line: {
                color: 'purple',
                width: 2
            }
        };
    } else {
        verticalLine = {
            type: 'line',
            x0: phaseLineState.verticalLineX,
            y0: yTop,
            x1: phaseLineState.verticalLineX,
            y1: phaseLineState.verticalLineY,
            xref: 'x',
            yref: 'y',
            line: {
                color: 'purple',
                width: 2
            }
        };
    }

    // Get current shapes and replace the vertical line (first temp shape)
    let currentShapes = [...(chartDiv.layout.shapes || [])];
    const verticalLineIndex = phaseLineState.tempShapes[0];
    currentShapes[verticalLineIndex] = verticalLine;

    Plotly.relayout(chartDiv, {
        shapes: currentShapes
    });
}

/**
 * Redraws the horizontal line with the current stored endpoint
 * @param {HTMLElement} chartDiv - Chart container element
 */
function redrawHorizontalLine(chartDiv) {
    // Create horizontal line shape - perfectly horizontal at first click's Y value
    const horizontalLine = {
        type: 'line',
        x0: phaseLineState.verticalLineX,
        y0: phaseLineState.verticalLineY,
        x1: phaseLineState.horizontalEndX,
        y1: phaseLineState.verticalLineY,
        xref: 'x',
        yref: 'y',
        line: {
            color: 'purple',
            width: 2
        }
    };

    // Get current shapes and replace the horizontal line (second temp shape)
    let currentShapes = [...(chartDiv.layout.shapes || [])];
    const horizontalLineIndex = phaseLineState.tempShapes[1];
    currentShapes[horizontalLineIndex] = horizontalLine;

    Plotly.relayout(chartDiv, {
        shapes: currentShapes
    });
}

/**
 * Deactivates phase line drawing mode
 */
function deactivatePhaseLineMode() {
    console.log('Deactivating phase line mode');

    const chartDiv = document.getElementById('chart');

    // Remove click listener
    if (phaseLineState.clickHandler) {
        chartDiv.removeEventListener('click', phaseLineState.clickHandler);
    }

    // Remove touch listener
    if (phaseLineState.touchHandler) {
        chartDiv.removeEventListener('touchstart', phaseLineState.touchHandler);
    }

    // Remove text input overlay if it exists
    removeToast('phase-text-input-overlay');
    phaseLineState.textInputOverlay = null;

    // Remove save toast if it exists
    if (phaseLineState.saveToast) {
        phaseLineState.saveToast.remove();
        phaseLineState.saveToast = null;
    }

    // Remove arrow controls if they exist
    hideArrowControls();

    // Remove mode toast if it exists
    removeToast('toast-top-right-secondary');
    phaseLineState.modeToast = null;

    // Remove any non-finalized lines and annotations ONLY if we're still in drawing phase
    // Don't remove if phase is 0 (already deactivated/finalized)
    if (phaseLineState.currentPhase > 0) {
        removePhaseShapes(chartDiv);
        removePhaseAnnotation(chartDiv);
    }

    // Restore default cursor
    restoreCursor(chartDiv);

    // Reset state
    phaseLineState.active = false;
    phaseLineState.direction = null;
    phaseLineState.currentPhase = 0;
    phaseLineState.clickHandler = null;
    phaseLineState.touchHandler = null;
    phaseLineState.verticalLineX = null;
    phaseLineState.verticalLineY = null;
    phaseLineState.horizontalEndX = null;
    phaseLineState.horizontalEndY = null;
    phaseLineState.tempShapes = [];
    phaseLineState.tempAnnotationIndex = null;

    console.log('Phase line mode deactivated');
}

/**
 * Handles click events during phase line drawing
 * @param {MouseEvent} event - Click event
 * @param {HTMLElement} chartDiv - Chart container element
 */
function handlePhaseLineDrawClick(event, chartDiv) {
    // Get click coordinates relative to the plot area
    const coords = getPlotCoordinates(event, chartDiv);

    if (!coords) {
        console.warn('Could not get plot coordinates');
        return;
    }

    console.log(`Phase ${phaseLineState.currentPhase} click at data coordinates:`, coords);

    if (phaseLineState.currentPhase === 1) {
        drawVerticalLine(chartDiv, coords);
    } else if (phaseLineState.currentPhase === 2) {
        drawHorizontalLine(chartDiv, coords);
    }
}

/**
 * Rounds y-value to nearest value from [0.01, 0.1, 1, 10, 100, 500]
 * @param {number} yValue - Raw y value
 * @returns {number} Rounded y value
 */
function roundYValue(yValue) {
    const allowedValues = [0.01, 0.1, 1, 10, 100, 500];

    // Find the closest allowed value
    let closest = allowedValues[0];
    let minDiff = Math.abs(yValue - closest);

    for (let i = 1; i < allowedValues.length; i++) {
        const diff = Math.abs(yValue - allowedValues[i]);
        if (diff < minDiff) {
            minDiff = diff;
            closest = allowedValues[i];
        }
    }

    return closest;
}

/**
 * Rounds x2 value to nearest multiple of 7
 * If result equals x1, forces x2 = x1 + 7 for minimum line length
 * @param {number} x2Raw - Raw x2 value from click
 * @param {number} x1 - The x1 value from first click
 * @returns {number} Rounded x2 value
 */
function roundHorizontalX(x2Raw, x1) {
    // First round to integer
    const x2Int = Math.round(x2Raw);

    // Find nearest multiple of 7
    let x2Rounded = Math.round(x2Int / 7) * 7;

    // If x2 equals x1, force x2 = x1 + 7
    if (x2Rounded === x1) {
        x2Rounded = x1 + 7;
    }

    return x2Rounded;
}

/**
 * Converts pixel coordinates to plot data coordinates
 * @param {MouseEvent} event - Mouse event
 * @param {HTMLElement} chartDiv - Chart container element
 * @returns {Object|null} Object with x and y data coordinates, or null
 */
function getPlotCoordinates(event, chartDiv) {
    if (!chartDiv._fullLayout) {
        console.warn('Chart not fully initialized');
        return null;
    }

    const xaxis = chartDiv._fullLayout.xaxis;
    const yaxis = chartDiv._fullLayout.yaxis;

    if (!xaxis || !yaxis) {
        console.warn('Axes not found');
        return null;
    }

    // Get the chart bounding box
    const bbox = chartDiv.getBoundingClientRect();

    // Get plot area dimensions using Plotly's internal properties
    const plotAreaLeft = xaxis._offset;
    const plotAreaWidth = xaxis._length;
    const plotAreaTop = yaxis._offset;
    const plotAreaHeight = yaxis._length;

    // Calculate pixel position within plot area
    const xPixelInPlotArea = event.clientX - bbox.left - plotAreaLeft;
    const yPixelInPlotArea = event.clientY - bbox.top - plotAreaTop;

    // Get current visible range
    const visibleXMin = xaxis.range[0];
    const visibleXMax = xaxis.range[1];
    const visibleYMin = yaxis.range[0];
    const visibleYMax = yaxis.range[1];

    // Check if y-axis is logarithmic
    const isLogY = yaxis.type === 'log';

    // Calculate data coordinates (note: y is inverted for screen coordinates)
    let xValue = visibleXMin + (xPixelInPlotArea / plotAreaWidth) * (visibleXMax - visibleXMin);

    // Round x-value to nearest integer
    xValue = Math.round(xValue);

    // For log scale, the range is in log10 space, so we need to convert back
    let yValue;
    if (isLogY) {
        // Y-axis range is in log10 space (e.g., -3 to 3 for 0.001 to 1000)
        const logYValue = visibleYMax - (yPixelInPlotArea / plotAreaHeight) * (visibleYMax - visibleYMin);
        yValue = Math.pow(10, logYValue);
    } else {
        yValue = visibleYMax - (yPixelInPlotArea / plotAreaHeight) * (visibleYMax - visibleYMin);
    }

    // Round y-value to nearest allowed value
    yValue = roundYValue(yValue);

    return { x: xValue, y: yValue };
}

/**
 * Phase 1: Draws vertical line from top or bottom to clicked point
 * @param {HTMLElement} chartDiv - Chart container element
 * @param {Object} coords - Data coordinates {x, y}
 */
function drawVerticalLine(chartDiv, coords) {
    console.log(`Drawing vertical line at x=${coords.x}, y=${coords.y}`);

    // Store the coordinates - the vertical line goes through this point
    phaseLineState.verticalLineX = coords.x;
    phaseLineState.verticalLineY = coords.y;

    // Get axis information
    const yaxis = chartDiv._fullLayout.yaxis;
    const isLogY = yaxis.type === 'log';

    // Get current visible range
    const visibleYMin = yaxis.range[0];
    const visibleYMax = yaxis.range[1];

    // Convert to actual data values if log scale
    let yTop, yBottom;
    if (isLogY) {
        yBottom = Math.pow(10, visibleYMin);
        yTop = Math.pow(10, visibleYMax);
    } else {
        yBottom = visibleYMin;
        yTop = visibleYMax;
    }

    console.log(`Y-axis range: ${yBottom} to ${yTop} (log: ${isLogY})`);

    // Create vertical line shape
    let verticalLine;
    if (phaseLineState.direction === 'top') {
        // "top" mode: Line from BOTTOM UP to clicked point (horizontal will be at top)
        verticalLine = {
            type: 'line',
            x0: coords.x,
            y0: yBottom,
            x1: coords.x,
            y1: coords.y,
            xref: 'x',
            yref: 'y',
            line: {
                color: 'purple',
                width: 2
            }
        };
        console.log(`Drawing line from BOTTOM (y=${yBottom}) UP to clicked point (y=${coords.y})`);
    } else {
        // "bottom" mode: Line from TOP DOWN to clicked point (horizontal will be at bottom)
        verticalLine = {
            type: 'line',
            x0: coords.x,
            y0: yTop,
            x1: coords.x,
            y1: coords.y,
            xref: 'x',
            yref: 'y',
            line: {
                color: 'purple',
                width: 2
            }
        };
        console.log(`Drawing line from TOP (y=${yTop}) DOWN to clicked point (y=${coords.y})`);
    }

    // Get current shapes or initialize empty array
    const currentShapes = chartDiv.layout.shapes || [];

    // Add the vertical line
    const shapeIndex = currentShapes.length;
    phaseLineState.tempShapes.push(shapeIndex);

    Plotly.relayout(chartDiv, {
        shapes: [...currentShapes, verticalLine]
    });

    // Move to phase 2 and show arrow controls
    phaseLineState.currentPhase = 2;

    // Update toaster to show phase 2
    updatePhaseModeToaster(2);

    showArrowControls(chartDiv);
    console.log(`Phase 2: Click to the right to draw horizontal line from y=${coords.y}`);
}

/**
 * Phase 2: Draws horizontal line from vertical endpoint to new clicked point
 * @param {HTMLElement} chartDiv - Chart container element
 * @param {Object} coords - Data coordinates {x, y}
 */
function drawHorizontalLine(chartDiv, coords) {
    console.log(`Drawing horizontal line from (${phaseLineState.verticalLineX}, ${phaseLineState.verticalLineY}) to (${coords.x}, ${coords.y})`);

    // Validate that click is to the right of vertical line BEFORE rounding
    if (coords.x <= phaseLineState.verticalLineX) {
        console.warn('Please click to the right of the vertical line');
        return;
    }

    // Round x2 to nearest multiple of 7, ensuring it's not equal to x1
    const x2Rounded = roundHorizontalX(coords.x, phaseLineState.verticalLineX);

    console.log(`Original x2: ${coords.x}, Rounded x2: ${x2Rounded}`);

    // Store horizontal endpoint - use the ROUNDED x2 coordinate and KEEP the first click y coordinate for a truly horizontal line
    phaseLineState.horizontalEndX = x2Rounded;
    phaseLineState.horizontalEndY = phaseLineState.verticalLineY;  // Use first click Y value, not second!

    // Create horizontal line shape - perfectly horizontal at first click's Y value
    const horizontalLine = {
        type: 'line',
        x0: phaseLineState.verticalLineX,
        y0: phaseLineState.verticalLineY,
        x1: x2Rounded,
        y1: phaseLineState.verticalLineY,  // Use same Y value to make it horizontal
        xref: 'x',
        yref: 'y',
        line: {
            color: 'purple',
            width: 2
        }
    };

    console.log(`Drawing horizontal line at y=${phaseLineState.verticalLineY} from x=${phaseLineState.verticalLineX} to x=${x2Rounded}`);

    // Get current shapes
    const currentShapes = chartDiv.layout.shapes || [];

    // Add the horizontal line
    const shapeIndex = currentShapes.length;
    phaseLineState.tempShapes.push(shapeIndex);

    Plotly.relayout(chartDiv, {
        shapes: [...currentShapes, horizontalLine]
    });

    // Move to phase 3 - show text input
    // Note: Keep arrow controls visible so user can adjust horizontal line length
    phaseLineState.currentPhase = 3;

    // Update toaster to show phase 3
    updatePhaseModeToaster(3);

    showTextInput(chartDiv);
    console.log('Phase 3: Enter text label');
}

/**
 * Phase 3: Shows text input overlay for user to enter label
 * @param {HTMLElement} chartDiv - Chart container element
 */
function showTextInput(chartDiv) {
    createTextInputDialog({
        id: 'phase-text-input-overlay',
        title: 'Enter Count Marker Text',
        placeholder: 'Enter phase label...',
        borderColor: '#6ad1e3',
        onSubmit: (text) => {
            addPhaseTextLabel(chartDiv, text);
        },
        onCancel: () => {
            removePhaseShapes(chartDiv);
            deactivatePhaseLineMode();
        },
        stateRef: {
            state: phaseLineState,
            key: 'textInputOverlay'
        }
    });
}

/**
 * Adds text label annotation to the chart at horizontal line endpoint
 * @param {HTMLElement} chartDiv - Chart container element
 * @param {string} text - Label text
 */
function addPhaseTextLabel(chartDiv, text) {
    // Text placement: x from second click, y from first click
    const textX = phaseLineState.horizontalEndX;
    const textY = phaseLineState.verticalLineY;

    console.log(`Adding phase text label: "${text}" at (${textX}, ${textY})`);

    // BUG FIX: For log scale axes, Plotly annotations need log10 values even with yref: 'y'
    // while shapes use actual data values. This is inconsistent Plotly behavior.
    const yaxis = chartDiv._fullLayout.yaxis;
    const isLogY = yaxis.type === 'log';
    const annotationY = isLogY ? Math.log10(textY) : textY;

    console.log(`  Annotation Y (log10 if log scale): ${annotationY}`);

    // Create annotation for the text label
    const annotation = {
        x: textX,
        y: annotationY,  // Use log10 value for log scale
        xref: 'x',
        yref: 'y',
        text: text,
        showarrow: false,
        font: {
            color: 'purple',
            size: 12,
            family: 'Arial, sans-serif'
        },
        bgcolor: 'rgba(255, 255, 255, 0.8)',
        bordercolor: 'purple',
        borderwidth: 1,
        borderpad: 4,
        xanchor: 'left',
        yanchor: 'middle'
    };

    // Get current annotations
    const currentAnnotations = chartDiv.layout.annotations || [];

    // Add the annotation
    Plotly.relayout(chartDiv, {
        annotations: [...currentAnnotations, annotation]
    });

    // Remove text input overlay
    removeToast('phase-text-input-overlay');
    phaseLineState.textInputOverlay = null;

    // Store annotation index for potential removal
    phaseLineState.tempAnnotationIndex = currentAnnotations.length;

    // Update toaster to show phase 4
    updatePhaseModeToaster(4);

    // Show save confirmation toast
    showSaveConfirmationToast(chartDiv);

    console.log('Phase line drawn, awaiting save confirmation');
}

/**
 * Shows a toast notification in the top right asking user to confirm saving the line
 * @param {HTMLElement} chartDiv - Chart container element
 */
function showSaveConfirmationToast(chartDiv) {
    createConfirmToast({
        id: 'phase-save-toast',
        message: 'Save line?',
        borderColor: '#6ad1e3',
        onYes: () => {
            finalizePhaseLine(chartDiv);
            removeToast('phase-save-toast');
            phaseLineState.saveToast = null;
            deactivatePhaseLineMode();
        },
        onNo: () => {
            removePhaseShapes(chartDiv);
            removePhaseAnnotation(chartDiv);
            removeToast('phase-save-toast');
            phaseLineState.saveToast = null;
            deactivatePhaseLineMode();
        },
        stateRef: {
            state: phaseLineState,
            key: 'saveToast'
        }
    });
}

/**
 * Finalizes the phase line by changing colors from purple to black
 * @param {HTMLElement} chartDiv - Chart container element
 */
function finalizePhaseLine(chartDiv) {
    const lineId = Date.now();
    const lineName = `phase-${lineId}`;

    let shapes = [...(chartDiv.layout.shapes || [])];
    for (const index of phaseLineState.tempShapes) {
        if (shapes[index]) {
            shapes[index] = {
                ...shapes[index],
                name: lineName,
                line: {
                    ...shapes[index].line,
                    color: chartState.lineStyles.phase.color,
                    width: chartState.lineStyles.phase.width
                }
            };
        }
    }

    let annotations = [...(chartDiv.layout.annotations || [])];
    const annotationText = annotations[phaseLineState.tempAnnotationIndex]?.text || '';
    if (phaseLineState.tempAnnotationIndex !== null && annotations[phaseLineState.tempAnnotationIndex]) {
        annotations[phaseLineState.tempAnnotationIndex] = {
            ...annotations[phaseLineState.tempAnnotationIndex],
            name: lineName,
            font: {
                ...annotations[phaseLineState.tempAnnotationIndex].font,
                color: chartState.lineStyles.phase.color
            },
            bordercolor: chartState.lineStyles.phase.color
        };
    }

    Plotly.relayout(chartDiv, { shapes, annotations });

    const metadata = phaseLineMetadata(
        phaseLineState.direction,
        xPositionToDate(phaseLineState.verticalLineX),
        phaseLineState.verticalLineY,
        xPositionToDate(phaseLineState.horizontalEndX),
        annotationText,
        phaseLineState.tempShapes,
        phaseLineState.tempAnnotationIndex
    );
    metadata.id = lineId;
    chartState.PhaseLines[lineId] = metadata;

    phaseLineState.tempShapes = [];
    phaseLineState.tempAnnotationIndex = null;
}

/**
 * Removes the temporary annotation from the chart
 * @param {HTMLElement} chartDiv - Chart container element
 */
function removePhaseAnnotation(chartDiv) {
    if (phaseLineState.tempAnnotationIndex === null) {
        return;
    }

    console.log('Removing phase annotation at index:', phaseLineState.tempAnnotationIndex);

    // Get current annotations
    let annotations = [...(chartDiv.layout.annotations || [])];

    // Remove the annotation
    annotations.splice(phaseLineState.tempAnnotationIndex, 1);

    // Update layout
    Plotly.relayout(chartDiv, {
        annotations: annotations
    });
}

/**
 * Removes temporary phase shapes from the chart
 * @param {HTMLElement} chartDiv - Chart container element
 */
function removePhaseShapes(chartDiv) {
    if (phaseLineState.tempShapes.length === 0) {
        return;
    }

    console.log('Removing phase shapes:', phaseLineState.tempShapes);

    // Get current shapes
    let currentShapes = chartDiv.layout.shapes || [];

    // Remove shapes in reverse order to maintain indices
    const indicesToRemove = [...phaseLineState.tempShapes].sort((a, b) => b - a);

    for (const index of indicesToRemove) {
        currentShapes.splice(index, 1);
    }

    // Update layout
    Plotly.relayout(chartDiv, {
        shapes: currentShapes
    });
}

/**
 * Removes a phase line by its lineName (e.g., "phase-123")
 * @param {string} lineName - Name of the line (format: "phase-{id}")
 * @returns {boolean} True if successful, false otherwise
 */
function removePhaseLineById(lineName) {
    // Extract ID from lineName (format: "phase-123" -> 123)
    const lineId = parseInt(lineName.split('-')[1]);
    if (isNaN(lineId)) {
        console.error(`[REMOVE PHASE LINE] Invalid lineName format: ${lineName}`);
        return false;
    }

    return removeLine('PhaseLines', lineId);
}

/**
 * Handles click events on phase lines
 * @param {string} lineName - Name of the clicked line (e.g., "phase-123")
 */
function handlePhaseLineClick(lineName) {
    console.log(`[PHASE LINE CLICK] Phase line clicked: ${lineName}`);

    // Show toaster with Remove button, auto-dismiss after 3 seconds
    createToast({
        id: 'phase-line-click-toaster',
        message: 'Count marker',
        buttons: [
            {
                label: 'Remove',
                onClick: () => {
                    console.log(`[PHASE LINE CLICK] Remove clicked for ${lineName}`);
                    removePhaseLineById(lineName);
                    removeToast('phase-line-click-toaster');
                },
                type: 'secondary'
            }
        ],
        layout: 'horizontal',
        duration: 3000  // Auto-dismiss after 3 seconds
    });
}

/**
 * Shows "Phase mode" toaster on the left side with step indicator
 * @param {number} phase - Current phase (1, 2, 3, or 4)
 */
function showPhaseModeToaster(phase) {
    const stepText = getPhaseStepText(phase);
    phaseLineState.modeToast = createToast({
        message: `Count marker mode - ${stepText}`,
        buttons: [
            {
                label: 'Cancel',
                onClick: () => {
                    deactivatePhaseLineMode();
                },
                type: 'secondary'
            }
        ],
        layout: 'horizontal',
        borderColor: '#6ad1e3',
        position: 'top-right-secondary'
    });
}

/**
 * Updates the phase mode toaster with new phase information
 * @param {number} phase - Current phase (1, 2, 3, or 4)
 */
function updatePhaseModeToaster(phase) {
    // Remove existing toaster
    removeToast('toast-top-right-secondary');

    // Show new toaster with updated phase
    showPhaseModeToaster(phase);
}

/**
 * Gets descriptive text for the current phase
 * @param {number} phase - Current phase (1, 2, 3, or 4)
 * @returns {string} Step description
 */
function getPhaseStepText(phase) {
    if (phase === 1) {
        return 'Step 1 of 4: Place vertical line';
    } else if (phase === 2) {
        return 'Step 2 of 4: Place horizontal endpoint';
    } else if (phase === 3) {
        return 'Step 3 of 4: Enter text label';
    } else if (phase === 4) {
        return 'Step 4 of 4: Save confirmation';
    }
    return '';
}

/**
 * Toggle visibility of all phase lines
 * @param {boolean} visible - Whether phase lines should be visible
 */
function setPhaseLineVisibility(visible) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    const shapes = chartDiv.layout.shapes || [];
    const annotations = chartDiv.layout.annotations || [];
    let updated = false;

    // Update shapes with names starting with 'phase-'
    const updatedShapes = shapes.map(s => {
        if (s.name && s.name.startsWith('phase-')) {
            updated = true;
            return { ...s, visible };
        }
        return s;
    });

    // Update annotations with names starting with 'phase-'
    const updatedAnnotations = annotations.map(a => {
        if (a.name && a.name.startsWith('phase-')) {
            updated = true;
            return { ...a, visible };
        }
        return a;
    });

    if (updated) {
        Plotly.relayout(chartDiv, { shapes: updatedShapes, annotations: updatedAnnotations });
    }
}

/**
 * Initialize subscriptions for this module
 * Called by main.js coordinator
 */
function init() {
    // Subscribe to phase line click events from lineClickHandler
    eventBus.subscribe(EVENTS.LINE_PHASE_CLICKED, (data) => {
        handlePhaseLineClick(data.lineName);
    }, true);

    // Subscribe to mode activation events from navigation
    eventBus.subscribe(EVENTS.MODE_PHASE_ACTIVATE, (data) => {
        activatePhaseLineMode(data.direction);
    }, true);

    // Subscribe to mode deactivation events from other drawing modes
    eventBus.subscribe(EVENTS.MODE_ALL_DEACTIVATE, () => {
        if (phaseLineState.active) {
            deactivatePhaseLineMode();
        }
    });

    // Subscribe to line visibility changes from legend
    eventBus.subscribe(EVENTS.LINE_VISIBILITY_CHANGED, (data) => {
        if (data.lineType === 'phase') {
            setPhaseLineVisibility(data.visible);
        }
    }, true);
}

// Export functions for ES modules
export { activatePhaseLineMode, deactivatePhaseLineMode, handlePhaseLineClick, init };
