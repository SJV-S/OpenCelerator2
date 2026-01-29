// credit.js
// Renders credit lines in the chart's bottom margin and handles editing

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';

const CREDIT_COLOR = '#05c3de';
const MOBILE_BREAKPOINT = 768;

function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * Generate credit annotations for Plotly
 * Positions credits in the expanded bottom margin area
 */
function generateCreditAnnotations(layout) {
    if (!chartState.credits) {
        chartState.credits = { 0: '', 1: '' };
    }

    const annotations = [];
    const plotHeight = layout.height - layout.margin.t - layout.margin.b;
    const fontSize = Math.max(10, Math.min(14, plotHeight * 0.018));

    // Calculate margin edge in paper coords (y=0 is plot bottom, negative goes into margin)
    // marginEdge is the bottom of the margin in paper coordinates
    const marginEdge = -layout.margin.b / plotHeight;

    // Position credits as percentage above the margin edge
    // Credit 0: 30% up from edge, Credit 1: 70% up from edge
    const creditPositions = [
        { y: marginEdge * 0.70 },   // Credit line 0 (30% from bottom)
        { y: marginEdge * 0.30 }    // Credit line 1 (70% from bottom)
    ];

    [0, 1].forEach((index) => {
        const pos = creditPositions[index];
        const text = chartState.credits[index] || '';

        annotations.push({
            name: `credit-line-${index}`,
            x: 0.5,
            y: pos.y,
            xref: 'paper',
            yref: 'paper',
            text: text || ' ',
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
    });

    return annotations;
}

/**
 * Inject credit annotations into plotData before Plotly.newPlot()
 */
export function injectCredits(plotData) {
    // Skip on mobile
    if (isMobile()) return plotData;

    const annotations = generateCreditAnnotations(plotData.layout);
    plotData.layout.annotations = [...(plotData.layout.annotations || []), ...annotations];
    return plotData;
}

/**
 * Update credit annotations via Plotly.relayout
 */
export function renderCredits() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout) return;

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
 */
export function regenerateCredits() {
    if (isMobile()) return;

    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout) return;

    const existingAnnotations = (chartDiv.layout.annotations || []).filter(a => !a.name?.startsWith('credit-'));
    const newAnnotations = generateCreditAnnotations(chartDiv.layout);

    Plotly.relayout(chartDiv, {
        annotations: [...existingAnnotations, ...newAnnotations]
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

    return {
        x: (pixelX - plotLeft) / plotWidth,
        y: 1 - (pixelY - plotTop) / plotHeight
    };
}

/**
 * Check if click is on a credit line, return index or -1
 */
function getCreditAtPoint(chartDiv, paperY) {
    const layout = chartDiv.layout;
    const plotHeight = layout.height - layout.margin.t - layout.margin.b;
    const marginEdge = -layout.margin.b / plotHeight;

    // Credit positions (same calculation as generateCreditAnnotations)
    const credit0Y = marginEdge * 0.70;
    const credit1Y = marginEdge * 0.30;
    const hitRadius = Math.abs(marginEdge) * 0.15;

    if (paperY >= credit0Y - hitRadius && paperY <= credit0Y + hitRadius) return 0;
    if (paperY >= credit1Y - hitRadius && paperY <= credit1Y + hitRadius) return 1;
    return -1;
}

/**
 * Open modal dialog for editing a credit line
 */
function openCreditEditDialog(index) {
    // Remove existing dialog
    const existing = document.getElementById('credit-edit-dialog');
    if (existing) existing.remove();

    const currentValue = chartState.credits?.[index] || '';

    const overlay = document.createElement('div');
    overlay.id = 'credit-edit-dialog';
    overlay.className = 'fixed inset-0 bg-black/50 flex justify-center items-center z-[10000]';

    overlay.innerHTML = `
        <div class="bg-white p-5 border-2 rounded-lg shadow-xl w-[90%] max-w-[600px]" style="border-color: ${CREDIT_COLOR}">
            <h3 class="m-0 mb-4 text-gray-700 text-base font-bold">Edit Credit Line ${index + 1}</h3>
            <input type="text" id="credit-edit-input"
                   class="w-full p-2.5 text-sm border border-gray-300 rounded box-border font-[Tahoma,sans-serif]"
                   value="${currentValue.replace(/"/g, '&quot;')}"
                   placeholder="Enter credit line text...">
            <div class="flex gap-2.5 mt-4 justify-end">
                <button id="credit-edit-cancel"
                        class="px-5 py-2.5 bg-gray-200 text-gray-700 border-none rounded cursor-pointer text-sm">
                    Cancel
                </button>
                <button id="credit-edit-submit"
                        class="px-5 py-2.5 text-white border-none rounded cursor-pointer text-sm font-bold"
                        style="background: ${CREDIT_COLOR}">
                    Save
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const input = document.getElementById('credit-edit-input');
    input.focus();
    input.select();

    const handleSave = () => {
        const newValue = input.value;
        if (newValue !== currentValue) {
            chartState.credits[index] = newValue;
            renderCredits();
        }
        overlay.remove();
    };

    const handleCancel = () => overlay.remove();

    document.getElementById('credit-edit-submit').addEventListener('click', handleSave);
    document.getElementById('credit-edit-cancel').addEventListener('click', handleCancel);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') handleCancel();
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) handleCancel();
    });
}

/**
 * Handle click events on the chart to detect credit clicks
 */
function handleChartClick(e) {
    if (isMobile()) return;

    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout) return;

    const paper = pixelToPaper(chartDiv, e.clientX, e.clientY);
    const creditIndex = getCreditAtPoint(chartDiv, paper.y);

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

    chartDiv.removeEventListener('click', handleChartClick);
    chartDiv.addEventListener('click', handleChartClick);
}

export function init() {}
