// credit.js
// Handles credit lines as Plotly annotations in the chart's bottom margin

import { chartState } from '../chartState.js';
import { createToast, removeToast } from '../util/toaster.js';
import { eventBus, EVENTS } from '../eventBus.js';

const CREDIT_COLOR = '#05c3de';
const MOBILE_BREAKPOINT = 1024;

/**
 * Check if current viewport is mobile-sized
 */
function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * Generate credit annotations and hit-area shapes for Plotly
 * Positions credits in the expanded bottom margin area
 */
function generateCreditElements(layout) {
    if (!chartState.credits) {
        chartState.credits = { 0: '', 1: '' };
    }

    const annotations = [];
    const shapes = [];

    // Calculate font size based on layout dimensions
    // Use a percentage of plot height for consistent scaling
    const plotHeight = layout.height - layout.margin.t - layout.margin.b;
    const fontSize = Math.max(8, Math.min(12, plotHeight * 0.018));

    // Position credits in the bottom margin
    // y = 0 is the bottom of the plot area, negative values go into the margin
    // We'll place credit 0 at y = -0.04 and credit 1 at y = -0.09 (in paper coords)
    const creditPositions = [
        { y: -0.035, hitY0: -0.055, hitY1: -0.015 },  // Credit line 0
        { y: -0.08, hitY0: -0.10, hitY1: -0.06 }      // Credit line 1
    ];

    [0, 1].forEach((index) => {
        const pos = creditPositions[index];
        const text = chartState.credits[index] || '';

        // Credit text annotation
        annotations.push({
            name: `credit-line-${index}`,
            x: 0.5,
            y: pos.y,
            xref: 'paper',
            yref: 'paper',
            text: text || ' ',  // Use space if empty to maintain clickable area
            showarrow: false,
            font: {
                family: 'Tahoma, DejaVu Sans, Verdana, sans-serif',
                size: fontSize,
                color: CREDIT_COLOR,
                weight: 'bold'
            },
            xanchor: 'center',
            yanchor: 'middle'
        });

        // Invisible hit-area rectangle for easier clicking
        shapes.push({
            type: 'rect',
            name: `credit-hitarea-${index}`,
            x0: 0,
            y0: pos.hitY0,
            x1: 1,
            y1: pos.hitY1,
            xref: 'paper',
            yref: 'paper',
            fillcolor: 'rgba(0,0,0,0)',
            line: { width: 0 }
        });
    });

    return { annotations, shapes };
}

/**
 * Inject credit elements into plotData before Plotly.newPlot()
 * Expands the bottom margin to create space for credits
 * @param {Object} plotData - The plot data object with layout
 * @returns {Object} Modified plotData
 */
export function injectCredits(plotData) {
    // Skip on mobile - credits shown in menu tab instead
    if (isMobile()) {
        return plotData;
    }

    // Expand bottom margin to make room for credits
    const extraMargin = 60;
    plotData.layout.margin.b += extraMargin;
    plotData.layout.height += extraMargin;

    // Generate and add credit elements
    const { annotations, shapes } = generateCreditElements(plotData.layout);

    plotData.layout.annotations = [...(plotData.layout.annotations || []), ...annotations];
    plotData.layout.shapes = [...(plotData.layout.shapes || []), ...shapes];

    return plotData;
}

/**
 * Update credit annotations via Plotly.relayout
 * Called after editing or when credits change
 */
export function renderCredits() {
    const chartDiv = document.getElementById('chart');

    // Update mobile credit lines (always, regardless of viewport)
    [0, 1].forEach(index => {
        const mobileLine = document.getElementById(`mobile-credit-${index}`);
        if (mobileLine) {
            mobileLine.textContent = chartState.credits?.[index] || '';
        }
    });

    // On mobile, don't update Plotly annotations
    if (isMobile() || !chartDiv?.layout) {
        return;
    }

    // Find and update credit annotations
    const updates = {};
    (chartDiv.layout.annotations || []).forEach((ann, i) => {
        if (ann.name === 'credit-line-0') {
            updates[`annotations[${i}].text`] = chartState.credits[0] || ' ';
        } else if (ann.name === 'credit-line-1') {
            updates[`annotations[${i}].text`] = chartState.credits[1] || ' ';
        }
    });

    if (Object.keys(updates).length > 0) {
        Plotly.relayout(chartDiv, updates);
    }
}

/**
 * Regenerate credits with current layout dimensions
 * Called on resize to recalculate font sizes
 */
export function regenerateCredits() {
    if (isMobile()) return;

    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout) return;

    // Remove existing credit shapes and annotations
    const existingShapes = (chartDiv.layout.shapes || []).filter(s => !s.name?.startsWith('credit-'));
    const existingAnnotations = (chartDiv.layout.annotations || []).filter(a => !a.name?.startsWith('credit-'));

    // Generate new credits with current layout
    const { annotations, shapes } = generateCreditElements(chartDiv.layout);

    // Update in single relayout call
    Plotly.relayout(chartDiv, {
        shapes: [...existingShapes, ...shapes],
        annotations: [...existingAnnotations, ...annotations]
    });
}

/**
 * Convert pixel coordinates to paper coordinates
 */
function pixelToPaper(chartDiv, pixelX, pixelY) {
    const layout = chartDiv.layout;
    const bbox = chartDiv.getBoundingClientRect();

    const plotLeft = bbox.left + layout.margin.l;
    const plotRight = bbox.right - layout.margin.r;
    const plotTop = bbox.top + layout.margin.t;
    const plotBottom = bbox.bottom - layout.margin.b;

    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;

    const paperX = (pixelX - plotLeft) / plotWidth;
    const paperY = 1 - (pixelY - plotTop) / plotHeight;

    return { x: paperX, y: paperY };
}

/**
 * Check if a paper coordinate point is within a credit hit-area
 * Returns the credit index (0 or 1) or -1 if not on a credit
 */
function getCreditAtPoint(chartDiv, paperX, paperY) {
    const layout = chartDiv.layout;

    for (const shape of (layout.shapes || [])) {
        if (shape.name === 'credit-hitarea-0') {
            if (paperX >= shape.x0 && paperX <= shape.x1 &&
                paperY >= shape.y0 && paperY <= shape.y1) {
                return 0;
            }
        } else if (shape.name === 'credit-hitarea-1') {
            if (paperX >= shape.x0 && paperX <= shape.x1 &&
                paperY >= shape.y0 && paperY <= shape.y1) {
                return 1;
            }
        }
    }

    return -1;
}

/**
 * Open a modal dialog for editing a credit line
 */
function openCreditEditDialog(index) {
    const dialogId = 'credit-edit-dialog';

    // Remove existing dialog if any
    removeToast(dialogId);

    const currentValue = chartState.credits?.[index] || '';

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = dialogId;
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    // Create dialog box
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        padding: 20px;
        border: 2px solid ${CREDIT_COLOR};
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        width: 90%;
        max-width: 600px;
    `;

    dialog.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px; font-weight: bold;">
            Edit Credit Line ${index + 1}
        </h3>
        <input type="text" id="credit-edit-input"
               style="width: 100%; padding: 10px; font-size: 14px; border: 1px solid #ccc;
                      border-radius: 4px; box-sizing: border-box; font-family: Tahoma, sans-serif;"
               value="${currentValue.replace(/"/g, '&quot;')}"
               placeholder="Enter credit line text...">
        <div style="display: flex; gap: 10px; margin-top: 15px; justify-content: flex-end;">
            <button id="credit-edit-cancel"
                    style="padding: 10px 20px; background: #e5e7eb; color: #374151; border: none;
                           border-radius: 4px; cursor: pointer; font-size: 14px;">
                Cancel
            </button>
            <button id="credit-edit-submit"
                    style="padding: 10px 20px; background: ${CREDIT_COLOR}; color: white; border: none;
                           border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;">
                Save
            </button>
        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Focus and select input
    const input = document.getElementById('credit-edit-input');
    input.focus();
    input.select();

    // Handle save
    const handleSave = () => {
        const newValue = input.value;
        if (newValue !== currentValue) {
            chartState.credits[index] = newValue;
            eventBus.emit(EVENTS.CREDIT_CHANGED, { index, value: newValue });
            renderCredits();
            createToast({
                message: 'Credit updated',
                duration: 2000,
                position: 'top-right'
            });
        }
        overlay.remove();
    };

    // Handle cancel
    const handleCancel = () => {
        overlay.remove();
    };

    document.getElementById('credit-edit-submit').addEventListener('click', handleSave);
    document.getElementById('credit-edit-cancel').addEventListener('click', handleCancel);

    // Handle Enter key
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSave();
        }
    });

    // Handle Escape key
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            handleCancel();
        }
    });

    // Handle click outside dialog to cancel
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            handleCancel();
        }
    });
}

/**
 * Handle click events on the chart to detect credit clicks
 */
function handleChartClick(e) {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout || isMobile()) return;

    const paper = pixelToPaper(chartDiv, e.clientX, e.clientY);
    const creditIndex = getCreditAtPoint(chartDiv, paper.x, paper.y);

    if (creditIndex >= 0) {
        openCreditEditDialog(creditIndex);
    }
}

/**
 * Initialize click handler for credit editing
 */
export function initCreditClick() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    // Remove existing listener (in case of re-init)
    chartDiv.removeEventListener('click', handleChartClick);

    // Add click listener
    chartDiv.addEventListener('click', handleChartClick);
}

/**
 * Initialize event subscriptions and render initial credits
 */
function init() {
    eventBus.subscribe(EVENTS.NAV_TAB_SWITCH, (data) => {
        if (data.tab === 'credit') {
            // Refresh mobile credit lines when switching to credit tab
            renderCredits();
        }
    }, true);
}

export { init };
