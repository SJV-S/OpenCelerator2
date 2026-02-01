/**
 * OpenCelerator Import Module
 *
 * Converts OpenCelerator JSON export files to TC2 chartState format.
 *
 * What IS converted:
 *   - Raw data (dates, corrects, incorrects, timing/minutes, misc/other columns)
 *   - Series names from column_map
 *   - Data point styles (universal "none, none" styles)
 *   - Credit lines
 *   - Start date
 *
 * Limitations (features that don't translate):
 *   - Phase lines: Different structure, not imported
 *   - Aim lines: Different structure, not imported
 *   - Trend/celeration lines: Different parameters, not imported
 *   - Slice-specific styling (date ranges): Only universal styles imported
 */

import {
    chartState,
    createMiscTraceConfig,
    MISC_COLORS
} from '../chartState.js';
import { CORRECTS, ERRORS } from '../config.js';
import { eventBus, EVENTS } from '../eventBus.js';

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
export function convertOpenCeleratorToTC2(json) {
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

/**
 * Apply converted data to chartState
 * Imports data, series names, styles, and credits
 * Does NOT change chart name, type, or other unrelated settings
 */
export function applyToChartState(convertedData, options = { replace: true }) {
    if (!convertedData || !convertedData.series) {
        eventBus.emit(EVENTS.DATA_IMPORT_FAILED, {
            error: 'No data to import',
            stage: 'import'
        });
        return { success: false, count: 0, message: 'No data to import' };
    }

    try {
        const { series, credits, columnNames, columnStyles, hasCorrects, hasErrors, placeZerosBelowFloor } = convertedData;

        if (options.replace) {
            // Remove existing misc series UI first (emit REMOVED for each)
            const existingMiscIds = Object.keys(chartState.series.misc || {});
            for (const id of existingMiscIds) {
                eventBus.emit(EVENTS.MISC_SERIES_REMOVED, { id });
            }

            // Clear existing data
            chartState.series.xValues = [];
            chartState.series.corrects = [];
            chartState.series.errors = [];
            chartState.series.timing = [];
            chartState.series.misc = {};

            // Clear misc traceStyles and lineStyles
            chartState.traceStyles.misc = {};
            chartState.lineStyles.trend.misc = {};

            // Apply placeZerosBelowFloor setting from OpenCelerator
            chartState.placeZerosBelowFloor = placeZerosBelowFloor;
            // Update the UI toggle if it exists
            const toggle = document.getElementById('place-zeros-below-floor-toggle');
            if (toggle) toggle.checked = placeZerosBelowFloor;

            // Update credits
            if (credits && (credits[0] || credits[1])) {
                chartState.credits = credits;
                eventBus.emit(EVENTS.CREDITS_UPDATED);
            }
        }

        // Apply series names and styles for corrects (only if there's actual data)
        if (hasCorrects && columnNames.corrects && chartState.traceStyles[CORRECTS]?.raw) {
            chartState.traceStyles[CORRECTS].raw.seriesName = columnNames.corrects;
            if (columnStyles.corrects) {
                Object.assign(chartState.traceStyles[CORRECTS].raw, columnStyles.corrects);
            }
        } else if (!hasCorrects && options.replace) {
            // Reset corrects series name to default when no corrects data
            if (chartState.traceStyles[CORRECTS]?.raw) {
                chartState.traceStyles[CORRECTS].raw.seriesName = 'correct';
            }
        }

        // Apply series names and styles for errors (only if there's actual data)
        if (hasErrors && columnNames.errors && chartState.traceStyles[ERRORS]?.raw) {
            chartState.traceStyles[ERRORS].raw.seriesName = columnNames.errors;
            if (columnStyles.errors) {
                Object.assign(chartState.traceStyles[ERRORS].raw, columnStyles.errors);
            }
        } else if (!hasErrors && options.replace) {
            // Reset errors series name to default when no errors data
            if (chartState.traceStyles[ERRORS]?.raw) {
                chartState.traceStyles[ERRORS].raw.seriesName = 'incorrect';
            }
        }

        // Initialize misc arrays with names and styles
        for (const miscId of Object.keys(series.misc)) {
            if (!chartState.series.misc[miscId]) {
                chartState.series.misc[miscId] = [];
            }

            const num = parseInt(miscId.slice(4));
            const index = num - 1;

            // Create traceStyles config
            if (!chartState.traceStyles.misc[miscId]) {
                chartState.traceStyles.misc[miscId] = {
                    raw: createMiscTraceConfig(index)
                };
            }

            // Apply series name from column_map
            if (columnNames.misc[miscId]) {
                chartState.traceStyles.misc[miscId].raw.seriesName = columnNames.misc[miscId];
            }

            // Apply styles from data_point_styles
            if (columnStyles.misc[miscId]) {
                Object.assign(chartState.traceStyles.misc[miscId].raw, columnStyles.misc[miscId]);
            }

            // Create lineStyles config
            if (!chartState.lineStyles.trend.misc[miscId]) {
                chartState.lineStyles.trend.misc[miscId] = {
                    color: MISC_COLORS[index % MISC_COLORS.length],
                    width: 2
                };
            }
        }
        // Note: UI sync happens via DATA_IMPORT_COMPLETED -> syncMiscSeriesUI()

        // Push data
        for (let i = 0; i < series.xValues.length; i++) {
            chartState.series.xValues.push(series.xValues[i]);
            chartState.series.corrects.push(series.corrects[i]);
            chartState.series.errors.push(series.errors[i]);
            chartState.series.timing.push(series.timing[i]);

            for (const miscId of Object.keys(series.misc)) {
                chartState.series.misc[miscId].push(series.misc[miscId][i]);
            }
        }

        // Update startDate to Monday before earliest data point
        if (chartState.series.xValues.length > 0) {
            const earliestTimestamp = Math.min(...chartState.series.xValues);
            chartState.startDate = calculateMondayBefore(earliestTimestamp);
        }

        // Emit success event (triggers UI sync via DATA_IMPORT_COMPLETED subscriber)
        eventBus.emit(EVENTS.DATA_IMPORT_COMPLETED, {
            count: series.xValues.length,
            replaced: options.replace,
            source: 'OpenCelerator'
        });

        // Trigger chart refresh
        eventBus.emit(EVENTS.DATA_CHART_REFRESH);

        return {
            success: true,
            count: series.xValues.length,
            message: `Imported ${series.xValues.length} entries from OpenCelerator`
        };

    } catch (err) {
        eventBus.emit(EVENTS.DATA_IMPORT_FAILED, {
            error: err.message,
            stage: 'import'
        });
        return { success: false, count: 0, message: err.message };
    }
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

// ============================================================================
// Full Import Pipeline
// ============================================================================

/**
 * Full import pipeline for OpenCelerator JSON
 */
export async function importOpenCeleratorFile(file) {
    try {
        const text = await file.text();

        let json;
        try {
            json = JSON.parse(text);
        } catch (parseErr) {
            return {
                success: false,
                count: 0,
                message: `Invalid JSON: ${parseErr.message}`,
                warnings: []
            };
        }

        if (!isOpenCeleratorFormat(json)) {
            return {
                success: false,
                count: 0,
                message: 'Not a valid OpenCelerator export file',
                warnings: []
            };
        }

        const conversion = convertOpenCeleratorToTC2(json);
        if (!conversion.success) {
            return {
                success: false,
                count: 0,
                message: conversion.error,
                warnings: conversion.warnings
            };
        }

        const result = applyToChartState(conversion.data, { replace: true });

        return {
            success: result.success,
            count: result.count,
            message: result.message,
            warnings: conversion.warnings
        };

    } catch (err) {
        return {
            success: false,
            count: 0,
            message: `Import error: ${err.message}`,
            warnings: []
        };
    }
}
