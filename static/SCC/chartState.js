/**
 * Chart State Management
 *
 * ES Module containing core state objects for the chart application.
 *
 * Defined in: static/chartState.js
 * Accessible from: Import this module in other scripts
 */

// ============================================================================
// Trace Configurations (Defaults - Read-only)
// ============================================================================

// Default configurations (frozen to prevent modification)
export const defaultCorrectTraceConfig = Object.freeze({
    seriesName: 'correct',
    showLine: true,
    lineWidth: 0.7,
    lineColor: 'black',
    markerSize: 8,
    markerSymbol: 'circle',
    markerFaceColor: 'black',
    markerEdgeColor: 'black'
});

export const defaultErrorTraceConfig = Object.freeze({
    seriesName: 'incorrect',
    showLine: true,
    lineWidth: 0.7,
    lineColor: 'black',
    markerColor: 'black',
    textSize: 20
});

export const defaultTimingTraceConfig = Object.freeze({
    seriesName: 'Timing',
    showLine: false,
    lineWidth: 0.7,
    lineColor: 'black',
    markerSize: 30,
    markerColor: 'black'
});

// ============================================================================
// Dynamic Misc Series Configuration
// ============================================================================

export const MAX_MISC_SERIES = 10;

// Color and symbol arrays for cycling through misc series appearances
export const MISC_COLORS = Object.freeze([
    '#FFA500', // orange
    '#FF0000', // red
    '#00AA00', // green
    '#0000FF', // blue
    '#FF00FF', // magenta
    '#00CCCC', // cyan
    '#800080', // purple
    '#008080', // teal
    '#FFD700', // gold
    '#8B4513'  // saddle brown
]);

export const MISC_SYMBOLS = Object.freeze([
    'square',
    'triangle-up',
    'diamond',
    'star',
    'hexagon',
    'pentagon',
    'cross',
    'triangle-down',
    'hexagon2',
    'octagon'
]);

/**
 * Create a default trace config for a misc series based on its index
 * @param {number} index - 0-based index for color/symbol cycling
 * @returns {Object} Trace configuration object
 */
export function createMiscTraceConfig(index) {
    return {
        seriesName: `Misc ${index + 1}`,
        showLine: true,
        lineWidth: 0.7,
        lineColor: 'black',
        markerSize: 8,
        markerSymbol: MISC_SYMBOLS[index % MISC_SYMBOLS.length],
        markerFaceColor: MISC_COLORS[index % MISC_COLORS.length],
        markerEdgeColor: 'black'
    };
}

// ============================================================================
// Line Styling Constants (Defaults - Read-only)
// ============================================================================

export const DEFAULT_PHASE_LINE_COLOR = 'black';
export const DEFAULT_PHASE_LINE_WIDTH = 2;
export const DEFAULT_AIM_LINE_COLOR = 'black';
export const DEFAULT_AIM_LINE_WIDTH = 2;

// Default legend configuration
export const DEFAULT_LEGEND_CONFIG = Object.freeze({
    x: 1,
    y: 1,
    xanchor: 'right',
    yanchor: 'top',
    bgcolor: 'rgba(255, 255, 255, 0.8)',
    bordercolor: 'black',
    borderwidth: 1,
    font: {
        size: 12,
        family: 'Arial',
        color: 'black'
    }
});

// ============================================================================
// Chart State (Combined Data & Metadata)
// ============================================================================

// Fake test data - 14 days of data starting from Sunday Jan 11, 2026
const TEST_DATA = (() => {
    const baseTimestamp = 1768089600; // Jan 11, 2026 00:00:00 UTC (Sunday)
    const dayInSeconds = 86400;
    const timestamps = [];
    const corrects = [];
    const errors = [];
    const timing = [];

    for (let i = 0; i < 14; i++) {
        timestamps.push(baseTimestamp + (i * dayInSeconds));
        corrects.push(Math.floor(20 + Math.random() * 80)); // 20-100
        errors.push(Math.floor(5 + Math.random() * 15));    // 5-20
        timing.push(Math.floor(1 + Math.random() * 10));    // 1-10 minutes
    }

    // Calculate startDate as Sunday before earliest timestamp
    const startDate = new Date(baseTimestamp * 1000);
    startDate.setHours(0, 0, 0, 0);

    return { timestamps, corrects, errors, timing, startDate };
})();

// Single state object for all chart data and configuration
// Note: exported as const, but object properties are mutable
export const chartState = {
    // Chart identity
    id: null,  // UUID assigned on first save

    // Raw data series (append-only arrays, all same length)
    series: {
        // X-axis values: either timestamps (converted to positions) or direct x-positions
        xValues: TEST_DATA.timestamps,
        corrects: TEST_DATA.corrects,
        errors: TEST_DATA.errors,
        timing: TEST_DATA.timing,
        misc: {}        // Dynamic misc series, keyed by ID (misc1, misc2, etc.)
    },

    // Chart identification
    chartType: 'Daily',
    minuteChart: true,
    chartName: 'Unnamed',
    hasTimestamps: true, // If true, xValues are timestamps that need conversion; if false, xValues are direct x-positions
    startDate: TEST_DATA.startDate, // The Sunday before/at earliest data point (only used when hasTimestamps is true)

    // Chart dimensions (NOT CURRENTLY IN USE - placeholder for future implementation)
    chartCapacity: 280, // Max X positions the chart can hold (Daily: 280, Weekly: 200, Monthly: 240, Yearly: 200)
    chartWindow: 140,   // Currently visible X range, selected based on screen size (always <= chartCapacity)

    // Legend configuration
    legend: {
        show: true, // Controls whether the custom legend is displayed
        position: 'top-right', // Position: 'top-right', 'top-left', 'bottom-right', 'bottom-left'
        config: { ...DEFAULT_LEGEND_CONFIG } // Legacy Plotly legend styling configuration (unused)
    },

    // Drawn lines (keyed by ID)
    LineCuts: {},
    PhaseLines: {},
    AimLines: {},
    CelLines: {},

    // Line visibility (by type)
    lineVisibility: {
        phase: true,
        aim: true,
        change: true,
        grid: true
    },

    // Celeration fan visibility
    fanVisible: true,

    // Line styling
    lineStyles: {
        phase: {
            color: DEFAULT_PHASE_LINE_COLOR,
            width: DEFAULT_PHASE_LINE_WIDTH
        },
        aim: {
            color: DEFAULT_AIM_LINE_COLOR,
            width: DEFAULT_AIM_LINE_WIDTH
        },
        trend: {
            correct: {
                color: 'green',
                width: 2,
            },
            incorrect: {
                color: 'red',
                width: 2,
            },
            timing: {
                color: 'orange',
                width: 2,
            },
            misc: {}    // Dynamic misc series trend styles, keyed by ID
        }
    },

    // Trace styling per series/aggregation
    traceStyles: {
        correct: {
            "raw": { ...defaultCorrectTraceConfig }
        },
        incorrect: {
            "raw": { ...defaultErrorTraceConfig }
        },
        timing: {
            "raw": { ...defaultTimingTraceConfig }
        },
        misc: {}    // Dynamic misc series trace styles, keyed by ID
    },

    // Credit information (two display rows)
    credits: {
        0: 'SUPERVISOR: ________________    PERFORMER: ________________       TIMER: ________________     COUNTED: ________________     ADVISOR: ________________',
        1: 'ORGANIZATION: ________________     MANAGER: ________________     COUNTER: ________________     CHARTER: ________________     ROOM: ________________'
    }
};

