/**
 * Application Configuration
 */

// Mirror of DEVELOPER_MODE in service-worker.js (SW scope is isolated)
export const DEVELOPER_MODE = true;

// Synced from config.py APP_VERSION by push_to_my_gitea.sh (same as SW_VERSION)
export const APP_VERSION = '0.4.11';

export const APP_NAME = 'Standard Change Chart';

// Series name constants (used as keys in chartState)
export const CORRECTS = 'corrects';
export const ERRORS = 'errors';
export const TIMING = 'timing';  // Series name identifier

// Missing-data sentinel — used in series arrays for "no observation"
export const MISSING = null;

// ============================================================================
// RESPONSIVE BREAKPOINTS
// ============================================================================
export const MOBILE_BREAKPOINT = 768;
export const MIN_DESKTOP_WIDTH = 900;
export const MIN_DESKTOP_HEIGHT = 500;

export function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
}

// ============================================================================
// TIMING CONSTANTS (milliseconds)
// ============================================================================
export const TIMING_MS = Object.freeze({
    RESIZE_DEBOUNCE: 100,
    CHART_WINDOW_DEBOUNCE: 150,
    LONG_PRESS_DURATION: 500,
    SWIPE_THRESHOLD: 100,          // pixels
    LONG_PRESS_MOVEMENT_THRESHOLD: 10,  // pixels
    INDICATOR_TIMEOUT: 5000,
    MENU_HINT_DELAY: 500,
    TOOLTIP_FADE_IN: 10,
    TOOLTIP_FADE_DURATION: 300,
    TOOLTIP_DISPLAY: 4000,
    TOAST_ANIMATION: 300,
    HEALTH_PING_INTERVAL: 60_000,
    HEALTH_PING_TIMEOUT: 5_000,
});

// ============================================================================
// COLORS
// ============================================================================
export const COLORS = Object.freeze({
    PRIMARY: '#6ad1e3',
    FAN: '#05c3de',
    FAN_HIGHLIGHT: 'rgba(5, 195, 222, 0.1)',

    // UI
    TEXT: '#374151',
    TEXT_HEADING: '#374151',
    BACKGROUND: 'white',
    BORDER_LIGHT: '#d1d5db',
    BUTTON_SECONDARY_BG: '#f3f4f6',
    BUTTON_SECONDARY_HOVER: '#e5e7eb',

    // Lines
    PHASE_LINE: 'black',
    AIM_LINE: 'black',
    ENTRY_INDICATOR: '#9333ea',

    // Trend lines
    TREND_CORRECTS: 'green',
    TREND_ERRORS: 'red',
    TREND_TIMING: 'orange',

    // Legend
    LEGEND_BG: 'rgba(255, 255, 255, 0.8)',
    LEGEND_BORDER: 'black',
});

// ============================================================================
// LAYOUT & SIZING
// ============================================================================
export const LAYOUT = Object.freeze({
    TOAST_GAP: 10,
    TOAST_EXPECTED_HEIGHT: 60,
    TOAST_BORDER_RADIUS: '8px',
    TOAST_PADDING: '12px 16px',
    TOAST_BORDER_WIDTH: '2px',
    BUTTON_BORDER_RADIUS: '6px',
    CROSSHAIR_FONT_SIZE: '13px',

    X_AXIS_MARGIN_OFFSET: 0.2,
    CHART_HEIGHT_MULTIPLIER: 0.98,
    CHART_PEEL_MULTIPLIER: 0.90,
});

// ============================================================================
// CHART MATH CONSTANTS
// ============================================================================
export const CHART_MATH = Object.freeze({
    ANGLE_DEGREES: 34,
    FLOOR_MULTIPLIER: 0.75,        // Below-floor placement
    ENTRY_INDICATOR_WIDTH: 3,
    ENTRY_INDICATOR_OPACITY: 0.25,
});

// ============================================================================
// CHART TYPE CONFIGURATION
// ============================================================================
// Single source of truth for chart-type-specific values.
// snapTo: pan increment (also used for snapping chartWindow)
// Window unit labels per chart type (for rolling window display)
export const WINDOW_UNITS = Object.freeze({
    Daily:                { abbrev: 'd', name: 'Day',      defaultWindow: 7 },
    Weekly:               { abbrev: 'w', name: 'Week',     defaultWindow: 5 },
    Monthly:              { abbrev: 'm', name: 'Month',    defaultWindow: 6 },
    Yearly:               { abbrev: 'y', name: 'Year',     defaultWindow: 5 },
    FrequencyCollections: { abbrev: 'x', name: 'Position', defaultWindow: 7 },
});

// snapInterval: snapping granularity during drag operations
// capacity: total x-axis range
// minXmax: minimum allowed window size
// unit: x-axis units per doubling (for celeration calculation)
// yMin/yMax: y-axis range
export const CHART_TYPE_CONFIG = Object.freeze({
    Daily: {
        yMin: 1 * 0.69,
        yMax: 1000000,
        unit: 7,
        snapTo: 14,
        snapInterval: 7,
        minXmax: 28,
        capacity: 280,
        creditMarginMultiplier: 0.13,
        creditRow0Y: 0.19,
        creditRowSpacing: 0.035,
        topMarginMultiplier: 0,
        fanMarginMinute: 0.10,
        fanMarginCount: 0.07,
        fanXOffsetMultiplier: 0.04,
        fanXOffsetMultiplierMinute: 0.2,
        fanYPosition: 1000,
        fanYPositionMinute: 0.01,
        fanLineLengthMultiplier: 0.13,
        fanLabelSizeMultiplier: 0.012,
        fanHeaderSizeMultiplier: 0.013,
        countingTimesXOffsetMultiplier: 0.06,
        yAxisTitleXOffsetMultiplier: 0.105,
        yAxisTitlePosition: 0.5,
        yAxisTitlePositionMinute: 0.7,
        annotations: {
            'date-text': { offsetMultiplier: 3.6, useGeneral: true, prefix: true },
            'week-count': { offsetMultiplier: 2.0833, useGeneral: true },
            'top_x_title': { offsetMultiplier: 4.5, useTitle: true, yDirection: 'above' },
            'bottom_x_title': { offsetMultiplier: 4.1666, useTitle: true, yDirection: 'below' }
        },
        shapes: {
            hasDateLine: true,
            dateLineOffsetMultiplier: 2.4305
        }
    },
    Weekly: {
        yMin: 0.001 * 0.69,
        yMax: 1000,
        unit: 5,
        snapTo: 5,
        snapInterval: 5,
        minXmax: 10,
        capacity: 200,
        creditMarginMultiplier: 0.13,
        creditRow0Y: 0.19,
        creditRowSpacing: 0.035,
        topMarginMultiplier: 0,
        fanMarginMinute: 0.10,
        fanMarginCount: 0.07,
        fanXOffsetMultiplier: 0.04,
        fanXOffsetMultiplierMinute: 0.2,
        fanYPosition: 1000,
        fanYPositionMinute: 0.01,
        fanLineLengthMultiplier: 0.13,
        fanLabelSizeMultiplier: 0.012,
        fanHeaderSizeMultiplier: 0.013,
        countingTimesXOffsetMultiplier: 0.06,
        yAxisTitleXOffsetMultiplier: 0.09,
        yAxisTitlePosition: 0.5,
        yAxisTitlePositionMinute: 0.7,
        annotations: {
            'month-label': { offsetMultiplier: 2.8, useGeneral: true, fontScale: 0.85, prefix: true },
            'month-count': { offsetMultiplier: 5, useGeneral: true },
            'top_x_title': { offsetMultiplier: 5.5, useTitle: true, yDirection: 'above' },
            'bottom_x_title': { offsetMultiplier: 4.44, useTitle: true, yDirection: 'below' }
        },
        shapes: {
            hasTopXTick: true,
            topXTickMultiplier: 3
        }
    },
    Monthly: {
        yMin: 0.001 * 0.69,
        yMax: 1000,
        unit: 6,
        snapTo: 12,
        snapInterval: 6,
        minXmax: 24,
        capacity: 240,
        creditMarginMultiplier: 0.15,
        creditRow0Y: 0.19,
        creditRowSpacing: 0.035,
        topMarginMultiplier: 0,
        fanMarginMinute: 0.15,
        fanMarginCount: 0.07,
        fanXOffsetMultiplier: 0.04,
        fanXOffsetMultiplierMinute: 0.2,
        fanYPosition: 1000,
        fanYPositionMinute: 0.01,
        fanLineLengthMultiplier: 0.13,
        fanLabelSizeMultiplier: 0.012,
        fanHeaderSizeMultiplier: 0.013,
        countingTimesXOffsetMultiplier: 0.06,
        yAxisTitleXOffsetMultiplier: 0.09,
        yAxisTitlePosition: 0.5,
        yAxisTitlePositionMinute: 0.7,
        annotations: {
            'year-label': { offsetMultiplier: 3, useGeneral: true, fontScale: 1.5, prefix: true },
            'year-count': { offsetMultiplier: 5.2, useGeneral: true },
            'top_x_title': { offsetMultiplier: 5.5, useTitle: true, yDirection: 'above' },
            'bottom_x_title': { offsetMultiplier: 4.44, useTitle: true, yDirection: 'below' }
        },
        shapes: {
            hasTopXTick: true,
            topXTickMultiplier: 3.3
        }
    },
    Yearly: {
        yMin: 0.001 * 0.69,
        yMax: 1000,
        unit: 5,
        snapTo: 10,
        snapInterval: 5,
        minXmax: 20,
        capacity: 200,
        creditMarginMultiplier: 0.15,
        creditRow0Y: 0.19,
        creditRowSpacing: 0.035,
        topMarginMultiplier: 0,
        fanMarginMinute: 0.10,
        fanMarginCount: 0.07,
        fanXOffsetMultiplier: 0.04,
        fanXOffsetMultiplierMinute: 0.2,
        fanYPosition: 1000,
        fanYPositionMinute: 0.01,
        fanLineLengthMultiplier: 0.13,
        fanLabelSizeMultiplier: 0.012,
        fanHeaderSizeMultiplier: 0.013,
        countingTimesXOffsetMultiplier: 0.06,
        yAxisTitleXOffsetMultiplier: 0.09,
        yAxisTitlePosition: 0.5,
        yAxisTitlePositionMinute: 0.7,
        annotations: {
            'year-label': { offsetMultiplier: 3, useGeneral: true, fontScale: 1, prefix: true },
            'decade-count': { offsetMultiplier: 4.7, useGeneral: true, fontScale: 1 },
            'top_x_title': { offsetMultiplier: 5, useTitle: true, yDirection: 'above' },
            'bottom_x_title': { offsetMultiplier: 4.44, useTitle: true, yDirection: 'below' }
        },
        shapes: {
            hasTopXTick: true,
            topXTickFullMultiplier: 1.4,
            topXTickHalfMultiplier: 0.8,
            useDecadeTicks: true
        }
    },
    FrequencyCollections: {
        yMin: 0.001 * 0.69,
        yMax: 1000,
        unit: 7,
        snapTo: 7,
        snapInterval: 7,
        minXmax: 42,
        capacity: 280,
        creditMarginMultiplier: 0.10,
        creditRow0Y: 0.19,
        creditRowSpacing: 0.035,
        topMarginMultiplier: 0,
        fanMarginMinute: 0.10,
        fanMarginCount: 0.07,
        fanXOffsetMultiplier: 0.04,
        fanXOffsetMultiplierMinute: 0.04,
        fanYPosition: 1000,
        fanYPositionMinute: 0.01,
        fanLineLengthMultiplier: 0.13,
        fanLabelSizeMultiplier: 0.012,
        fanHeaderSizeMultiplier: 0.013,
        countingTimesXOffsetMultiplier: 0.06,
        yAxisTitleXOffsetMultiplier: 0.09,
        yAxisTitlePosition: 0.5,
        yAxisTitlePositionMinute: 0.7,
        annotations: {
            'blank-line': { offsetMultiplier: 3.05, useGeneral: true, fontScale: 0.75, prefix: true, yDirection: 'below' },
            'counted-label': { offsetMultiplier: 4.79, useGeneral: true, fontScale: 0.75, prefix: true, yDirection: 'below' },
            'chart_title': { fontScale: 1.2, useTitle: true, skipPosition: true }
        },
        shapes: {
            noRightYTick: true
        }
    },
});

// ============================================================================
// RESIZE SCALING CONSTANTS
// ============================================================================
export const RESIZE = Object.freeze({
    GENERAL_FONT_SCALE: 0.017,
    TITLE_FONT_SCALE: 0.025,
    X_TICKS_DOWN: 36,
    Y_TICK_LENGTH_PX: 6,
    TICK_FONT_SCALE: 1.5,
    DATE_LINE_LEN_SCALE: 0.8,
    CREDIT_FONT_SCALE: 0.014,
});

// ============================================================================
// LIMITS & THRESHOLDS
// ============================================================================
export const LIMITS = Object.freeze({
    MAX_MISC_SERIES: 10,
    MAX_TAB_NAME_LENGTH: 17,
    AUTO_AGG_THRESHOLD: 10,
    TEXT_INPUT_MAX_LENGTH: 50,
});


// ============================================================================
// LINE DEFAULTS
// ============================================================================
export const LINE_DEFAULTS = Object.freeze({
    PHASE_WIDTH: 2,
    AIM_WIDTH: 2,
    TREND_WIDTH: 2,
    TRACE_LINE_WIDTH: 0.7,
});

// ============================================================================
// FONTS
// ============================================================================
export const FONTS = Object.freeze({
    PRIMARY: '"Open Sans", sans-serif',
});

export const FONT_SIZES = Object.freeze({
    TOAST: 14,
    LEGEND: 12,
});

// ============================================================================
// STANDARDIZED TRACE CONFIG PROPERTY NAMES
// ============================================================================
// All series use these same property names. Trace creation functions
// interpret them appropriately (e.g., markerSize becomes textfont.size
// for text-based series like ERRORS/TIMING).

export const TRACE_PROP = Object.freeze({
    SERIES_NAME: 'seriesName',
    SHOW_LINE: 'showLine',
    LINE_WIDTH: 'lineWidth',
    LINE_COLOR: 'lineColor',
    MARKER_SIZE: 'markerSize',      // Size of marker or text
    MARKER_COLOR: 'markerColor',    // Primary color (fill for markers, color for text)
    MARKER_EDGE_COLOR: 'markerEdgeColor',  // Outline color (markers only)
    MARKER_SYMBOL: 'markerSymbol'   // Shape (markers only)
});

// ============================================================================
// DEFAULT TRACE CONFIGURATIONS
// ============================================================================
// All configs use standardized property names from TRACE_PROP above

export const defaultCorrectTraceConfig = Object.freeze({
    seriesName: 'correct',
    showLine: true,
    lineDash: 'solid',
    lineWidth: LINE_DEFAULTS.TRACE_LINE_WIDTH,
    lineColor: 'black',
    markerSize: 8,
    markerSymbol: 'circle',
    markerColor: 'black',
    markerEdgeColor: 'black',
    onXAgg: 'raw',
    acrossXAgg: null
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
    markerEdgeColor: 'black',
    onXAgg: 'raw',
    acrossXAgg: null
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
    markerEdgeColor: 'black',
    onXAgg: 'raw',
    acrossXAgg: null
});

// ============================================================================
// MISC SERIES CONFIGURATION
// ============================================================================

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
        markerEdgeColor: 'black',
        onXAgg: 'raw',
        acrossXAgg: null
    };
}

// ============================================================================
// LINE DASH OPTIONS (for editor modals)
// ============================================================================
export const DASH_OPTIONS = Object.freeze([
    { value: 'solid', label: 'Solid' },
    { value: 'dash', label: 'Dash' },
    { value: 'dot', label: 'Dot' },
    { value: 'dashdot', label: 'Dash-Dot' },
    { value: 'longdash', label: 'Long Dash' },
    { value: 'longdashdot', label: 'Long Dash-Dot' }
]);

// ============================================================================
// DEFAULT LEGEND CONFIGURATION
// ============================================================================

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
// DONATION CONFIG
// ============================================================================
export const DONATE = Object.freeze({
    PAYPAL_URL: 'https://paypal.me/devpigeon',
    BTC_ADDRESS: 'bc1qpkwvqspkxhgh6k73zfgep2ahdn2ssd7rk5j4x8',
    LIGHTNING_ADDRESS: 'pigeon@getalby.com',
});