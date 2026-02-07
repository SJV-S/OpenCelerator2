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
import { eventBus, EVENTS } from '../eventBus.js';
import {
    prepareImport,
    cleanImportData,
    importToChartState
} from './dataImport.js';
import { createToast } from '../ui/toaster.js';

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
        confirmBtn: document.getElementById('import-confirm-btn')
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

    // Numeric dropdowns - prioritize detected numeric columns
    populateDropdown(elements.mapCorrects, columns, numericColumns, 'Select');
    populateDropdown(elements.mapErrors, columns, numericColumns, 'Select');
    populateDropdown(elements.mapTiming, columns, numericColumns, 'Select');

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

    // Populate with all columns (no priority for misc)
    populateDropdown(select, currentFileData.columns, [], 'Select');

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

        // Import to chartState
        const shouldReplace = !hasExistingData() || elements.replaceCheckbox?.checked !== false;
        const result = importToChartState(valid, { replace: shouldReplace });

        if (result.success) {
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
    // Listen for import completion (for external triggers)
    eventBus.subscribe(EVENTS.DATA_IMPORT_COMPLETED, (data) => {
        console.log('[ImportUI] Import completed:', data);
    }, true);

    // Listen for import failures
    eventBus.subscribe(EVENTS.DATA_IMPORT_FAILED, (data) => {
        console.error('[ImportUI] Import failed:', data);
    }, true);
}
