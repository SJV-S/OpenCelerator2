/**
 * Data Import Module
 *
 * Provides functions to read spreadsheet files (CSV, XLSX, XLS, ODS),
 * detect column types, clean/validate data, and import to chartState.
 *
 * Dependencies:
 *   - XLSX library (SheetJS) must be loaded globally via script tag
 *   - chartState for data storage
 *   - eventBus for event coordination
 *
 * Usage:
 *   const { columns, rows } = await readSpreadsheet(file);
 *   const { dateColumns, numericColumns } = detectColumnTypes(rows);
 *   const { valid, invalid, errors } = cleanImportData(rows, columnMap);
 *   const result = importToChartState(valid, { replace: true });
 */

import { chartState } from '../chartState.js';
import { createMiscTraceConfig, MISC_COLORS, MISSING } from '../config.js';
import { isMissing } from '../util/format.js';
import { eventBus, EVENTS } from '../eventBus.js';
import { alignStartDate } from '../util/dates.js';

// ============================================================================
// Constants
// ============================================================================

/** Number of rows to sample for type detection */
const SAMPLE_SIZE = 20;

/** Column is date if ≥70% of non-empty sampled values are date-typed */
const DATE_THRESHOLD = 0.7;

/** Column is numeric if ≥70% of non-empty sampled values are numbers */
const NUMERIC_THRESHOLD = 0.7;

/**
 * Strict date patterns for string values.
 * All require non-digit separator characters (-, /, ., space).
 * Pure numeric strings are excluded BEFORE these are tested.
 */
const STRING_DATE_PATTERNS = [
    // ISO: 2024-01-15, 2024-01-15T00:00:00.000Z
    /^\d{4}-\d{1,2}-\d{1,2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/,
    // US slash: 01/15/2024, 1/15/24
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
    // EU dot: 15.01.2024
    /^\d{1,2}\.\d{1,2}\.\d{2,4}$/,
    // Dash-separated numeric: 15-01-2024
    /^\d{1,2}-\d{1,2}-\d{2,4}$/,
    // DD-Mon-YYYY: 15-Jul-2024
    /^\d{1,2}-[A-Za-z]{3,}-\d{2,4}$/,
    // Mon DD, YYYY: Jul 15, 2024 or July 15 2024
    /^[A-Za-z]{3,}\s+\d{1,2},?\s+\d{2,4}$/,
    // Mon YYYY: Jul 2024, January 2024
    /^[A-Za-z]{3,}\s+\d{4}$/,
    // Mon-YYYY: Jul-2024
    /^[A-Za-z]{3,}-\d{4}$/,
    // YYYY-MM: 2024-01
    /^\d{4}-\d{1,2}$/,
    // MM/YYYY: 01/2024
    /^\d{1,2}\/\d{4}$/,
];

// ============================================================================
// File Reading
// ============================================================================

/**
 * Read a spreadsheet file (CSV, XLSX, XLS, ODS)
 * @param {File} file - File object from file input
 * @returns {Promise<{columns: string[], rows: object[]}>}
 * @throws {Error} If file cannot be read or parsed
 */
export async function readSpreadsheet(file) {
    if (!file) {
        throw new Error('No file provided');
    }

    eventBus.emit(EVENTS.DATA_IMPORT_STARTED, { filename: file.name });

    try {
        const result = await new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    // Check if XLSX library is available
                    if (typeof XLSX === 'undefined') {
                        throw new Error('XLSX library not loaded');
                    }

                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', codepage: 65001, cellDates: true });

                    // Get first sheet
                    const sheetName = workbook.SheetNames[0];
                    if (!sheetName) {
                        throw new Error('No sheets found in file');
                    }

                    const sheet = workbook.Sheets[sheetName];

                    // Convert to array of objects (first row = headers)
                    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

                    if (rows.length === 0) {
                        throw new Error('File contains no data rows');
                    }

                    const columns = Object.keys(rows[0]);

                    resolve({ columns, rows });
                } catch (err) {
                    reject(err);
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });

        eventBus.emit(EVENTS.DATA_IMPORT_FILE_PARSED, {
            columns: result.columns,
            rowCount: result.rows.length
        });

        return result;

    } catch (err) {
        eventBus.emit(EVENTS.DATA_IMPORT_FAILED, {
            error: err.message,
            stage: 'read'
        });
        throw err;
    }
}

// ============================================================================
// Column Type Detection
// ============================================================================

/**
 * Detect column types from spreadsheet rows.
 *
 * Design principles (zero false positives on numeric data):
 *   1. Type-first: instanceof Date is the primary date signal (from cellDates: true)
 *   2. Numbers NEVER enter the date path — typeof 'number' is always numeric
 *   3. Strings: numbers-before-dates check (+value), then strict regex with separators
 *   4. No new Date() fallback — too permissive, causes false positives
 *   5. Default to numeric/other when uncertain — a missed date column is a minor
 *      inconvenience (user picks it from dropdown), but a false date classification
 *      removes a data column from the user's options entirely
 *
 * @param {object[]} rows - Array of row objects from sheet_to_json
 * @returns {{dateColumns: string[], numericColumns: string[]}}
 */
export function detectColumnTypes(rows) {
    if (!rows || rows.length === 0) {
        return { dateColumns: [], numericColumns: [] };
    }

    const columns = Object.keys(rows[0]);
    const sample = rows.slice(0, SAMPLE_SIZE);
    const dateCandidates = [];
    const numericColumns = [];

    for (const col of columns) {
        const { type, confidence } = classifyColumn(sample, col);
        if (type === 'date') dateCandidates.push({ col, confidence });
        else if (type === 'numeric') numericColumns.push(col);
    }

    // Sort date candidates by confidence (strongest first) so the UI
    // can auto-select the best candidate in the date dropdown
    dateCandidates.sort((a, b) => b.confidence - a.confidence);
    const dateColumns = dateCandidates.map(d => d.col);

    return { dateColumns, numericColumns };
}

/**
 * Classify a single column by examining sampled values.
 *
 * Per-value priority chain (mirrors D3/pandas/readr):
 *   1. empty/null       → skip
 *   2. instanceof Date  → date  (unambiguous, from cellDates: true)
 *   3. typeof 'number'  → numeric (NEVER date — no serial number guessing)
 *   4. typeof 'string':
 *      a. pure numeric string (+value works) → numeric
 *      b. matches strict date pattern        → date
 *      c. otherwise                          → other
 *
 * @param {object[]} sample - Sampled rows
 * @param {string} col - Column name
 * @returns {{type: 'date'|'numeric'|'other', confidence: number}}
 */
function classifyColumn(sample, col) {
    let dateCount = 0;
    let numericCount = 0;
    let total = 0;

    for (const row of sample) {
        const value = row[col];

        if (value == null || value === '') continue;
        total++;

        // Date objects from cellDates: true — the primary, unambiguous signal
        if (value instanceof Date) {
            if (!isNaN(value.getTime())) dateCount++;
            continue;
        }

        // Numbers are ALWAYS numeric — never enter the date path.
        // This is the key protection: integer values like 18, 42868, 0
        // can never be misclassified as Excel serial dates.
        if (typeof value === 'number') {
            numericCount++;
            continue;
        }

        // String values — check numbers before dates (D3/pandas pattern)
        if (typeof value === 'string') {
            const trimmed = value.trim();

            // Pure numeric string → numeric (must check BEFORE date patterns)
            if (trimmed !== '' && !isNaN(+trimmed)) {
                numericCount++;
                continue;
            }

            // Strict date pattern match — requires separators, no permissive fallback
            if (isDateString(trimmed)) {
                dateCount++;
                continue;
            }
        }

        // Anything else (boolean, unrecognized string, invalid Date) → other
    }

    if (total === 0) return { type: 'other', confidence: 0 };

    const dateRatio = dateCount / total;
    const numericRatio = numericCount / total;

    if (dateRatio >= DATE_THRESHOLD) return { type: 'date', confidence: dateRatio };
    if (numericRatio >= NUMERIC_THRESHOLD) return { type: 'numeric', confidence: numericRatio };
    return { type: 'other', confidence: 0 };
}

/**
 * Test whether a string matches any strict date pattern.
 * All patterns require non-digit separators — pure numeric strings
 * must be excluded by the caller before reaching this function.
 *
 * @param {string} str - Trimmed string value
 * @returns {boolean}
 */
function isDateString(str) {
    return STRING_DATE_PATTERNS.some(pattern => pattern.test(str));
}

// ============================================================================
// Data Cleaning
// ============================================================================

/**
 * Clean and validate imported data based on column mapping
 * @param {object[]} rows - Raw row objects from spreadsheet
 * @param {object} columnMap - Mapping of system columns to spreadsheet columns
 *   { date: 'DateCol', corrects: 'CorrectCol', errors: 'ErrorCol', timing: 'MinutesCol', misc: { misc1: 'col', ... } }
 *   Note: timing and misc are optional
 * @returns {{valid: object[], invalid: object[], errors: string[]}}
 */
export function cleanImportData(rows, columnMap) {
    const valid = [];
    const invalid = [];
    const errors = [];

    if (!columnMap.date) {
        errors.push('Date column is required');
        return { valid, invalid, errors };
    }

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 because row 1 is header, and we're 0-indexed

        try {
            const cleaned = cleanRow(row, columnMap);

            if (cleaned.error) {
                invalid.push({ row: rowNum, data: row, error: cleaned.error });
            } else {
                valid.push(cleaned.data);
            }
        } catch (err) {
            invalid.push({ row: rowNum, data: row, error: err.message });
        }
    }

    // Summary errors
    if (invalid.length > 0) {
        errors.push(`${invalid.length} row(s) had invalid data`);
    }

    if (valid.length === 0) {
        errors.push('No valid rows found');
    }

    return { valid, invalid, errors };
}

/**
 * Clean a single row
 * @param {object} row - Raw row object
 * @param {object} columnMap - Column mapping
 * @returns {{data: object, error: string|null}}
 */
function cleanRow(row, columnMap) {
    // Parse date (required)
    const dateValue = row[columnMap.date];
    const timestamp = parseDate(dateValue);

    if (timestamp === null) {
        return { data: null, error: `Invalid date: ${dateValue}` };
    }

    // Parse corrects (optional, defaults to MISSING)
    const corrects = columnMap.corrects
        ? cleanNumeric(row[columnMap.corrects])
        : MISSING;

    // Parse errors (optional, defaults to MISSING)
    const errors = columnMap.errors
        ? cleanNumeric(row[columnMap.errors])
        : MISSING;

    // Parse timing (optional, defaults to 1)
    const timing = columnMap.timing
        ? (cleanNumeric(row[columnMap.timing]) || 1)
        : 1;

    // Parse misc columns
    const misc = {};
    if (columnMap.misc) {
        for (const [miscId, colName] of Object.entries(columnMap.misc)) {
            if (colName) {
                misc[miscId] = cleanNumeric(row[colName]);
            }
        }
    }

    // At least one data series should have data (corrects, errors, or any misc)
    const hasMiscData = Object.values(misc).some(v => !isMissing(v));
    if (isMissing(corrects) && isMissing(errors) && !hasMiscData) {
        return { data: null, error: 'No count data (corrects, errors, or misc)' };
    }

    return {
        data: { timestamp, corrects, errors, timing, misc },
        error: null
    };
}

/**
 * Parse a date value to Unix timestamp (seconds)
 * @param {*} value - Date value (string, number, Date)
 * @returns {number|null} Unix timestamp in seconds, or null if invalid
 */
function parseDate(value) {
  if (value == null || value === '') return null;

  // Handle Date objects (cellDates: true makes SheetJS return these)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    if (value.getFullYear() > 2200) return null;
    return Math.floor(value.getTime() / 1000);
  }

  // Handle numeric values as Excel serial dates.
  // Fallback for files where cellDates didn't produce Date objects.
  if (typeof value === 'number') {
    const date = excelSerialToDate(value);
    if (!date || isNaN(date.getTime())) return null;
    if (date.getFullYear() > 2200) return null;
    return Math.floor(date.getTime() / 1000);
  }

  // String path — for values SheetJS didn't auto-convert
  let str = String(value).trim();

  // Strip time prefix "00:00:00 " (handles variable length time + any whitespace)
  str = str.replace(/^\d{1,2}:\d{2}(:\d{2})?\s+/, '');

  let date;

  // Parse DD-MMM-YYYY (e.g., "18-Jul-2018")
  const match = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) {
    const [, day, mon, year] = match;
    const months = {jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11};
    const monthIdx = months[mon.toLowerCase()];

    if (monthIdx !== undefined) {
      date = new Date(parseInt(year), monthIdx, parseInt(day));
    }
  }

  // Fallback for other string formats (ISO, locale, etc.)
  if (!date || isNaN(date.getTime())) {
    date = new Date(str);
  }

  if (!date || isNaN(date.getTime())) {
    return null;
  }

  if (date.getFullYear() > 2200) return null;

  return Math.floor(date.getTime() / 1000);
}


/**
 * Convert Excel serial date to JavaScript Date
 * Excel serial: days since Jan 1, 1900 (with leap year bug)
 * @param {number} serial - Excel serial date number
 * @returns {Date}
 */
function excelSerialToDate(serial) {
    // Excel incorrectly treats 1900 as a leap year, so dates after Feb 28, 1900
    // are off by one day. We adjust for this.
    const utcDays = Math.floor(serial - 25569); // 25569 = days from 1900 to 1970
    const utcMs = utcDays * 86400 * 1000;
    return new Date(utcMs);
}

/**
 * Clean a numeric value
 * @param {*} value - Value to clean
 * @returns {number|null} Cleaned number, or MISSING if invalid/negative
 */
function cleanNumeric(value) {
    if (value == null || value === '') {
        return MISSING;
    }

    const num = typeof value === 'number'
        ? value
        : parseFloat(String(value).trim());

    // Reject invalid and negative values
    if (isNaN(num) || num < 0) {
        return MISSING;
    }

    return num;
}

// ============================================================================
// Import to Chart State
// ============================================================================

/**
 * Import cleaned data into chartState
 * @param {object[]} cleanedRows - Array of {timestamp, corrects, errors, timing, misc}
 * @param {object} options - Import options
 *   { replace: true } - Clear existing data (default)
 *   { merge: true } - Merge with existing data (not yet implemented)
 * @returns {{success: boolean, count: number, message: string}}
 */
export function importToChartState(cleanedRows, options = { replace: true }) {
    if (!cleanedRows || cleanedRows.length === 0) {
        eventBus.emit(EVENTS.DATA_IMPORT_FAILED, {
            error: 'No data to import',
            stage: 'import'
        });
        return { success: false, count: 0, message: 'No data to import' };
    }

    try {
        // Sort by timestamp
        const sortedRows = [...cleanedRows].sort((a, b) => a.timestamp - b.timestamp);

        // Collect all misc column IDs from the data
        const miscIds = new Set();
        for (const row of sortedRows) {
            if (row.misc) {
                Object.keys(row.misc).forEach(id => miscIds.add(id));
            }
        }

        if (options.replace) {
            // Clear existing data
            chartState.series.xValues = [];
            chartState.series.corrects = [];
            chartState.series.errors = [];
            chartState.series.timing = [];
            chartState.series.misc = {};

            // Clear stale misc trace styles and trend line styles
            chartState.traceStyles.misc = {};
            chartState.lineStyles.trend.misc = {};

            // Initialize misc arrays and ensure trace/trend styles exist
            for (const miscId of miscIds) {
                chartState.series.misc[miscId] = [];

                const num = parseInt(miscId.slice(4));
                const index = num - 1;
                chartState.traceStyles.misc[miscId] = {
                    "0": createMiscTraceConfig(index)
                };
                chartState.lineStyles.trend.misc[miscId] = {
                    color: MISC_COLORS[index % MISC_COLORS.length],
                    width: 2
                };
            }
        }

        // Push new data
        for (const row of sortedRows) {
            chartState.series.xValues.push(row.timestamp);
            chartState.series.corrects.push(row.corrects);
            chartState.series.errors.push(row.errors);
            chartState.series.timing.push(row.timing);

            // Push misc values
            for (const miscId of miscIds) {
                if (!chartState.series.misc[miscId]) {
                    chartState.series.misc[miscId] = [];
                }
                const miscValue = row.misc?.[miscId];
                chartState.series.misc[miscId].push(miscValue !== undefined ? miscValue : MISSING);
            }
        }

        // Mark that xValues contain timestamps requiring conversion to x-positions
        chartState.hasTimestamps = true;

        // Align startDate to chart type (decade start for yearly, prev year for monthly, etc.)
        if (chartState.series.xValues.length > 0) {
            const earliestTimestamp = Math.min(...chartState.series.xValues);
            const earliestDate = new Date(earliestTimestamp * 1000);
            chartState.startDate = alignStartDate(earliestDate, chartState.chartType || 'Daily');
        }

        // NOTE: Events (DATA_IMPORT_COMPLETED, DATA_CHART_REFRESH) are NOT emitted here.
        // The caller (performImport) emits them after setting display names and aggregation,
        // so the chart renders with correct names and aggregation from the first frame.

        return {
            success: true,
            count: sortedRows.length,
            message: `Imported ${sortedRows.length} entries`
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
// Convenience Function
// ============================================================================

/**
 * Full import pipeline: read file, detect types, return for mapping
 * Does NOT import - caller must handle column mapping UI and call importToChartState
 * @param {File} file - File to import
 * @returns {Promise<{columns: string[], rows: object[], dateColumns: string[], numericColumns: string[]}>}
 */
export async function prepareImport(file) {
    const { columns, rows } = await readSpreadsheet(file);
    const { dateColumns, numericColumns } = detectColumnTypes(rows);

    return { columns, rows, dateColumns, numericColumns };
}
