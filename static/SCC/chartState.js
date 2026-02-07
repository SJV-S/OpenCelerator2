/**
 * Chart State Management
 *
 * ES Module containing core state objects for the chart application.
 *
 * Defined in: static/chartState.js
 * Accessible from: Import this module in other scripts
 */

import { CORRECTS, ERRORS, TIMING, COLORS, LINE_DEFAULTS, LIMITS, FONT_SIZES } from './config.js';

// ============================================================================
// Trace Configurations (Defaults - Read-only)
// ============================================================================

// Default configurations (frozen to prevent modification)
// All configs use standardized property names from TRACE_PROP in config.js
export const defaultCorrectTraceConfig = Object.freeze({
    seriesName: 'correct',
    showLine: true,
    lineDash: 'solid',
    lineWidth: LINE_DEFAULTS.TRACE_LINE_WIDTH,
    lineColor: 'black',
    markerSize: 8,
    markerSymbol: 'circle',
    markerColor: 'black',
    markerEdgeColor: 'black'
});

export const defaultErrorTraceConfig = Object.freeze({
    seriesName: 'incorrect',
    showLine: true,
    lineDash: 'solid',
    lineWidth: LINE_DEFAULTS.TRACE_LINE_WIDTH,
    lineColor: 'black',
    markerSize: 20,
    markerSymbol: 'x',
    markerColor: 'black',
    markerEdgeColor: 'black'
});

export const defaultTimingTraceConfig = Object.freeze({
    seriesName: 'Timing',
    showLine: false,
    lineDash: 'solid',
    lineWidth: LINE_DEFAULTS.TRACE_LINE_WIDTH,
    lineColor: 'black',
    markerSize: 30,
    markerSymbol: '-',
    markerColor: 'black',
    markerEdgeColor: 'black'
});

// ============================================================================
// Dynamic Misc Series Configuration
// ============================================================================

export const MAX_MISC_SERIES = LIMITS.MAX_MISC_SERIES;

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
        lineDash: 'solid',
        lineWidth: LINE_DEFAULTS.TRACE_LINE_WIDTH,
        lineColor: 'black',
        markerSize: 8,
        markerSymbol: MISC_SYMBOLS[index % MISC_SYMBOLS.length],
        markerColor: MISC_COLORS[index % MISC_COLORS.length],
        markerEdgeColor: 'black'
    };
}

// ============================================================================
// Line Styling Constants (from config.js)
// ============================================================================

export const DEFAULT_PHASE_LINE_COLOR = COLORS.PHASE_LINE;
export const DEFAULT_PHASE_LINE_WIDTH = LINE_DEFAULTS.PHASE_WIDTH;
export const DEFAULT_AIM_LINE_COLOR = COLORS.AIM_LINE;
export const DEFAULT_AIM_LINE_WIDTH = LINE_DEFAULTS.AIM_WIDTH;

// Default legend configuration
export const DEFAULT_LEGEND_CONFIG = Object.freeze({
    x: 1,
    y: 1,
    xanchor: 'right',
    yanchor: 'top',
    bgcolor: COLORS.LEGEND_BG,
    bordercolor: COLORS.LEGEND_BORDER,
    borderwidth: 1,
    font: {
        size: FONT_SIZES.LEGEND,
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
    chartKey: null,  // Encryption key for this chart (hex string)
    shared: false,  // If true, this chart syncs with server
    lastModified: null,  // Unix timestamp of last modification

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
        grid: false
    },

    // Series visibility (by unique key, e.g. "corrects_raw": true/false)
    seriesVisibility: {},

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
                color: COLORS.TREND_CORRECTS,
                width: LINE_DEFAULTS.TREND_WIDTH,
            },
            [ERRORS]: {
                color: COLORS.TREND_ERRORS,
                width: LINE_DEFAULTS.TREND_WIDTH,
            },
            [TIMING]: {
                color: COLORS.TREND_TIMING,
                width: LINE_DEFAULTS.TREND_WIDTH,
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

