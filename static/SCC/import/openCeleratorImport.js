/**
 * OpenCelerator Import Module
 *
 * Converts OpenCelerator JSON export files to complete TC2 chart objects
 * ready for storage. Single entry point: buildChartFromOpenCelerator()
 *
 * What IS converted:
 *   - Raw data (dates, corrects, incorrects, timing/minutes, misc/other columns)
 *   - Series names and styles from column_map / data_point_styles
 *   - Credit lines
 *   - Start date (Monday before earliest data)
 *
 * Limitations (warnings issued):
 *   - Phase lines, aim lines, trend/celeration lines: not imported
 *   - Slice-specific styling (date ranges): only universal styles imported
 */

import {
    CORRECTS, ERRORS, TIMING, COLORS, LINE_DEFAULTS,
    createMiscTraceConfig, MISC_COLORS,
    defaultCorrectTraceConfig, defaultErrorTraceConfig, defaultTimingTraceConfig
} from '../config.js';

// ============================================================================
// Marker Symbol Mapping (matplotlib -> Plotly)
// ============================================================================

const MARKER_MAP = {
    'o': 'circle',
    's': 'square',
    'v': 'triangle-down',
    '^': 'triangle-up',
    '<': 'triangle-left',
    '>': 'triangle-right',
    'd': 'diamond',
    'D': 'diamond',
    'p': 'pentagon',
    'h': 'hexagon',
    'H': 'hexagon2',
    '8': 'octagon',
    '*': 'star',
    '+': 'cross',
    'x': 'x',
    'X': 'x',
    '_': 'line-ew',      // Horizontal line (timing floor marker)
    '|': 'line-ns',      // Vertical line
};

/**
 * Convert matplotlib marker to Plotly marker symbol
 */
function convertMarker(mplMarker) {
    if (!mplMarker) return null;
    return MARKER_MAP[mplMarker] || mplMarker;
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Check if a parsed JSON object is an OpenCelerator export
 * @param {object} json - Parsed JSON object
 * @returns {boolean}
 */
export function isOpenCeleratorFormat(json) {
    if (!json || typeof json !== 'object') {
        return false;
    }

    const hasColumnMap = json.column_map && typeof json.column_map === 'object';
    const hasRawData = json.raw_data && typeof json.raw_data === 'object';
    const hasType = typeof json.type === 'string';
    const hasDateColumn = hasColumnMap && 'd' in json.column_map;
    const hasDateData = hasRawData && Array.isArray(json.raw_data.d);

    return hasColumnMap && hasRawData && hasType && hasDateColumn && hasDateData;
}

// ============================================================================
// Style Extraction
// ============================================================================

/**
 * Extract universal styles ("none, none, ...") from OpenCelerator data_point_styles
 * @param {object} dataPointStyles - OpenCelerator data_point_styles object
 * @param {string} userColName - The user column name (e.g., "Bitcoin", "Corrects")
 * @returns {object} Style object with TC2-compatible properties
 */
function extractUniversalStyles(dataPointStyles, userColName) {
    if (!dataPointStyles || !userColName || !dataPointStyles[userColName]) {
        return {};
    }

    const styleRules = dataPointStyles[userColName];
    const extractedStyles = {};

    for (const rule of styleRules) {
        for (const [key, value] of Object.entries(rule)) {
            // Only process "none, none, ..." rules (universal styles)
            if (key.startsWith('none, none, ')) {
                const styleType = key.replace('none, none, ', '');

                switch (styleType) {
                    case 'face_colors':
                        extractedStyles.markerColor = value;
                        break;
                    case 'edge_colors':
                        extractedStyles.markerEdgeColor = value;
                        break;
                    case 'markers':
                        extractedStyles.markerSymbol = convertMarker(value);
                        break;
                    case 'marker_sizes':
                        extractedStyles.markerSize = value;
                        break;
                    case 'line_styles':
                        // Empty string means no line
                        extractedStyles.showLine = value !== '';
                        break;
                    case 'line_colors':
                        extractedStyles.lineColor = value;
                        break;
                    case 'line_width':
                        extractedStyles.lineWidth = value;
                        break;
                }
            }
        }
    }

    return extractedStyles;
}

// ============================================================================
// Conversion
// ============================================================================

/**
 * Convert OpenCelerator JSON to TC2 chartState-compatible data
 * @param {object} json - OpenCelerator JSON object
 * @returns {{success: boolean, data: object|null, warnings: string[], error: string|null}}
 */
function convertOpenCeleratorToTC2(json) {
    const warnings = [];

    try {
        if (!isOpenCeleratorFormat(json)) {
            return {
                success: false,
                data: null,
                warnings: [],
                error: 'Not a valid OpenCelerator format'
            };
        }

        const rawData = json.raw_data;
        const columnMap = json.column_map;
        const dataPointStyles = json.data_point_styles || {};

        // OpenCelerator's place_below_floor setting: when false, zeros mean "no data"
        const placeZerosBelowFloor = json.place_below_floor !== false;

        // Convert dates to timestamps
        const dates = rawData.d || [];
        const timestamps = dates.map(dateStr => parseDateToTimestamp(dateStr));

        const validTimestamps = timestamps.filter(t => t !== null);
        if (validTimestamps.length === 0) {
            return {
                success: false,
                data: null,
                warnings: [],
                error: 'No valid dates found in data'
            };
        }

        // Build series data
        const series = {
            xValues: [],
            corrects: [],
            errors: [],
            timing: [],
            misc: {}
        };

        // Collect misc column IDs (o0, o1, o2, etc.)
        const miscColumns = Object.keys(columnMap)
            .filter(key => key.startsWith('o'))
            .sort((a, b) => {
                const numA = parseInt(a.substring(1), 10);
                const numB = parseInt(b.substring(1), 10);
                return numA - numB;
            });

        // Initialize misc arrays
        miscColumns.forEach((ocCol, idx) => {
            const miscId = `misc${idx + 1}`;
            series.misc[miscId] = [];
        });

        // Process each data point
        for (let i = 0; i < dates.length; i++) {
            const timestamp = timestamps[i];
            if (timestamp === null) {
                continue;
            }

            series.xValues.push(timestamp);

            const correctVal = rawData.c ? cleanNumericValue(rawData.c[i]) : NaN;
            series.corrects.push(correctVal);

            const errorVal = rawData.i ? cleanNumericValue(rawData.i[i]) : NaN;
            series.errors.push(errorVal);

            const timingVal = rawData.m ? (cleanNumericValue(rawData.m[i]) || 1) : 1;
            series.timing.push(timingVal);

            miscColumns.forEach((ocCol, idx) => {
                const miscId = `misc${idx + 1}`;
                const miscVal = rawData[ocCol] ? cleanNumericValue(rawData[ocCol][i]) : NaN;
                series.misc[miscId].push(miscVal);
            });
        }

        if (series.xValues.length === 0) {
            return {
                success: false,
                data: null,
                warnings,
                error: 'No valid data rows found'
            };
        }

        // Check we have some data
        const hasCorrects = series.corrects.some(v => !isNaN(v));
        const hasErrors = series.errors.some(v => !isNaN(v));
        const hasMisc = Object.values(series.misc).some(arr => arr.some(v => !isNaN(v)));

        if (!hasCorrects && !hasErrors && !hasMisc) {
            return {
                success: false,
                data: null,
                warnings,
                error: 'No count data found (corrects, incorrects, or misc columns)'
            };
        }

        // Parse credits
        const credits = parseCredits(json.credit);

        // Build column name and style mappings
        const columnNames = {
            corrects: columnMap.c || null,
            errors: columnMap.i || null,
            timing: columnMap.m || null,
            misc: {}
        };

        const columnStyles = {
            corrects: columnMap.c ? extractUniversalStyles(dataPointStyles, columnMap.c) : {},
            errors: columnMap.i ? extractUniversalStyles(dataPointStyles, columnMap.i) : {},
            misc: {}
        };

        miscColumns.forEach((ocCol, idx) => {
            const miscId = `misc${idx + 1}`;
            const userColName = columnMap[ocCol];
            columnNames.misc[miscId] = userColName;
            columnStyles.misc[miscId] = extractUniversalStyles(dataPointStyles, userColName);
        });

        // Count skipped features for warnings
        const skippedPhaseLines = (json.phase || []).length;
        const skippedAimLines = (json.aim || []).length;
        const skippedTrendLines = (json.trend_corr || []).length +
                                  (json.trend_err || []).length +
                                  (json.trend_misc || []).length;

        if (skippedPhaseLines > 0) {
            warnings.push(`${skippedPhaseLines} phase line(s) not imported (not supported)`);
        }
        if (skippedAimLines > 0) {
            warnings.push(`${skippedAimLines} aim line(s) not imported (not supported)`);
        }
        if (skippedTrendLines > 0) {
            warnings.push(`${skippedTrendLines} trend line(s) not imported (not supported)`);
        }

        return {
            success: true,
            data: {
                series,
                credits,
                columnNames,
                columnStyles,
                hasCorrects,
                hasErrors,
                placeZerosBelowFloor
            },
            warnings,
            error: null
        };

    } catch (err) {
        return {
            success: false,
            data: null,
            warnings,
            error: `Conversion error: ${err.message}`
        };
    }
}

// ============================================================================
// Chart Type Detection
// ============================================================================

/**
 * Detect TC2 chart type from OpenCelerator's type string
 * @param {string} ocType - OpenCelerator type field (e.g., "daily", "Weekly", etc.)
 * @returns {string} TC2 chart type
 */
function detectChartType(ocType) {
    if (!ocType || typeof ocType !== 'string') return 'Daily';

    const lower = ocType.toLowerCase();
    if (lower.includes('weekly')) return 'Weekly';
    if (lower.includes('monthly')) return 'Monthly';
    if (lower.includes('yearly')) return 'Yearly';
    return 'Daily';
}

// ============================================================================
// Build Complete Chart Object
// ============================================================================

/**
 * Convert OpenCelerator JSON to a complete chart object ready for storage.
 * Single entry point — handles conversion, style mapping, and startDate.
 *
 * @param {object} json - Parsed OpenCelerator JSON
 * @param {string} fileName - Original filename (used for chart name)
 * @returns {{success: boolean, chartData: object|null, warnings: string[], error: string|null}}
 */
export function buildChartFromOpenCelerator(json, fileName) {
    const conversion = convertOpenCeleratorToTC2(json);
    if (!conversion.success) {
        return { success: false, chartData: null, warnings: conversion.warnings, error: conversion.error };
    }

    const { series, credits, columnNames, columnStyles, hasCorrects, hasErrors, placeZerosBelowFloor } = conversion.data;

    // Build traceStyles with defaults + imported overrides
    const correctsRaw = { ...defaultCorrectTraceConfig };
    if (hasCorrects && columnNames.corrects) {
        correctsRaw.seriesName = columnNames.corrects;
        Object.assign(correctsRaw, columnStyles.corrects);
    }

    const errorsRaw = { ...defaultErrorTraceConfig };
    if (hasErrors && columnNames.errors) {
        errorsRaw.seriesName = columnNames.errors;
        Object.assign(errorsRaw, columnStyles.errors);
    }

    const traceStyles = {
        [CORRECTS]: { raw: correctsRaw },
        [ERRORS]:   { raw: errorsRaw },
        [TIMING]:   { raw: { ...defaultTimingTraceConfig } },
        misc: {}
    };

    const lineStyles = {
        phase: { color: COLORS.PHASE_LINE, width: LINE_DEFAULTS.PHASE_WIDTH },
        aim:   { color: COLORS.AIM_LINE, width: LINE_DEFAULTS.AIM_WIDTH },
        trend: {
            [CORRECTS]: { color: COLORS.TREND_CORRECTS, width: LINE_DEFAULTS.TREND_WIDTH },
            [ERRORS]:   { color: COLORS.TREND_ERRORS, width: LINE_DEFAULTS.TREND_WIDTH },
            [TIMING]:   { color: COLORS.TREND_TIMING, width: LINE_DEFAULTS.TREND_WIDTH },
            misc: {}
        }
    };

    // Build misc series configs
    for (const miscId of Object.keys(series.misc)) {
        const index = parseInt(miscId.slice(4)) - 1;
        const miscRaw = createMiscTraceConfig(index);

        if (columnNames.misc[miscId]) miscRaw.seriesName = columnNames.misc[miscId];
        if (columnStyles.misc[miscId]) Object.assign(miscRaw, columnStyles.misc[miscId]);

        traceStyles.misc[miscId] = { raw: miscRaw };
        lineStyles.trend.misc[miscId] = {
            color: MISC_COLORS[index % MISC_COLORS.length],
            width: LINE_DEFAULTS.TREND_WIDTH
        };
    }

    // Detect chart type from OpenCelerator's type field
    const detectedType = detectChartType(json.type);

    // Detect minute vs count from the type string — OC includes "minute" in the name
    const minuteChart = json.type.toLowerCase().includes('minute');

    // Calculate startDate
    let startDate = null;
    if (series.xValues.length > 0) {
        startDate = calculateMondayBefore(Math.min(...series.xValues));
    }

    return {
        success: true,
        chartData: {
            chartKey: null,
            shared: false,
            series,
            chartType: detectedType,
            minuteChart,
            chartName: fileName.replace(/\.json$/i, ''),
            tags: [],
            hasTimestamps: true,
            startDate,
            credits: credits || {},
            traceStyles,
            lineStyles,
            PhaseLines: {},
            AimLines: {},
            CelLines: { settings: {} },
            LineCuts: {},
            legend: { show: true, position: 'top-right' },
            lineVisibility: { phase: true, aim: true, change: true, grid: { dateLines: true, countLines: true, minorGrid: true } },
            fanVisible: true,
            placeZerosBelowFloor: placeZerosBelowFloor ?? true
        },
        warnings: conversion.warnings,
        error: null
    };
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseDateToTimestamp(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
        return null;
    }

    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            return null;
        }

        const year = date.getFullYear();
        if (year < 1800 || year > 2200) {
            return null;
        }

        return Math.floor(date.getTime() / 1000);
    } catch {
        return null;
    }
}

function calculateMondayBefore(timestamp) {
    const date = new Date(timestamp * 1000);
    const dayOfWeek = date.getDay();
    const daysToMonday = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    const mondayOffset = daysToMonday * 86400 * 1000;
    const mondayDate = new Date(date.getTime() - mondayOffset);
    mondayDate.setHours(0, 0, 0, 0);
    return mondayDate;
}

function cleanNumericValue(value) {
    if (value === null || value === undefined || value === '') {
        return NaN;
    }

    const num = typeof value === 'number' ? value : parseFloat(value);

    if (isNaN(num) || num < 0) {
        return NaN;
    }

    return num;
}

function parseCredits(creditArray) {
    if (!Array.isArray(creditArray)) {
        return null;
    }

    // Only return credits if there's actual content
    const line0 = creditArray[0] || '';
    const line1 = creditArray[1] || '';

    if (!line0 && !line1) {
        return null;
    }

    return { 0: line0, 1: line1 };
}

