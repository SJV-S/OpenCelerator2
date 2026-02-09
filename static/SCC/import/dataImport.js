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

// ============================================================================
// Constants
// ============================================================================

// Regex patterns for column type detection
// Date pattern: requires at least one 2-digit number AND at least 2 separators (-, /, or .)
// Matches: "2024-01-15", "01/15/2024", "15.01.2024", etc.
const DATE_PATTERN = /^(?=.*\d{2})(?:[^-/.\n]*[-/.]){2,}[^-/.\n]*$/;
const NUMERIC_PATTERN = /^\s*-?\d+(\.\d+)?\s*$/;

// Detection thresholds
const DETECTION_THRESHOLD = 0.7;  // 70% of sampled cells must match
const DETECTION_SAMPLE_SIZE = 15; // Number of rows to sample

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
                    const workbook = XLSX.read(data, { type: 'array' });

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
 * Detect column types by sampling data
 * Uses lazy evaluation - only checks first N rows
 * @param {object[]} rows - Array of row objects from spreadsheet
 * @returns {{dateColumns: string[], numericColumns: string[]}}
 */
export function detectColumnTypes(rows) {
    if (!rows || rows.length === 0) {
        return { dateColumns: [], numericColumns: [] };
    }

    const columns = Object.keys(rows[0]);

    // First pass: detect date columns
    const dateColumns = lazyCheck(rows, columns, DATE_PATTERN, true);

    // Second pass: detect numeric columns (excluding date columns)
    const remainingColumns = columns.filter(col => !dateColumns.includes(col));
    const numericColumns = lazyCheck(rows, remainingColumns, NUMERIC_PATTERN, false);

    return { dateColumns, numericColumns };
}

/**
 * Check columns against a pattern using lazy evaluation
 * For date detection, uses a multi-stage approach:
 *   Stage 0: Check if value is already a Date object (XLSX may parse dates)
 *   Stage 1: Check if value is an Excel serial date number
 *   Stage 2: Primary regex pattern (2+ separators)
 *   Stage 3: Fallback for partial dates (year-only, year-month)
 *
 * @param {object[]} rows - Data rows
 * @param {string[]} columns - Columns to check
 * @param {RegExp} pattern - Pattern to match
 * @param {boolean} isDateCheck - Whether this is date detection (uses fallback heuristics)
 * @returns {string[]} Columns that match the pattern
 */
function lazyCheck(rows, columns, pattern, isDateCheck) {
    const matchingColumns = [];
    const sampleRows = rows.slice(0, DETECTION_SAMPLE_SIZE);
    const MIN_YEAR = 1900;
    const MAX_YEAR = 2100;

    for (const col of columns) {
        let matches = 0;
        let total = 0;

        for (const row of sampleRows) {
            const value = row[col];

            // Skip empty/null values
            if (value == null || value === '') continue;

            total++;

            if (isDateCheck) {
                // Stage 0: Check if already a Date object (XLSX parses dates)
                if (value instanceof Date) {
                    if (!isNaN(value.getTime())) {
                        const year = value.getFullYear();
                        if (year >= MIN_YEAR && year <= MAX_YEAR) {
                            matches++;
                            continue;
                        }
                    }
                }

                // Stage 1: Check if Excel serial date (number between ~1 and ~60000)
                if (typeof value === 'number' && value > 0 && value < 100000) {
                    // Excel serial dates: 1 = Jan 1, 1900, ~45000 = ~2023
                    // Valid range roughly 1 (1900) to 73000 (2100)
                    if (value >= 1 && value <= 73050) {
                        matches++;
                        continue;
                    }
                }
            }

            const strValue = String(value).trim();

            // Stage 2: Try primary regex pattern (for strings)
            if (pattern.test(strValue)) {
                matches++;
                continue;
            }

            // Stage 3: Fallback for date detection only
            if (isDateCheck) {
                // Year-only: "2024" (exactly 4 digits, valid year range)
                if (/^\d{4}$/.test(strValue)) {
                    const year = parseInt(strValue);
                    if (year >= MIN_YEAR && year <= MAX_YEAR) {
                        matches++;
                        continue;
                    }
                }

                // Year-month formats: normalize separators and split
                const parts = strValue.replace(/[/.]/g, '-').split('-');
                if (parts.length === 2) {
                    const [p1, p2] = parts;

                    // YYYY-MM format (e.g., "2024-06", "2024/06")
                    if (p1.length === 4 && /^\d+$/.test(p1) && /^\d+$/.test(p2)) {
                        const year = parseInt(p1);
                        const month = parseInt(p2);
                        if (year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12) {
                            matches++;
                            continue;
                        }
                    }

                    // MM-YYYY format (e.g., "06-2024", "06/2024")
                    if (p2.length === 4 && /^\d+$/.test(p1) && /^\d+$/.test(p2)) {
                        const month = parseInt(p1);
                        const year = parseInt(p2);
                        if (year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12) {
                            matches++;
                            continue;
                        }
                    }
                }

                // Final fallback: try native Date parsing on string
                const parsed = new Date(strValue);
                if (!isNaN(parsed.getTime())) {
                    const year = parsed.getFullYear();
                    if (year >= MIN_YEAR && year <= MAX_YEAR) {
                        matches++;
                        continue;
                    }
                }
            }
        }

        // Column matches if threshold percentage of non-empty cells match
        if (total > 0 && (matches / total) >= DETECTION_THRESHOLD) {
            matchingColumns.push(col);
        }
    }

    return matchingColumns;
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

  let str = String(value).trim();
  console.log('[Import] Parsing:', str);

  // Strip time prefix "00:00:00 " (handles variable length time + any whitespace)
  str = str.replace(/^\d{1,2}:\d{2}(:\d{2})?\s+/, '');
  console.log('[Import] After time strip:', str);

  let date;

  // Parse DD-MMM-YYYY (e.g., "18-Jul-2018")
  const match = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) {
    const [, day, mon, year] = match;
    const months = {jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11};
    const monthIdx = months[mon.toLowerCase()];

    if (monthIdx !== undefined) {
      date = new Date(parseInt(year), monthIdx, parseInt(day));
      console.log('[Import] Parsed DD-MMM-YYYY:', date.toISOString());
    } else {
      console.log('[Import] Unknown month:', mon);
    }
  }

  // Fallback for other formats
  if (!date || isNaN(date.getTime())) {
    date = new Date(str);
  }

  // Excel serial fallback
  if ((!date || isNaN(date.getTime())) && typeof value === 'number') {
    if (value > 0 && value < 100000) date = excelSerialToDate(value);
  }

  if (!date || isNaN(date.getTime())) {
    console.log('[Import] Final parse failed for:', str);
    return null;
  }

  const yr = date.getFullYear();
  if (yr < 1900 || yr > 2100) return null;

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
                    raw: createMiscTraceConfig(index)
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

        // Update startDate to Monday before earliest data point (ISO 8601)
        if (chartState.series.xValues.length > 0) {
            // Find earliest timestamp in all data (could be existing or new)
            const earliestTimestamp = Math.min(...chartState.series.xValues);
            const earliestDate = new Date(earliestTimestamp * 1000);
            const dayOfWeek = earliestDate.getDay();
            // getDay(): 0=Sun, 1=Mon, ..., 6=Sat
            // Days to subtract to reach Monday: Mon(1)->0, Tue(2)->1, ..., Sun(0)->6
            const daysToMonday = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
            const mondayOffset = daysToMonday * 86400 * 1000;
            const mondayDate = new Date(earliestDate.getTime() - mondayOffset);
            mondayDate.setHours(0, 0, 0, 0);
            chartState.startDate = mondayDate;
        }

        // Emit success event
        eventBus.emit(EVENTS.DATA_IMPORT_COMPLETED, {
            count: sortedRows.length,
            replaced: options.replace
        });

        // Trigger chart refresh
        eventBus.emit(EVENTS.DATA_CHART_REFRESH);

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
