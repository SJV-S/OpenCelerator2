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

export const defaultMiscOneTraceConfig = Object.freeze({
    seriesName: 'MiscOne',
    showLine: true,
    lineWidth: 0.7,
    lineColor: 'black',
    markerSize: 8,
    markerSymbol: 'square',
    markerFaceColor: 'orange',
    markerEdgeColor: 'black'
});

export const defaultMiscTwoTraceConfig = Object.freeze({
    seriesName: 'MiscTwo',
    showLine: true,
    lineWidth: 0.7,
    lineColor: 'black',
    markerSize: 8,
    markerSymbol: 'triangle-up',
    markerFaceColor: 'red',
    markerEdgeColor: 'black'
});

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
    const baseTimestamp = 1736553600; // Jan 11, 2026 00:00:00 UTC (Sunday)
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
    // Raw data series (append-only arrays, all same length)
    series: {
        timestamps: TEST_DATA.timestamps,
        corrects: TEST_DATA.corrects,
        errors: TEST_DATA.errors,
        timing: TEST_DATA.timing,
        misc1: [],      // Y values for misc1
        misc2: []       // Y values for misc2
    },

    // Chart identification
    chartType: 'Daily',
    minuteChart: true,
    chartName: 'Unnamed',
    startDate: TEST_DATA.startDate, // The Sunday before/at earliest data point

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
            misc1: {
                color: 'orange',
                width: 2,
            },
            misc2: {
                color: 'orange',
                width: 2,
            }
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
        misc1: {
            "raw": { ...defaultMiscOneTraceConfig }
        },
        misc2: {
            "raw": { ...defaultMiscTwoTraceConfig }
        }
    },

    // Credit information
    credits: {
        supervisor: '',
        performer: '',
        timer: '',
        counted: '',
        advisor: '',
        organization: '',
        manager: '',
        counter: '',
        charter: '',
        room: '',
        notes: ''
    }
};

