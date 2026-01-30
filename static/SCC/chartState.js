/**
 * Chart State Management
 *
 * ES Module containing core state objects for the chart application.
 *
 * Defined in: static/chartState.js
 * Accessible from: Import this module in other scripts
 */

import { CORRECTS, ERRORS, TIMING } from './config.js';

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

// Single state object for all chart data and configuration
// Note: exported as const, but object properties are mutable
export const chartState = {
    // Chart identity
    id: null,  // UUID assigned on first save

    // Raw data series (append-only arrays, all same length)
    series: {
        // X-axis values: either timestamps (converted to positions) or direct x-positions
        xValues: [],
        corrects: [],
        errors: [],
        timing: [],
        misc: {}        // Dynamic misc series, keyed by ID (misc1, misc2, etc.)
    },

    // Chart identification
    chartType: 'Daily',
    minuteChart: true,
    chartName: 'Unnamed',
    tags: [],  // User-defined tags for organizing charts (stored lowercase for case-insensitive matching)
    hasTimestamps: true, // If true, xValues are timestamps that need conversion; if false, xValues are direct x-positions
    startDate: null, // The Monday before/at earliest data point (set on import or first data entry)

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
    CelLines: {
        // Default settings for new celeration lines
        settings: {
            fitMethod: 'Theil-Sen',      // 'Theil-Sen', 'Least-squares', 'Quarter-intersect', 'Split-middle-line', 'Mean', 'Median'
            bounceEnvelope: 'None',      // 'None', '5-95 percentile', 'Interquartile range', 'Standard deviation', '90% confidence interval'
            forecast: 0                  // Number of days/units to project forward beyond data range
        }
        // Individual lines are stored by ID: { [lineId]: metadata, ... }
    },

    // Line visibility (by type)
    lineVisibility: {
        phase: true,
        aim: true,
        change: true,
        grid: true
    },

    // Celeration fan visibility
    fanVisible: true,

    // Zero handling: when true, zeros are placed below floor; when false, zeros become NaN (not rendered)
    placeZerosBelowFloor: true,

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
            [CORRECTS]: {
                color: 'green',
                width: 2,
            },
            [ERRORS]: {
                color: 'red',
                width: 2,
            },
            [TIMING]: {
                color: 'orange',
                width: 2,
            },
            misc: {}    // Dynamic misc series trend styles, keyed by ID
        }
    },

    // Trace styling per series/aggregation
    traceStyles: {
        [CORRECTS]: {
            "raw": { ...defaultCorrectTraceConfig }
        },
        [ERRORS]: {
            "raw": { ...defaultErrorTraceConfig }
        },
        [TIMING]: {
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

