/**
 * Application Configuration
 */

// Series name constants (used as keys in chartState)
export const CORRECTS = 'corrects';
export const ERRORS = 'errors';
export const TIMING = 'timing';  // Series name identifier

// ============================================================================
// RESPONSIVE BREAKPOINTS
// ============================================================================
export const MOBILE_BREAKPOINT = 768;
export const MIN_DESKTOP_WIDTH = 900;
export const MIN_DESKTOP_HEIGHT = 500;

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
// LIMITS & THRESHOLDS
// ============================================================================
export const LIMITS = Object.freeze({
    MAX_MISC_SERIES: 10,
    MAX_TAB_NAME_LENGTH: 17,
    AUTO_AGG_THRESHOLD: 15,
    TEXT_INPUT_MAX_LENGTH: 50,
});

// Legacy export for backward compatibility during transition
export const AUTO_AGG_THRESHOLD = LIMITS.AUTO_AGG_THRESHOLD;

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