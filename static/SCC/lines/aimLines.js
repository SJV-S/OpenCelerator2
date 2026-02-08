/**
 * aimLines.js
 * Handles aim line drawing functionality for the chart (horizontal and diagonal)
 *
 * Two-phase drawing process:
 * 1. Click to place first point
 * 2. Click to place second point
 * 3. Add text label at center of line
 *
 * Modes:
 * - Horizontal: Draw horizontal line at clicked y-value
 * - Diagonal: Draw diagonal line from first click to second click
 */

import { chartState } from '../chartState.js';
import { COLORS } from '../config.js';
import { createToast, createTextInputDialog, createConfirmToast } from '../ui/toaster.js';
import { xPositionToDate, dateToXPosition } from '../util/dates.js';
import { aimLineMetadata } from './allLines.js';
import { icons, applySvgCursor, restoreCursor } from '../ui/icons.js';
import { eventBus, EVENTS } from '../eventBus.js';

var aimLineState = {
    active: false,
    direction: null,
    currentPhase: 0,
    clickHandler: null,
    touchHandler: null,
    x1: null,
    y1: null,
    x2: null,
    y2: null,
    tempShapes: [],
    tempDotIndex: null,
    textInputOverlay: null,
    tempAnnotationIndex: null,
    saveToast: null,
    modeToast: null,
    previousDragMode: null
};

/**
 * Builds the shape and annotation objects for an aim line.
 * Used by both initial draw (finalizeAimLine) and redraw (redrawAimLines).
 *
 * @param {Object} metadata - Aim line metadata
 * @param {number} metadata.id - Unique line ID
 * @param {string} metadata.direction - 'horizontal' or 'diagonal'
 * @param {Date|string} metadata.date1 - Start date
 * @param {number} metadata.y1 - Start y value
 * @param {Date|string} metadata.date2 - End date
 * @param {number} metadata.y2 - End y value
 * @param {string} metadata.text - Label text
 * @param {HTMLElement} chartDiv - Chart container element
 * @returns {Object} { shape, annotation } - Complete Plotly shape and annotation objects
 */
function buildAimLineElements(metadata, chartDiv) {
    const lineName = `aim-${metadata.id}`;
    const x1 = dateToXPosition(metadata.date1);
    const x2 = dateToXPosition(metadata.date2);

    // Build the shape
    const shape = {
        type: 'line',
        x0: x1,
        y0: metadata.y1,
        x1: x2,
        y1: metadata.y2,
        xref: 'x',
        yref: 'y',
        name: lineName,
        line: {
            color: chartState.lineStyles.aim.color,
            width: chartState.lineStyles.aim.width
        }
    };

    // Build the annotation (if text is provided)
    let annotation = null;
    if (metadata.text && metadata.text.trim() !== '') {
        const yaxis = chartDiv._fullLayout.yaxis;
        const isLogY = yaxis.type === 'log';

        // Calculate center point
        const centerX = (x1 + x2) / 2;

        // For log scale, center is the geometric mean (average in log space)
        let annotationY;
        if (isLogY) {
            const logY1 = Math.log10(metadata.y1);
            const logY2 = Math.log10(metadata.y2);
            annotationY = (logY1 + logY2) / 2;
        } else {
            annotationY = (metadata.y1 + metadata.y2) / 2;
        }

        // Calculate text angle for diagonal lines
        let textAngle = 0;
        if (metadata.direction === 'diagonal') {
            const xaxis = chartDiv._fullLayout.xaxis;

            // Calculate change in data coordinates
            const dx_data = x2 - x1;

            // For y, use log space if log scale
            let dy_data;
            if (isLogY) {
                dy_data = Math.log10(metadata.y2) - Math.log10(metadata.y1);
            } else {
                dy_data = metadata.y2 - metadata.y1;
            }

            // Get axis ranges and pixel dimensions
            const xRange = xaxis.range[1] - xaxis.range[0];
            const yRange = yaxis.range[1] - yaxis.range[0];
            const plotWidth = xaxis._length;
            const plotHeight = yaxis._length;

            // Convert to pixel space
            const dx_pixels = (dx_data / xRange) * plotWidth;
            const dy_pixels = (dy_data / yRange) * plotHeight;

            // Calculate angle (negate dy because screen y increases downward)
            textAngle = Math.atan2(-dy_pixels, dx_pixels) * (180 / Math.PI);
        }

        annotation = {
            x: centerX,
            y: annotationY,
            xref: 'x',
            yref: 'y',
            text: metadata.text,
            showarrow: false,
            font: {
                color: chartState.lineStyles.aim.color,
                size: 12,
                family: 'Arial, sans-serif'
            },
            bgcolor: 'rgba(255, 255, 255, 1.0)',
            bordercolor: chartState.lineStyles.aim.color,
            borderwidth: 1,
            borderpad: 4,
            textangle: textAngle,
            xanchor: 'center',
            yanchor: 'bottom',
            yshift: 5,
            name: lineName
        };
    }

    return { shape, annotation };
}

/**
 * Activates aim line drawing mode
 * @param {string} direction - 'horizontal' or 'diagonal'
 */
function activateAimLineMode(direction) {
    console.log(`%c[AIM LINE] Activating aim line mode: ${direction}`, 'color: blue; font-weight: bold');

    const chartDiv = document.getElementById('chart');

    if (!chartDiv) {
        console.error('[AIM LINE] Chart div not found!');
        return;
    }

    if (!chartDiv._fullLayout) {
        console.error('[AIM LINE] Chart not fully initialized!');
        return;
    }

    // Deactivate any other active drawing modes
    eventBus.emit(EVENTS.MODE_ALL_DEACTIVATE);

    aimLineState.active = true;
    aimLineState.direction = direction;
    aimLineState.currentPhase = 1;
    aimLineState.x1 = null;
    aimLineState.y1 = null;
    aimLineState.x2 = null;
    aimLineState.y2 = null;
    aimLineState.tempShapes = [];

    // Store current dragmode and disable panning
    aimLineState.previousDragMode = chartDiv.layout.dragmode;
    Plotly.relayout(chartDiv, {
        dragmode: false
    });

    // Create click/tap handler
    aimLineState.clickHandler = function(event) {
        console.log('[AIM LINE] Click detected!', event);
        handleAimLineDrawClick(event, chartDiv);
    };

    aimLineState.touchHandler = function(event) {
        console.log('[AIM LINE] Touch detected!', event);
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
            handleAimLineDrawClick(syntheticEvent, chartDiv);
        }
    };

    // Add click and touch listeners to chart
    chartDiv.addEventListener('click', aimLineState.clickHandler);
    chartDiv.addEventListener('touchstart', aimLineState.touchHandler);

    // Apply pen cursor (hotspot at pen tip, bottom-left)
    applySvgCursor(chartDiv, icons.otherPen, {size: 32, hotspotX: 3, hotspotY: 27});

    // Show "Aim mode" toaster on the left
    showAimModeToaster(1);

    console.log('%c[AIM LINE] Aim line mode activated - Phase 1: Click to place first point', 'color: green; font-weight: bold');
    console.log('[AIM LINE] Current state:', aimLineState);
}

/**
 * Deactivates aim line drawing mode
 */
function deactivateAimLineMode() {
    console.log('Deactivating aim line mode');

    const chartDiv = document.getElementById('chart');

    // Remove click listener
    if (aimLineState.clickHandler) {
        chartDiv.removeEventListener('click', aimLineState.clickHandler);
    }

    // Remove touch listener
    if (aimLineState.touchHandler) {
        chartDiv.removeEventListener('touchstart', aimLineState.touchHandler);
    }

    // Remove text input overlay if it exists
    if (aimLineState.textInputOverlay) {
        aimLineState.textInputOverlay.remove();
        aimLineState.textInputOverlay = null;
    }

    // Remove save toast if it exists
    if (aimLineState.saveToast) {
        aimLineState.saveToast.remove();
        aimLineState.saveToast = null;
    }

    // Remove mode toast if it exists
    if (aimLineState.modeToast) {
        aimLineState.modeToast.remove();
        aimLineState.modeToast = null;
    }

    // Remove temporary dot marker if it exists
    removeTempDot(chartDiv);

    // Remove any non-finalized lines and annotations ONLY if we're still in drawing phase
    // Don't remove if phase is 0 (already deactivated/finalized)
    if (aimLineState.currentPhase > 0) {
        removeAimShapes(chartDiv);
        removeAimAnnotation(chartDiv);
    }

    // Restore previous dragmode (re-enable panning)
    if (aimLineState.previousDragMode !== null) {
        Plotly.relayout(chartDiv, {
            dragmode: aimLineState.previousDragMode
        });
        aimLineState.previousDragMode = null;
    }

    // Restore default cursor
    restoreCursor(chartDiv);

    // Reset state
    aimLineState.active = false;
    aimLineState.direction = null;
    aimLineState.currentPhase = 0;
    aimLineState.clickHandler = null;
    aimLineState.touchHandler = null;
    aimLineState.x1 = null;
    aimLineState.y1 = null;
    aimLineState.x2 = null;
    aimLineState.y2 = null;
    aimLineState.tempShapes = [];
    aimLineState.tempDotIndex = null;
    aimLineState.tempAnnotationIndex = null;

    console.log('Aim line mode deactivated');
}

/**
 * Handles click events during aim line drawing
 * @param {MouseEvent} event - Click event
 * @param {HTMLElement} chartDiv - Chart container element
 */
function handleAimLineDrawClick(event, chartDiv) {
    // Get click coordinates relative to the plot area
    const coords = getPlotCoordinatesForAimLine(event, chartDiv);

    if (!coords) {
        console.warn('Could not get plot coordinates');
        return;
    }

    console.log(`Phase ${aimLineState.currentPhase} click at data coordinates:`, coords);

    if (aimLineState.currentPhase === 1) {
        handleFirstClick(chartDiv, coords);
    } else if (aimLineState.currentPhase === 2) {
        handleSecondClick(chartDiv, coords);
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
 * Converts pixel coordinates to plot data coordinates
 * @param {MouseEvent} event - Mouse event
 * @param {HTMLElement} chartDiv - Chart container element
 * @returns {Object|null} Object with x and y data coordinates, or null
 */
function getPlotCoordinatesForAimLine(event, chartDiv) {
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

    // Round to nearest integer (day boundary) so temp line matches finalized position
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

    // NO rounding for y-value - aim lines should allow precise placement

    return { x: xValue, y: yValue };
}

/**
 * Phase 1: Handles first click to establish starting point
 * @param {HTMLElement} chartDiv - Chart container element
 * @param {Object} coords - Data coordinates {x, y}
 */
function handleFirstClick(chartDiv, coords) {
    console.log(`First click at x=${coords.x}, y=${coords.y}`);

    // Store the first point
    aimLineState.x1 = coords.x;
    aimLineState.y1 = coords.y;

    // Add temporary dot marker at first click location
    addTempDot(chartDiv, coords.x, coords.y);

    // Move to phase 2
    aimLineState.currentPhase = 2;

    // Update toaster to show phase 2
    updateAimModeToaster(2);

    console.log(`Phase 2: Click to place endpoint for ${aimLineState.direction} line`);
}

/**
 * Phase 2: Handles second click to draw the line
 * @param {HTMLElement} chartDiv - Chart container element
 * @param {Object} coords - Data coordinates {x, y}
 */
function handleSecondClick(chartDiv, coords) {
    console.log(`Second click at x=${coords.x}, y=${coords.y}`);

    // Check if x2 <= x1, if so reset to phase 1
    if (coords.x <= aimLineState.x1) {
        console.log(`Invalid second click: x2 (${coords.x}) <= x1 (${aimLineState.x1}). Resetting to phase 1.`);

        // Remove the current dot
        removeTempDot(chartDiv);

        // Reset to phase 1 and clear coordinates
        aimLineState.currentPhase = 1;
        aimLineState.x1 = null;
        aimLineState.y1 = null;
        aimLineState.x2 = null;
        aimLineState.y2 = null;

        // Update toaster back to phase 1
        updateAimModeToaster(1);

        console.log('Reset complete. Click to place first point again.');
        return;
    }

    if (aimLineState.direction === 'horizontal') {
        drawHorizontalAimLine(chartDiv, coords);
    } else if (aimLineState.direction === 'diagonal') {
        drawDiagonalAimLine(chartDiv, coords);
    }
}

/**
 * Draws a horizontal aim line
 * @param {HTMLElement} chartDiv - Chart container element
 * @param {Object} coords - Data coordinates {x, y} from second click
 */
function drawHorizontalAimLine(chartDiv, coords) {
    // Remove the temporary dot first
    removeTempDot(chartDiv);

    // For horizontal line: use y from first click, x from both clicks
    const yValue = aimLineState.y1;
    const x1 = Math.min(aimLineState.x1, coords.x);
    const x2 = Math.max(aimLineState.x1, coords.x);

    // Store for later use
    aimLineState.x2 = x2;
    aimLineState.y2 = yValue;

    console.log(`Drawing horizontal line at y=${yValue} from x=${x1} to x=${x2}`);

    // Create horizontal line shape
    const lineShape = {
        type: 'line',
        x0: x1,
        y0: yValue,
        x1: x2,
        y1: yValue,
        xref: 'x',
        yref: 'y',
        line: {
            color: 'blue',
            width: 2
        }
    };

    // Get current shapes
    const currentShapes = chartDiv.layout.shapes || [];

    // Add the line
    const shapeIndex = currentShapes.length;
    aimLineState.tempShapes.push(shapeIndex);

    Plotly.relayout(chartDiv, {
        shapes: [...currentShapes, lineShape]
    });

    // Move to phase 3 - show text input
    aimLineState.currentPhase = 3;

    // Remove instruction toaster - the text input dialog includes the step info
    if (aimLineState.modeToast) {
        aimLineState.modeToast.remove();
        aimLineState.modeToast = null;
    }

    showAimTextInput(chartDiv);
    console.log('Phase 3: Enter text label');
}

/**
 * Draws a diagonal aim line
 * @param {HTMLElement} chartDiv - Chart container element
 * @param {Object} coords - Data coordinates {x, y} from second click
 */
function drawDiagonalAimLine(chartDiv, coords) {
    // Remove the temporary dot first
    removeTempDot(chartDiv);

    // Store second point
    aimLineState.x2 = coords.x;
    aimLineState.y2 = coords.y;

    console.log(`Drawing diagonal line from (${aimLineState.x1}, ${aimLineState.y1}) to (${aimLineState.x2}, ${aimLineState.y2})`);

    // Create diagonal line shape
    const lineShape = {
        type: 'line',
        x0: aimLineState.x1,
        y0: aimLineState.y1,
        x1: aimLineState.x2,
        y1: aimLineState.y2,
        xref: 'x',
        yref: 'y',
        line: {
            color: 'blue',
            width: 2
        }
    };

    // Get current shapes
    const currentShapes = chartDiv.layout.shapes || [];

    // Add the line
    const shapeIndex = currentShapes.length;
    aimLineState.tempShapes.push(shapeIndex);

    Plotly.relayout(chartDiv, {
        shapes: [...currentShapes, lineShape]
    });

    // Move to phase 3 - show text input
    aimLineState.currentPhase = 3;

    // Remove instruction toaster - the text input dialog includes the step info
    if (aimLineState.modeToast) {
        aimLineState.modeToast.remove();
        aimLineState.modeToast = null;
    }

    showAimTextInput(chartDiv);
    console.log('Phase 3: Enter text label');
}

/**
 * Phase 3: Shows text input overlay for user to enter label
 * @param {HTMLElement} chartDiv - Chart container element
 */
function showAimTextInput(chartDiv) {
    aimLineState.textInputOverlay = createTextInputDialog({
        title: 'Enter Event Marker Text',
        placeholder: 'Enter label...',
        borderColor: COLORS.PRIMARY,
        onSubmit: (text) => {
            addAimTextLabel(chartDiv, text);
        },
        onCancel: () => {
            removeAimShapes(chartDiv);
            deactivateAimLineMode();
        }
    });
}

/**
 * Adds text label annotation to the chart at the center of the line
 * @param {HTMLElement} chartDiv - Chart container element
 * @param {string} text - Label text
 */
function addAimTextLabel(chartDiv, text) {
    // Remove text input overlay
    if (aimLineState.textInputOverlay) {
        aimLineState.textInputOverlay.remove();
        aimLineState.textInputOverlay = null;
    }

    // If text is empty, skip annotation creation
    if (!text || text.trim() === '') {
        console.log('No text provided, skipping annotation');
        aimLineState.tempAnnotationIndex = null;

        // Remove instruction toaster - the confirm dialog includes the step info
        if (aimLineState.modeToast) {
            aimLineState.modeToast.remove();
            aimLineState.modeToast = null;
        }

        showAimSaveConfirmationToast(chartDiv);
        return;
    }

    // Handle log scale for y-axis - need to calculate center differently
    const yaxis = chartDiv._fullLayout.yaxis;
    const isLogY = yaxis.type === 'log';

    // Calculate center point of the line
    const centerX = (aimLineState.x1 + aimLineState.x2) / 2;

    // For log scale, center is the geometric mean (average in log space)
    // For linear scale, center is the arithmetic mean
    let centerY, annotationY;
    if (isLogY) {
        // Geometric mean: sqrt(y1 * y2) = 10^((log10(y1) + log10(y2)) / 2)
        const logY1 = Math.log10(aimLineState.y1);
        const logY2 = Math.log10(aimLineState.y2);
        annotationY = (logY1 + logY2) / 2;
        centerY = Math.pow(10, annotationY);
    } else {
        centerY = (aimLineState.y1 + aimLineState.y2) / 2;
        annotationY = centerY;
    }

    console.log(`Adding aim text label: "${text}" at center (${centerX}, ${centerY})`);
    console.log(`  Annotation Y (log10 if log scale): ${annotationY}`);

    // Calculate angle for diagonal lines (in screen space to match visual slope)
    let textAngle = 0;
    if (aimLineState.direction === 'diagonal') {
        const xaxis = chartDiv._fullLayout.xaxis;

        // Calculate change in data coordinates (x is always linear)
        const dx_data = aimLineState.x2 - aimLineState.x1;

        // For y, use log space if log scale
        let dy_data;
        if (isLogY) {
            dy_data = Math.log10(aimLineState.y2) - Math.log10(aimLineState.y1);
        } else {
            dy_data = aimLineState.y2 - aimLineState.y1;
        }

        // Get axis ranges and pixel dimensions
        const xRange = xaxis.range[1] - xaxis.range[0];
        const yRange = yaxis.range[1] - yaxis.range[0];
        const plotWidth = xaxis._length;
        const plotHeight = yaxis._length;

        // Convert to pixel space
        const dx_pixels = (dx_data / xRange) * plotWidth;
        const dy_pixels = (dy_data / yRange) * plotHeight;

        // Calculate angle (negate dy because screen y increases downward)
        textAngle = Math.atan2(-dy_pixels, dx_pixels) * (180 / Math.PI);

        console.log(`  Diagonal line angle: ${textAngle} degrees`);
        console.log(`    Data: dx=${dx_data}, dy=${dy_data}`);
        console.log(`    Pixels: dx=${dx_pixels}, dy=${dy_pixels}`);
    }

    // Create annotation for the text label
    const annotation = {
        x: centerX,
        y: annotationY,  // Use log10 value for log scale
        xref: 'x',
        yref: 'y',
        text: text,
        showarrow: false,
        font: {
            color: 'blue',
            size: 12,
            family: 'Arial, sans-serif'
        },
        bgcolor: 'rgba(255, 255, 255, 1.0)',
        bordercolor: 'blue',
        borderwidth: 1,
        borderpad: 4,
        textangle: textAngle,  // Tilt text for diagonal lines
        xanchor: 'center',
        yanchor: 'bottom',  // Anchor to bottom so text sits above the line
        yshift: 5  // Shift text 5 pixels above the line
    };

    // Get current annotations
    const currentAnnotations = chartDiv.layout.annotations || [];

    // Add the annotation
    Plotly.relayout(chartDiv, {
        annotations: [...currentAnnotations, annotation]
    });

    // Store annotation index for potential removal
    aimLineState.tempAnnotationIndex = currentAnnotations.length;

    // Remove instruction toaster - the confirm dialog includes the step info
    if (aimLineState.modeToast) {
        aimLineState.modeToast.remove();
        aimLineState.modeToast = null;
    }

    // Show save confirmation toast
    showAimSaveConfirmationToast(chartDiv);

    console.log('Aim line drawn, awaiting save confirmation');
}

/**
 * Shows a toast notification asking user to confirm saving the line
 * @param {HTMLElement} chartDiv - Chart container element
 */
function showAimSaveConfirmationToast(chartDiv) {
    aimLineState.saveToast = createConfirmToast({
        message: 'Save line?',
        borderColor: COLORS.PRIMARY,
        onYes: () => {
            finalizeAimLine(chartDiv);
            aimLineState.saveToast = null;
            deactivateAimLineMode();
        },
        onNo: () => {
            removeAimShapes(chartDiv);
            removeAimAnnotation(chartDiv);
            aimLineState.saveToast = null;
            deactivateAimLineMode();
        }
    });
}

/**
 * Finalizes the aim line by replacing temp shapes/annotations with finalized versions
 * @param {HTMLElement} chartDiv - Chart container element
 */
function finalizeAimLine(chartDiv) {
    const lineId = Date.now();

    // Get annotation text before removing temp shapes
    const currentAnnotations = chartDiv.layout.annotations || [];
    const annotationText = currentAnnotations[aimLineState.tempAnnotationIndex]?.text || '';

    // Build metadata object
    const metadata = aimLineMetadata(
        aimLineState.direction,
        xPositionToDate(aimLineState.x1),
        aimLineState.y1,
        xPositionToDate(aimLineState.x2),
        aimLineState.y2,
        annotationText,
        aimLineState.tempShapes,
        aimLineState.tempAnnotationIndex
    );
    metadata.id = lineId;

    // Use builder to get finalized shape and annotation
    const elements = buildAimLineElements(metadata, chartDiv);

    // Remove temp shapes/annotations and add finalized versions
    let shapes = [...(chartDiv.layout.shapes || [])];
    let annotations = [...currentAnnotations];

    // Remove temp annotation first (if it exists)
    if (aimLineState.tempAnnotationIndex !== null) {
        annotations.splice(aimLineState.tempAnnotationIndex, 1);
    }

    // Remove temp shapes in reverse order to maintain indices
    const indicesToRemove = [...aimLineState.tempShapes].sort((a, b) => b - a);
    for (const index of indicesToRemove) {
        shapes.splice(index, 1);
    }

    // Add finalized shape
    shapes.push(elements.shape);
    metadata.shapeIndices = [shapes.length - 1];

    // Add finalized annotation (if exists)
    if (elements.annotation) {
        annotations.push(elements.annotation);
        metadata.annotationIndex = annotations.length - 1;
    } else {
        metadata.annotationIndex = null;
    }

    Plotly.relayout(chartDiv, { shapes, annotations });

    chartState.AimLines[lineId] = metadata;
    eventBus.emit(EVENTS.LINE_AIM_SAVED, { lineId, metadata });

    aimLineState.tempShapes = [];
    aimLineState.tempAnnotationIndex = null;
}

/**
 * Removes the temporary annotation from the chart
 * @param {HTMLElement} chartDiv - Chart container element
 */
function removeAimAnnotation(chartDiv) {
    if (aimLineState.tempAnnotationIndex === null) {
        return;
    }

    console.log('Removing aim annotation at index:', aimLineState.tempAnnotationIndex);

    // Get current annotations
    let annotations = [...(chartDiv.layout.annotations || [])];

    // Remove the annotation
    annotations.splice(aimLineState.tempAnnotationIndex, 1);

    // Update layout
    Plotly.relayout(chartDiv, {
        annotations: annotations
    });
}

/**
 * Removes temporary aim shapes from the chart
 * @param {HTMLElement} chartDiv - Chart container element
 */
function removeAimShapes(chartDiv) {
    if (aimLineState.tempShapes.length === 0) {
        return;
    }

    console.log('Removing aim shapes:', aimLineState.tempShapes);

    // Get current shapes
    let currentShapes = chartDiv.layout.shapes || [];

    // Remove shapes in reverse order to maintain indices
    const indicesToRemove = [...aimLineState.tempShapes].sort((a, b) => b - a);

    for (const index of indicesToRemove) {
        currentShapes.splice(index, 1);
    }

    // Update layout
    Plotly.relayout(chartDiv, {
        shapes: currentShapes
    });
}

/**
 * Shows "Aim mode" toaster on the left side with step indicator
 * @param {number} phase - Current phase (1 or 2)
 */
function showAimModeToaster(phase) {
    const stepText = getPhaseStepText(phase);
    aimLineState.modeToast = createToast({
        message: `Event marker mode - ${stepText}`,
        buttons: [
            {
                label: 'Cancel',
                onClick: () => {
                    deactivateAimLineMode();
                },
                type: 'secondary'
            }
        ],
        layout: 'horizontal',
        borderColor: COLORS.PRIMARY,
        position: 'top-right'
    });
}

/**
 * Updates the aim mode toaster with new phase information
 * @param {number} phase - Current phase (1 or 2)
 */
function updateAimModeToaster(phase) {
    // Remove existing toaster
    if (aimLineState.modeToast) {
        aimLineState.modeToast.remove();
        aimLineState.modeToast = null;
    }

    // Show new toaster with updated phase
    showAimModeToaster(phase);
}

/**
 * Gets descriptive text for the current phase
 * @param {number} phase - Current phase (1, 2, 3, or 4)
 * @returns {string} Step description
 */
function getPhaseStepText(phase) {
    if (phase === 1) {
        return 'Place starting point';
    } else if (phase === 2) {
        return 'Place target';
    }
    return '';
}

/**
 * Adds a temporary dot marker at the first click position
 * @param {HTMLElement} chartDiv - Chart container element
 * @param {number} x - X coordinate in data space
 * @param {number} y - Y coordinate in data space
 */
function addTempDot(chartDiv, x, y) {
    console.log(`Adding temporary dot at (${x}, ${y})`);

    const xaxis = chartDiv._fullLayout.xaxis;
    const yaxis = chartDiv._fullLayout.yaxis;
    const isLogY = yaxis.type === 'log';

    // Convert data coordinates to pixel coordinates
    const xPixel = xaxis._offset + ((x - xaxis.range[0]) / (xaxis.range[1] - xaxis.range[0])) * xaxis._length;

    let yPixel;
    if (isLogY) {
        const logY = Math.log10(y);
        yPixel = yaxis._offset + (1 - ((logY - yaxis.range[0]) / (yaxis.range[1] - yaxis.range[0]))) * yaxis._length;
    } else {
        yPixel = yaxis._offset + (1 - ((y - yaxis.range[0]) / (yaxis.range[1] - yaxis.range[0]))) * yaxis._length;
    }

    // Create SVG circle element
    const svgLayer = chartDiv.querySelector('.plotly .gridlayer');
    if (!svgLayer) {
        console.error('Could not find SVG layer');
        return;
    }

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', xPixel);
    circle.setAttribute('cy', yPixel);
    circle.setAttribute('r', 8);
    circle.setAttribute('fill', 'blue');
    circle.setAttribute('stroke', 'blue');
    circle.setAttribute('stroke-width', 2);
    circle.setAttribute('opacity', 0.8);
    circle.setAttribute('id', 'aim-temp-dot');

    svgLayer.appendChild(circle);
    aimLineState.tempDotIndex = 'svg-dot';

    console.log(`Temporary SVG dot added at pixel (${xPixel}, ${yPixel})`);
}

/**
 * Removes the temporary dot marker
 * @param {HTMLElement} chartDiv - Chart container element
 */
function removeTempDot(chartDiv) {
    if (aimLineState.tempDotIndex === null) {
        return;
    }

    console.log('Removing temporary dot');

    // Remove SVG circle element
    const dot = document.getElementById('aim-temp-dot');
    if (dot) {
        dot.remove();
    }

    aimLineState.tempDotIndex = null;
}

/**
 * Toggle visibility of all aim lines
 * @param {boolean} visible - Whether aim lines should be visible
 */
function setAimLineVisibility(visible) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    const shapes = chartDiv.layout.shapes || [];
    const annotations = chartDiv.layout.annotations || [];
    let updated = false;

    // Update shapes with names starting with 'aim-'
    const updatedShapes = shapes.map(s => {
        if (s.name && s.name.startsWith('aim-')) {
            updated = true;
            return { ...s, visible };
        }
        return s;
    });

    // Update annotations with names starting with 'aim-'
    const updatedAnnotations = annotations.map(a => {
        if (a.name && a.name.startsWith('aim-')) {
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
 * Redraw all aim lines from chartState.AimLines
 * Called after chart replot to restore saved lines
 */
function redrawAimLines() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    // Filter out existing aim shapes/annotations
    const shapes = (chartDiv.layout.shapes || []).filter(s => !s.name?.startsWith('aim-'));
    const annotations = (chartDiv.layout.annotations || []).filter(a => !a.name?.startsWith('aim-'));

    // Rebuild shapes and annotations from chartState using the builder
    const isVisible = chartState.lineVisibility.aim;
    Object.values(chartState.AimLines).forEach(metadata => {
        const elements = buildAimLineElements(metadata, chartDiv);

        // Apply saved visibility state to rebuilt elements
        if (!isVisible) {
            elements.shape.visible = false;
            if (elements.annotation) elements.annotation.visible = false;
        }

        // Add shape
        shapes.push(elements.shape);

        // Add annotation (if exists)
        if (elements.annotation) {
            annotations.push(elements.annotation);
        }
    });

    Plotly.relayout(chartDiv, { shapes, annotations });
}

/**
 * Initialize subscriptions for this module
 * Called by main.js coordinator
 */
function init() {
    // Subscribe to mode activation events from navigation
    eventBus.subscribe(EVENTS.MODE_AIM_ACTIVATE, (data) => {
        activateAimLineMode(data.direction);
    }, true);

    // Subscribe to mode deactivation events from other drawing modes
    eventBus.subscribe(EVENTS.MODE_ALL_DEACTIVATE, () => {
        if (aimLineState.active) {
            deactivateAimLineMode();
        }
    });

    // Subscribe to line visibility changes from legend
    eventBus.subscribe(EVENTS.LINE_VISIBILITY_CHANGED, (data) => {
        if (data.lineType === 'aim') {
            setAimLineVisibility(data.visible);
        }
    }, true);

    // Redraw aim lines after chart replot completes
    eventBus.subscribe(EVENTS.DATA_CHART_REPLOT_COMPLETE, () => {
        redrawAimLines();
    });
}

// Export functions for ES modules
export { activateAimLineMode, deactivateAimLineMode, init };

console.log('aimLines.js loaded');
