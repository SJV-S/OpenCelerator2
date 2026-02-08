/**
 * Chart State Management
 *
 * ES Module containing core state objects for the chart application.
 *
 * Defined in: static/chartState.js
 * Accessible from: Import this module in other scripts
 */

import {
    CORRECTS, ERRORS, TIMING,
    COLORS, LINE_DEFAULTS,
    defaultCorrectTraceConfig, defaultErrorTraceConfig, defaultTimingTraceConfig,
    DEFAULT_LEGEND_CONFIG
} from './config.js';

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
    chartWindow: 140,   // Currently visible X range (always <= chartCapacity, defaults to capacity / 2)

    // Container height in px (null = use flex layout default; width is derived from height)
    containerHeight: null,

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
        grid: { dateLines: false, countLines: false, minorGrid: false }
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
            color: COLORS.PHASE_LINE,
            width: LINE_DEFAULTS.PHASE_WIDTH
        },
        aim: {
            color: COLORS.AIM_LINE,
            width: LINE_DEFAULTS.AIM_WIDTH
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
