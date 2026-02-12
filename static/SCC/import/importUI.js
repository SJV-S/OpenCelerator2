/**
 * Import UI Module
 *
 * Handles the Import tab UI for DATA imports: CSV, Excel files.
 * Provides drop zone, column mapping, and import actions.
 *
 * Note: JSON chart imports (TC2 native, OpenCelerator) are handled
 * in Chart Explorer via the "Import Chart" button.
 */

import { chartState } from '../chartState.js';
import { CORRECTS, ERRORS } from '../config.js';
import { eventBus, EVENTS } from '../eventBus.js';
import {
    prepareImport,
    cleanImportData,
    importToChartState
} from './dataImport.js';
import { createToast } from '../ui/toaster.js';
import { downloadFile } from '../util/download.js';
import { timestampsToXPositions } from '../util/dates.js';

// ============================================================================
// State
// ============================================================================

let currentFileData = null;  // { columns, rows, dateColumns, numericColumns }
let currentFileName = null;
let miscColumnCount = 0;
const MAX_MISC_COLUMNS = 10;

// ============================================================================
// DOM Elements (cached after init)
// ============================================================================

let elements = {};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the import UI
 * Call this after DOM is ready
 */
export function initImportUI() {
    cacheElements();
    setupDropZone();
    setupFileInput();
    setupMappingControls();
    setupHelpers();
    setupEventSubscriptions();
    updateTimingRowVisibility();
}

function cacheElements() {
    elements = {
        // States
        dropzoneState: document.getElementById('import-dropzone-state'),
        mappingState: document.getElementById('import-mapping-state'),
        progressState: document.getElementById('import-progress-state'),

        // Drop zone
        dropzone: document.getElementById('import-dropzone'),
        fileInput: document.getElementById('import-file-input'),

        // Mapping
        fileInfo: document.getElementById('import-file-info'),
        mapDate: document.getElementById('import-map-date'),
        mapCorrects: document.getElementById('import-map-corrects'),
        mapErrors: document.getElementById('import-map-errors'),
        mapTiming: document.getElementById('import-map-timing'),
        timingRow: document.getElementById('import-timing-row'),
        miscContainer: document.getElementById('import-misc-container'),
        addMiscBtn: document.getElementById('import-add-misc-btn'),
        replaceOption: document.getElementById('import-replace-option'),
        replaceCheckbox: document.getElementById('import-replace-checkbox'),
        cancelBtn: document.getElementById('import-cancel-btn'),
        confirmBtn: document.getElementById('import-confirm-btn'),

        // Helpers
        downloadTemplateBtn: document.getElementById('import-download-template'),
        copyAiPromptBtn: document.getElementById('import-copy-ai-prompt')
    };
}

// ============================================================================
// Drop Zone
// ============================================================================

function setupDropZone() {
    const dropzone = elements.dropzone;
    if (!dropzone) return;

    // Drag and drop events
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
        }
    });
}

function setupFileInput() {
    const fileInput = elements.fileInput;
    if (!fileInput) return;

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFile(file);
        }
        // Reset input so same file can be selected again
        fileInput.value = '';
    });
}

// ============================================================================
// Import Helpers (template download + AI prompt copy)
// ============================================================================

function setupHelpers() {
    elements.downloadTemplateBtn?.addEventListener('click', downloadTemplate);
    elements.copyAiPromptBtn?.addEventListener('click', copyAiPrompt);
}

function downloadTemplate() {
    const isMinute = chartState.minuteChart;
    const headers = isMinute
        ? 'Date,Corrects,Errors,Minutes,Prompts'
        : 'Date,Corrects,Errors,Prompts';

    const rows = isMinute
        ? [
            '2024-01-15,45,3,1,5',
            '2024-01-16,52,1,1,3',
            '2024-01-17,,2,1,',
            '2024-01-18,60,,1,4'
        ]
        : [
            '2024-01-15,45,3,5',
            '2024-01-16,52,1,3',
            '2024-01-17,,2,',
            '2024-01-18,60,,4'
        ];

    const csv = [headers, ...rows].join('\n');
    downloadFile(csv, 'scc-import-template.csv', 'text/csv');
}

function buildAiPrompt() {
    const base = `I need you to format my data as a CSV for import into a Standard Celeration Chart (SCC). Here are the rules:

**Required columns:**
- Date — use YYYY-MM-DD format
- At least one of: Corrects, Errors, or a Misc column

**Optional columns:**
- Corrects — non-negative numbers (behavioral count/frequency data)
- Errors — non-negative numbers (error count/frequency data)
- Additional numeric columns become "Misc" series (up to 10) — these are extra numeric data series plotted alongside corrects/errors (e.g. prompts, trials, dosage)`;

    const minuteLine = `
- Minutes — positive number, the timing floor for each observation`;

    const rules = `

**Formatting rules:**
- Leave cells empty for missing data (do NOT use 0, N/A, or dashes)
- All numeric values must be non-negative
- Dates must be parseable (YYYY-MM-DD preferred)
- First row must be column headers

**Before formatting, ask me to clarify:**
1. Which column is "corrects" vs "errors" if it's ambiguous
2. Whether any additional numeric columns should be included as Misc series`;

    const minuteClarify = `
3. What the timing floor is (in minutes) if a Minutes column is needed`;

    const warnings = `

**Warn me if:**
- Any values are negative
- Any cells contain non-numeric data in numeric columns
- Any dates can't be parsed
`;

    const isMinute = chartState.minuteChart;
    return base + (isMinute ? minuteLine : '') + rules + (isMinute ? minuteClarify : '') + warnings;
}

function copyAiPrompt() {
    const btn = elements.copyAiPromptBtn;
    if (!btn) return;

    navigator.clipboard.writeText(buildAiPrompt()).then(() => {
        const original = btn.textContent;
        btn.textContent = 'Copied ✓';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = original;
            btn.classList.remove('copied');
        }, 2000);
    });
}

// ============================================================================
// Timing Row Visibility (based on minuteChart)
// ============================================================================

function updateTimingRowVisibility() {
    if (elements.timingRow) {
        elements.timingRow.style.display = chartState.minuteChart ? 'flex' : 'none';
    }
}

// ============================================================================
// Replace Option Visibility (based on existing data)
// ============================================================================

function hasExistingData() {
    return chartState.series.xValues && chartState.series.xValues.length > 0;
}

function updateReplaceOptionVisibility() {
    if (elements.replaceOption) {
        elements.replaceOption.style.display = hasExistingData() ? 'block' : 'none';
    }
    if (elements.replaceCheckbox) {
        elements.replaceCheckbox.checked = true; // Default to replace
    }
}

// ============================================================================
// File Handling
// ============================================================================

async function handleFile(file) {
    // Validate file type (data imports only - JSON chart imports are in Chart Explorer)
    const validExtensions = ['.csv', '.xlsx', '.xls', '.ods'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (!validExtensions.includes(ext)) {
        createToast({
            message: 'Invalid file type. Use CSV or Excel files for data import.',
            duration: 3000,
            position: 'top-right'
        });
        return;
    }

    try {
        // Show progress state
        showState('progress');

        // Parse file and detect column types
        const data = await prepareImport(file);

        currentFileData = data;
        currentFileName = file.name;

        // Populate mapping dropdowns
        populateMappingDropdowns(data);

        // Show mapping state
        showState('mapping');
        updateFileInfo(file.name, data.rows.length);
        updateTimingRowVisibility();
        updateReplaceOptionVisibility();

    } catch (err) {
        console.error('Import error:', err);
        showState('dropzone');
        createToast({
            message: `Failed to read file: ${err.message}`,
            duration: 4000,
            position: 'top-right'
        });
    }
}

// ============================================================================
// Column Mapping
// ============================================================================

function setupMappingControls() {
    // Dropdowns - update validation and filter other dropdowns on change
    const coreDropdowns = [
        elements.mapDate,
        elements.mapCorrects,
        elements.mapErrors,
        elements.mapTiming
    ];

    coreDropdowns.forEach(dropdown => {
        if (dropdown) {
            dropdown.addEventListener('change', () => {
                updateDropdownOptions();
                updateDropdownStyles();
                validateMapping();
            });
        }
    });

    // Add misc button
    elements.addMiscBtn?.addEventListener('click', () => {
        addMiscColumn();
    });

    // Cancel button
    elements.cancelBtn?.addEventListener('click', () => {
        resetImportUI();
    });

    // Confirm button
    elements.confirmBtn?.addEventListener('click', () => {
        performImport();
    });
}

function populateMappingDropdowns(data) {
    const { columns, dateColumns, numericColumns } = data;

    // Reset misc columns
    miscColumnCount = 0;
    if (elements.miscContainer) {
        elements.miscContainer.innerHTML = '';
    }

    // Date dropdown - prioritize detected date columns
    populateDropdown(elements.mapDate, columns, dateColumns, 'Select');

    // Non-date dropdowns should never show date columns
    const nonDateColumns = columns.filter(c => !dateColumns.includes(c));

    // Numeric dropdowns - prioritize detected numeric columns, exclude date columns
    populateDropdown(elements.mapCorrects, nonDateColumns, numericColumns, 'Select');
    populateDropdown(elements.mapErrors, nonDateColumns, numericColumns, 'Select');
    populateDropdown(elements.mapTiming, nonDateColumns, numericColumns, 'Select');

    // Auto-select if only one date column detected
    if (dateColumns.length === 1) {
        elements.mapDate.value = dateColumns[0];
    }

    // Try to auto-detect columns by common names
    autoSelectByName(elements.mapDate, columns, ['date', 'day', 'time', 'timestamp']);
    autoSelectByName(elements.mapCorrects, columns, ['correct', 'corrects', 'right', 'score', 'count']);
    autoSelectByName(elements.mapErrors, columns, ['error', 'errors', 'incorrect', 'wrong', 'mistakes']);
    autoSelectByName(elements.mapTiming, columns, ['minute', 'minutes', 'time', 'duration', 'timing', 'floor']);

    updateDropdownOptions();
    updateDropdownStyles();
    validateMapping();
}

function populateDropdown(select, allColumns, priorityColumns, placeholder) {
    if (!select) return;

    select.innerHTML = '';

    // Placeholder
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = placeholder;
    select.appendChild(placeholderOpt);

    // Priority columns first, then others
    const orderedColumns = [
        ...(priorityColumns || []),
        ...allColumns.filter(c => !priorityColumns || !priorityColumns.includes(c))
    ];

    orderedColumns.forEach(col => {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        select.appendChild(opt);
    });
}

function autoSelectByName(select, columns, keywords) {
    if (!select || select.value) return; // Don't override existing selection

    const lowerColumns = columns.map(c => c.toLowerCase());

    for (const keyword of keywords) {
        const idx = lowerColumns.findIndex(c => c.includes(keyword));
        if (idx !== -1) {
            select.value = columns[idx];
            return;
        }
    }
}

function updateDropdownOptions() {
    const selected = [];

    // Collect all selected values
    [elements.mapDate, elements.mapCorrects, elements.mapErrors, elements.mapTiming].forEach(el => {
        if (el?.value) selected.push(el.value);
    });
    document.querySelectorAll('.import-misc-select').forEach(el => {
        if (el.value) selected.push(el.value);
    });

    // Disable selected options in all other dropdowns
    const allDropdowns = [
        elements.mapDate,
        elements.mapCorrects,
        elements.mapErrors,
        elements.mapTiming,
        ...document.querySelectorAll('.import-misc-select')
    ];

    allDropdowns.forEach(dropdown => {
        if (!dropdown) return;
        const myValue = dropdown.value;

        for (const opt of dropdown.options) {
            if (!opt.value) continue; // skip placeholder
            // Disable if selected elsewhere (not in this dropdown)
            opt.disabled = selected.includes(opt.value) && opt.value !== myValue;
        }
    });
}

function updateDropdownStyles() {
    // Core dropdowns
    const dropdowns = [
        elements.mapDate,
        elements.mapCorrects,
        elements.mapErrors,
        elements.mapTiming
    ];

    dropdowns.forEach(dropdown => {
        if (dropdown) {
            if (dropdown.value) {
                dropdown.classList.add('has-value');
            } else {
                dropdown.classList.remove('has-value');
            }
        }
    });

    // Misc dropdowns
    document.querySelectorAll('.import-misc-select').forEach(dropdown => {
        if (dropdown.value) {
            dropdown.classList.add('has-value');
        } else {
            dropdown.classList.remove('has-value');
        }
    });
}

// ============================================================================
// Misc Columns
// ============================================================================

function addMiscColumn() {
    if (!currentFileData || miscColumnCount >= MAX_MISC_COLUMNS) return;

    miscColumnCount++;
    const miscId = `misc${miscColumnCount}`;

    const row = document.createElement('div');
    row.className = 'import-mapping-row import-misc-row';
    row.dataset.miscId = miscId;

    const label = document.createElement('label');
    label.className = 'import-mapping-label';
    label.textContent = `Misc ${miscColumnCount}`;

    const select = document.createElement('select');
    select.className = 'import-mapping-select import-misc-select';
    select.id = `import-map-${miscId}`;

    // Populate with non-date columns (no priority for misc)
    const nonDateColumns = currentFileData.columns.filter(
        c => !currentFileData.dateColumns.includes(c)
    );
    populateDropdown(select, nonDateColumns, [], 'Select');

    select.addEventListener('change', () => {
        updateDropdownOptions();
        updateDropdownStyles();
        validateMapping();
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'import-remove-misc-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => {
        row.remove();
        validateMapping();
    });

    row.appendChild(label);
    row.appendChild(select);
    row.appendChild(removeBtn);

    elements.miscContainer?.appendChild(row);
}

function getMiscColumnMappings() {
    const miscMappings = {};
    document.querySelectorAll('.import-misc-row').forEach(row => {
        const miscId = row.dataset.miscId;
        const select = row.querySelector('select');
        if (select && select.value) {
            miscMappings[miscId] = select.value;
        }
    });
    return miscMappings;
}

// ============================================================================
// Validation
// ============================================================================

function validateMapping() {
    const dateCol = elements.mapDate?.value;
    const correctsCol = elements.mapCorrects?.value;
    const errorsCol = elements.mapErrors?.value;
    const timingCol = elements.mapTiming?.value;

    let valid = true;

    // Date is required
    if (!dateCol) {
        valid = false;
    }
    // At least one data series required (corrects, errors, or misc)
    else if (!correctsCol && !errorsCol && Object.keys(getMiscColumnMappings()).length === 0) {
        valid = false;
    }
    // Minutes required for minute charts
    else if (chartState.minuteChart && !timingCol) {
        valid = false;
    }
    // Check for duplicate selections
    else {
        const selected = [
            dateCol,
            correctsCol,
            errorsCol,
            chartState.minuteChart ? timingCol : null,
            ...Object.values(getMiscColumnMappings())
        ].filter(Boolean);

        const unique = new Set(selected);
        if (selected.length !== unique.size) {
            valid = false;
        }
    }

    // Update UI
    if (elements.confirmBtn) {
        elements.confirmBtn.disabled = !valid;
    }

    return valid;
}

// ============================================================================
// Import Execution
// ============================================================================

/**
 * Update series display names from the CSV column names in the column map.
 * Sets traceStyles seriesName for each mapped series so the chart legend
 * and series nav show the original column header instead of generic defaults.
 */
function updateSeriesDisplayNames(columnMap) {
    if (columnMap.corrects) {
        const configs = chartState.traceStyles[CORRECTS];
        if (configs) {
            Object.values(configs).forEach(cfg => { cfg.seriesName = columnMap.corrects; });
        }
    }
    if (columnMap.errors) {
        const configs = chartState.traceStyles[ERRORS];
        if (configs) {
            Object.values(configs).forEach(cfg => { cfg.seriesName = columnMap.errors; });
        }
    }
    for (const [miscId, colName] of Object.entries(columnMap.misc || {})) {
        const configs = chartState.traceStyles.misc[miscId];
        if (configs) {
            Object.values(configs).forEach(cfg => { cfg.seriesName = colName; });
        }
    }
}

async function performImport() {
    if (!currentFileData || !validateMapping()) return;

    const columnMap = {
        date: elements.mapDate?.value,
        corrects: elements.mapCorrects?.value || null,
        errors: elements.mapErrors?.value || null,
        timing: chartState.minuteChart ? (elements.mapTiming?.value || null) : null,
        misc: getMiscColumnMappings()
    };

    try {
        showState('progress');

        // Clean and validate data
        const { valid, invalid, errors } = cleanImportData(currentFileData.rows, columnMap);

        if (valid.length === 0) {
            throw new Error(errors.join('. ') || 'No valid data found');
        }

        // Import to chartState (does NOT emit events — we do that below after setup)
        const shouldReplace = !hasExistingData() || elements.replaceCheckbox?.checked !== false;
        const result = importToChartState(valid, { replace: shouldReplace });

        if (result.success) {
            // Set display names BEFORE any events fire
            updateSeriesDisplayNames(columnMap);

            // Auto-aggregate if multiple data points map to the same x-position
            // (e.g. monthly data on a yearly chart → 12 points/year)
            autoAggregateImport();

            // Notify bus that traceStyles were mutated (names + aggregation)
            eventBus.emit(EVENTS.UI_TRACE_STYLE_CHANGED);

            // NOW emit events — chart renders with correct names and aggregation
            eventBus.emit(EVENTS.DATA_IMPORT_COMPLETED, {
                count: result.count,
                replaced: shouldReplace
            });
            eventBus.emit(EVENTS.DATA_CHART_REFRESH);

            // Show success message
            let message = `Imported ${result.count} entries`;
            if (invalid.length > 0) {
                message += ` (${invalid.length} skipped)`;
            }

            createToast({
                message,
                duration: 3000,
                position: 'top-right'
            });

            // Reset UI back to dropzone
            resetImportUI();

        } else {
            throw new Error(result.message || 'Import failed');
        }

    } catch (err) {
        console.error('Import error:', err);
        showState('mapping');
        createToast({
            message: err.message,
            duration: 4000,
            position: 'top-right'
        });
    }
}

/**
 * Check if imported data has multiple points per x-position (due to chart-type binning)
 * and switch from raw to median aggregation if so.
 */
function autoAggregateImport() {
    const xPositions = timestampsToXPositions(chartState.series.xValues);
    const xCounts = new Map();
    xPositions.forEach(x => xCounts.set(x, (xCounts.get(x) || 0) + 1));
    const maxPerX = xCounts.size > 0 ? Math.max(...xCounts.values()) : 0;

    if (maxPerX <= 1) return;

    // Multiple points per position — switch onXAgg from "raw" to "median"
    // (counter keys stay the same — no key renaming needed)
    const promote = (styles) => {
        if (!styles) return;
        Object.values(styles).forEach(config => {
            if (config.onXAgg === 'raw') {
                config.onXAgg = 'median';
            }
        });
    };

    promote(chartState.traceStyles[CORRECTS]);
    promote(chartState.traceStyles[ERRORS]);
    promote(chartState.traceStyles.timing);
    for (const configs of Object.values(chartState.traceStyles.misc)) {
        promote(configs);
    }
}

// ============================================================================
// UI State Management
// ============================================================================

function showState(state) {
    const states = {
        dropzone: elements.dropzoneState,
        mapping: elements.mappingState,
        progress: elements.progressState
    };

    Object.entries(states).forEach(([key, el]) => {
        if (el) {
            el.style.display = key === state ? 'flex' : 'none';
        }
    });
}

function updateFileInfo(filename, rowCount) {
    if (elements.fileInfo) {
        elements.fileInfo.textContent = `${filename} (${rowCount} rows)`;
    }
}

function resetImportUI() {
    currentFileData = null;
    currentFileName = null;
    miscColumnCount = 0;

    // Reset dropdowns
    [elements.mapDate, elements.mapCorrects, elements.mapErrors, elements.mapTiming].forEach(el => {
        if (el) {
            el.value = '';
            el.classList.remove('has-value');
        }
    });

    // Clear misc columns
    if (elements.miscContainer) {
        elements.miscContainer.innerHTML = '';
    }

    // Disable confirm button
    if (elements.confirmBtn) {
        elements.confirmBtn.disabled = true;
    }

    // Show dropzone state
    showState('dropzone');
}

// ============================================================================
// Event Subscriptions
// ============================================================================

function setupEventSubscriptions() {
    // Listen for import failures
    eventBus.subscribe(EVENTS.DATA_IMPORT_FAILED, (data) => {
        console.error('[ImportUI] Import failed:', data);
    }, true);
}
