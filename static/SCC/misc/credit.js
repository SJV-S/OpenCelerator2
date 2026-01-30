// credit.js
// Renders credit lines in the chart's bottom margin and handles editing

import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';

const CREDIT_COLOR = '#05c3de';
const MOBILE_BREAKPOINT = 768;
const MAX_CREDIT_LENGTH = 160;

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

    // Scale font based on chart height (matches resize-chart.js generalFontScale)
    const fontSize = layout.height * 0.014;

    // Calculate margin edge in paper coords (y=0 is plot bottom, negative goes into margin)
    // marginEdge is the bottom of the margin in paper coordinates
    const marginEdge = -layout.margin.b / plotHeight;

    // Position credits as percentage above the margin edge
    const creditPositions = [
        { y: marginEdge * 0.80 },   // Credit line 0
        { y: marginEdge * 0.65 }    // Credit line 1
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
    const credit0Y = marginEdge * 0.80;
    const credit1Y = marginEdge * 0.65;
    const hitRadius = Math.abs(marginEdge) * 0.15;

    if (paperY >= credit0Y - hitRadius && paperY <= credit0Y + hitRadius) return 0;
    if (paperY >= credit1Y - hitRadius && paperY <= credit1Y + hitRadius) return 1;
    return -1;
}

/**
 * Open modal dialog for editing credit lines
 */
function openCreditEditDialog() {
    const existing = document.getElementById('credit-edit-dialog');
    if (existing) existing.remove();

    const line0 = chartState.credits?.[0] || '';
    const line1 = chartState.credits?.[1] || '';

    const overlay = document.createElement('div');
    overlay.id = 'credit-edit-dialog';
    overlay.className = 'fixed inset-0 bg-black/50 flex justify-center items-center z-[10000]';

    overlay.innerHTML = `
        <div class="bg-white p-4 rounded-lg shadow-xl w-[98%] max-w-[1200px]" style="border: 2px solid ${CREDIT_COLOR}">
            <h3 class="m-0 mb-3 text-sm font-bold" style="color: ${CREDIT_COLOR}">Edit Credits</h3>
            <div class="flex flex-col gap-2">
                <input type="text" id="credit-input-0"
                       class="w-full p-1.5 text-xs border border-gray-300 rounded font-mono"
                       maxlength="${MAX_CREDIT_LENGTH}"
                       value="${line0.replace(/"/g, '&quot;')}">
                <input type="text" id="credit-input-1"
                       class="w-full p-1.5 text-xs border border-gray-300 rounded font-mono"
                       maxlength="${MAX_CREDIT_LENGTH}"
                       value="${line1.replace(/"/g, '&quot;')}">
            </div>
            <div class="flex gap-3 mt-4 justify-end">
                <button id="credit-edit-cancel"
                        class="px-3 py-1.5 bg-gray-200 text-gray-700 rounded cursor-pointer text-xs hover:bg-gray-300">
                    Cancel
                </button>
                <button id="credit-edit-save"
                        class="px-3 py-1.5 text-white rounded cursor-pointer text-xs font-bold hover:opacity-90"
                        style="background: ${CREDIT_COLOR}">
                    Save
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('credit-input-0').focus();

    const handleSave = () => {
        chartState.credits[0] = document.getElementById('credit-input-0').value;
        chartState.credits[1] = document.getElementById('credit-input-1').value;
        renderCredits();
        overlay.remove();
    };

    const handleCancel = () => overlay.remove();

    document.getElementById('credit-edit-save').addEventListener('click', handleSave);
    document.getElementById('credit-edit-cancel').addEventListener('click', handleCancel);
    overlay.addEventListener('keydown', (e) => {
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
        openCreditEditDialog();
    }
}

let currentHoveredCredit = -1;
let creditTooltip = null;

/**
 * Show/hide credit tooltip
 */
function updateCreditTooltip(show, x, y) {
    if (show) {
        if (!creditTooltip) {
            creditTooltip = document.createElement('div');
            creditTooltip.className = 'fixed px-2 py-1 text-xs rounded pointer-events-none z-[9999]';
            creditTooltip.style.cssText = `background: ${CREDIT_COLOR}; color: white;`;
            creditTooltip.textContent = 'Click to modify';
            document.body.appendChild(creditTooltip);
        }
        creditTooltip.style.left = `${x + 10}px`;
        creditTooltip.style.top = `${y + 10}px`;
        creditTooltip.style.display = 'block';
    } else if (creditTooltip) {
        creditTooltip.style.display = 'none';
    }
}

/**
 * Handle mouse move to show hover effect on credit lines
 */
function handleChartMouseMove(e) {
    if (isMobile()) return;

    const chartDiv = document.getElementById('chart');
    if (!chartDiv?.layout) return;

    const paper = pixelToPaper(chartDiv, e.clientX, e.clientY);
    const creditIndex = getCreditAtPoint(chartDiv, paper.y);

    if (creditIndex >= 0) {
        chartDiv.style.cursor = 'pointer';
        updateCreditTooltip(true, e.clientX, e.clientY);
    } else {
        chartDiv.style.cursor = '';
        updateCreditTooltip(false);
    }

    // Update highlight if hover state changed
    if (creditIndex !== currentHoveredCredit) {
        currentHoveredCredit = creditIndex;
        updateCreditHighlight(chartDiv, creditIndex);
    }
}

/**
 * Update credit annotation highlight - subtle background rectangle on hover
 */
function updateCreditHighlight(chartDiv, hoveredIndex) {
    const isHovered = hoveredIndex >= 0;
    const updates = {};

    (chartDiv.layout.annotations || []).forEach((ann, i) => {
        if (ann.name === 'credit-line-0' || ann.name === 'credit-line-1') {
            updates[`annotations[${i}].bgcolor`] = isHovered ? 'rgba(5, 195, 222, 0.1)' : 'rgba(0,0,0,0)';
            updates[`annotations[${i}].borderpad`] = isHovered ? 3 : 0;
        }
    });

    if (Object.keys(updates).length > 0) {
        Plotly.relayout(chartDiv, updates);
    }
}

/**
 * Initialize click handler for credit editing
 */
export function initCreditClick() {
    const chartDiv = document.getElementById('chart');
    if (!chartDiv) return;

    chartDiv.removeEventListener('click', handleChartClick);
    chartDiv.removeEventListener('mousemove', handleChartMouseMove);
    chartDiv.addEventListener('click', handleChartClick);
    chartDiv.addEventListener('mousemove', handleChartMouseMove);
}

export function init() {
    // Subscribe to credits updated event
    eventBus.subscribe(EVENTS.CREDITS_UPDATED, () => {
        renderCredits();
    }, true);
}
