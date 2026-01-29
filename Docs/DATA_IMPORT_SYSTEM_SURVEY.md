# Data Import System Survey: Spreadsheet Import for Raw Data

> **Purpose**: This document provides a detailed technical survey of the data import system in the OpenCelerator application. It is intended to enable another AI or developer to implement a similar data import system in a JavaScript application.
>
> **Important Caveat**: Some behaviors documented here are specific to this application's domain (behavioral charting with "celeration" metrics). When re-implementing, carefully evaluate which patterns are universally applicable versus domain-specific.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Format Support](#2-file-format-support)
3. [Column Mapping System](#3-column-mapping-system)
4. [Data Cleaning and Validation](#4-data-cleaning-and-validation)
5. [UX Considerations](#5-ux-considerations)
6. [Backend Processing Pipeline](#6-backend-processing-pipeline)
7. [Database Storage](#7-database-storage)
8. [JavaScript Implementation Guide](#8-javascript-implementation-guide)

---

## 1. Architecture Overview

### Core Components

The data import system consists of these interconnected components:

```
User Action (File Selection)
       ↓
EventHandlers.import_data()
       ↓
DataManager.column_mapped_raw_data_import()
       ↓
DataColumnMappingDialog (UI) ←→ User Column Selection
       ↓
Data Cleaning Pipeline
       ↓
df_raw (in-memory DataFrame)
       ↓
SQLiteManager.save_complete_chart() → Database
```

### Key Files and Their Responsibilities

| File | Responsibility |
|------|----------------|
| `DataManager.py` | Core data processing, file reading, validation, cleaning |
| `Popups.py` | UI dialogs (column mapping, spreadsheet editor) |
| `app.py` | Event handlers, file selection dialogs |
| `database.py` | Persistence layer, chart storage/retrieval |
| `EventStateManager.py` | Pub/sub event system for decoupled communication |

---

## 2. File Format Support

### Supported Formats

```python
# From app.py:1295-1297 (EventHandlers.select_import_path)
file_path, _ = QFileDialog.getOpenFileName(
    self.chart_app,
    'Select data set',
    import_folder,
    'CSV, Excel, ODS files (*.csv *.xls *.xlsx *.ods)'
)
```

**Supported extensions**:
- `.csv` - Comma-separated values
- `.xlsx` - Excel Open XML (modern Excel)
- `.xls` - Excel 97-2003 format
- `.ods` - OpenDocument Spreadsheet (LibreOffice)

### File Reading Logic

```python
# From DataManager.py:516-529
def get_df_from_data_file(self, file_path, row_limit=None):
    if file_path:
        ext = Path(file_path).suffix
        if ext in ['.xlsx', '.xls', '.ods']:
            # Try Excel reader first
            df = self.read_file_safely(file_path, self.read_excel, row_limit)
            if df is None:
                # Fallback to CSV reader (handles edge cases)
                df = self.read_file_safely(file_path, self.read_csv, row_limit)
        else:
            # Default to CSV for .csv and unknown extensions
            df = self.read_file_safely(file_path, self.read_csv, row_limit)

        if df is None:
            raise Warning('Failed to read data file.')
        return df
```

**Key Pattern**: The system uses a **fallback strategy** - if the primary reader fails, it tries an alternative. This handles edge cases where Excel files may be saved with wrong extensions.

```python
# Safe reading wrapper with error handling
# From DataManager.py:504-508
def read_file_safely(self, file_path, read_function, row_limit=None):
    try:
        return read_function(file_path, row_limit)
    except Exception:
        return None
```

> **Application-Specific**: The fallback from Excel to CSV reader is a robustness measure. In JavaScript, consider using similar fallback patterns with libraries like `xlsx` and `papaparse`.

---

## 3. Column Mapping System

### Overview

The column mapping system allows users to specify which spreadsheet columns correspond to which data types. This is critical because spreadsheet column names are arbitrary.

### System Column Names (Internal)

```python
# Internal system column identifiers
'd'  - Date column
'c'  - Count increase (positive metric)
'i'  - Count decrease (negative metric)
'm'  - Minutes/floor (time duration)
'o0', 'o1', 'o2', ...  - Other/miscellaneous columns
```

> **Application-Specific**: The `c`, `i`, `m` naming convention is specific to behavioral charting. Your JavaScript implementation should define its own semantic column types based on your domain.

### Column Map Structure

```python
# From DataManager.py:194-198
'column_map': {
    'd': 'dates',          # user's column name for dates
    'm': 'minutes',        # user's column name for time
    'c': 'corrects',       # user's column name for positive counts
    'i': 'incorrects',     # user's column name for negative counts
    'o1': 'other'          # user's column name for misc data
}
```

### Column Type Auto-Detection

The system uses **lazy evaluation with regex patterns** to auto-detect column types:

```python
# From Popups.py:1091-1092
date_pattern = r'^(?=.*\d{2})(?:[^-/.\n]*[-/.]){2,}[^-/.\n]*$'
numeric_pattern = r'^\s*-?\d+(\.\d+)?\s*$'
```

**Detection Algorithm** (Popups.py:1313-1366):

```python
def _lazy_check(self, df, pattern, threshold=0.8, check_limit=10, date_check=False):
    """
    Lazy evaluation: only check first N rows to determine column type.

    Args:
        df: DataFrame to analyze
        pattern: Regex pattern to match
        threshold: Percentage of cells that must match (default 80%)
        check_limit: Maximum rows to check (default 10)
        date_check: Whether this is for date detection
    """
    matching_columns = []

    # For numeric detection, exclude already-identified date columns
    cols_to_check = df.columns if date_check else [
        col for col in df.columns if col not in self.date_columns
    ]

    for col in cols_to_check:
        matches = 0
        to_check = df[col].dropna()[:check_limit]
        total = len(to_check)

        for cell in to_check.astype(str):
            if re.search(pattern, cell):
                matches += 1

        # Column matches if threshold percentage of sampled cells match
        if matches / total > threshold:
            matching_columns.append(col)

    return matching_columns
```

### Partial Date Detection

The system also handles **incomplete dates** (year-only or year-month formats):

```python
# From Popups.py:1329-1364 (partial date detection fallback)
# If standard date pattern fails, try:

# Year-only format: "2024"
if value_str.isdigit() and len(value_str) == 4:
    year = int(value_str)
    if min_valid_year <= year <= max_valid_year:
        matches += 1

# Year/month format: "2024-03" or "03/2024"
parts = value_str.replace('/', '-').replace('.', '-').split('-')
if len(parts) == 2:
    if len(parts[0]) == 4:  # YYYY/MM format
        year, month = int(parts[0]), int(parts[1])
        if 1 <= month <= 12 and min_valid_year <= year <= max_valid_year:
            matches += 1
    elif len(parts[1]) == 4:  # MM/YYYY format
        month, year = int(parts[0]), int(parts[1])
        # ... similar validation
```

> **Universally Applicable**: The lazy evaluation pattern and threshold-based detection are good practices for any data import system.

---

## 4. Data Cleaning and Validation

### Complete Data Cleaning Pipeline

The main cleaning function is `column_mapped_raw_data_import` (DataManager.py:531-611):

```python
def column_mapped_raw_data_import(self, file_path):
    # STEP 1: Read sample data for validation (first 20 rows)
    df = self.get_df_from_data_file(file_path, row_limit=20)
    if df is None:
        return False

    # STEP 2: Validate column map
    if not self._validate_column_map(df):
        # Prompt user to create column map via UI
        self.event_bus.emit('column_map_dialog', file_path)

        # Re-validate after user interaction
        if not self._validate_column_map(df):
            return False

    # STEP 3: Read full dataset (no row limit)
    df = self.get_df_from_data_file(file_path, row_limit=None)

    # STEP 4: Rename columns from user names to system names
    column_map = self.event_bus.emit("get_chart_data", ['column_map', {}])
    df = df.rename(columns=dict(zip(column_map.values(), column_map.keys())))

    # STEP 5: Add missing required columns
    if 'm' not in df.columns:
        df['m'] = 1  # Default floor/minutes value

    # STEP 6: Keep only system columns
    o_cols = [col for col in df.columns if re.match(r'^o\d+$', col)]
    standard_cols = [col for col in df.columns if col in ['m', 'c', 'i', 'd']]
    data_cols = standard_cols + o_cols
    df = df[data_cols]

    # STEP 7: Clean miscellaneous columns
    for col in [c for c in df.columns if c.startswith('o')]:
        # Strip whitespace from string columns
        if df[col].dtype == 'object':
            df[col] = df[col].astype(str).str.strip()

        # Convert to numeric (invalid values become NaN)
        df[col] = pd.to_numeric(df[col], errors='coerce')

        # Remove negative values (domain-specific rule)
        df[col] = df[col].apply(lambda x: np.nan if x < 0 else x)

    # STEP 8: Clean standard columns (c, i, m)
    for col in ['c', 'i', 'm']:
        if col in df.columns:
            if df[col].dtype == 'object':
                df[col] = df[col].astype(str).str.strip()
            df.loc[:, col] = pd.to_numeric(df[col], errors='coerce')
            df.loc[:, col] = df[col].apply(lambda x: np.nan if x < 0 else x)

    # STEP 9: Handle date column
    date_format = self.event_bus.emit("get_chart_data", ['date_format', None])
    if not pd.api.types.is_datetime64_any_dtype(df['d']):
        # Complete partial dates (e.g., "2024" -> "2024-12-31")
        df['d'] = df['d'].astype(str).apply(self._complete_partial_date)

        try:
            df.loc[:, 'd'] = pd.to_datetime(df['d'], format=date_format, errors='coerce')
        except ValueError:
            df['d'] = pd.to_datetime(df['d'], errors='coerce').dt.date

        # Drop rows with invalid dates
        df = df.dropna(subset=['d'])

    # STEP 10: Normalize datetime
    df['d'] = pd.to_datetime(df['d'])
    df['d'] = df['d'].dt.tz_localize(None)  # Remove timezone info

    # STEP 11: Remove empty rows
    df = df.dropna(how='all').reset_index(drop=True)

    # Store cleaned data
    self.df_raw = df
    return True
```

### Column Map Validation

```python
# From DataManager.py:495-502
def _validate_column_map(self, df):
    """Check if column map references valid columns in the DataFrame."""
    column_map = {} if not isinstance(self.chart_data['column_map'], dict) \
                    else self.chart_data['column_map']

    chart_type = self.event_bus.emit("get_chart_data", ['type', 'Daily'])
    is_minute_chart = 'Minute' in chart_type

    # For non-minute charts, 'm' column is optional
    valid_keys = column_map.keys() if is_minute_chart \
                 else [k for k in column_map.keys() if k != 'm']
    valid_column_map = {k: column_map[k] for k in valid_keys}

    # All mapped column names must exist in DataFrame
    return valid_column_map and all(
        col in df.columns for col in valid_column_map.values()
    )
```

### Partial Date Completion

Incomplete dates are normalized to the **last day** of the specified period:

```python
# From DataManager.py:463-493
def _complete_partial_date(self, value_str):
    """Convert partial dates to full dates."""
    value_str = str(value_str).strip()
    min_valid_year = pd.Timestamp.min.year
    max_valid_year = pd.Timestamp.max.year

    # Year-only: "2024" -> "2024-12-31"
    if value_str.isdigit() and len(value_str) == 4:
        year = int(value_str)
        if min_valid_year <= year <= max_valid_year:
            return f"{year}-12-31"

    # Year/month format: "2024-03" -> "2024-03-31" (last day of month)
    parts = value_str.replace('/', '-').replace('.', '-').split('-')
    if len(parts) == 2:
        try:
            if len(parts[0]) == 4:  # YYYY/MM
                year, month = int(parts[0]), int(parts[1])
                if 1 <= month <= 12 and min_valid_year <= year <= max_valid_year:
                    last_day = pd.Timestamp(year, month, 1) + pd.offsets.MonthEnd(1)
                    return last_day.strftime("%Y-%m-%d")
            elif len(parts[1]) == 4:  # MM/YYYY
                month, year = int(parts[0]), int(parts[1])
                if 1 <= month <= 12 and min_valid_year <= year <= max_valid_year:
                    last_day = pd.Timestamp(year, month, 1) + pd.offsets.MonthEnd(1)
                    return last_day.strftime("%Y-%m-%d")
        except ValueError:
            pass

    return value_str  # Return original if not parseable
```

> **Application-Specific**: Using the last day of the period is a domain choice. Your implementation might prefer first day, middle of period, or reject incomplete dates entirely.

---

## 5. UX Considerations

### Column Mapping Dialog UI

The `DataColumnMappingDialog` (Popups.py:1089-1474) provides an interactive UI for column mapping.

#### Field Icons and Explanations

```python
# From Popups.py:1115-1121
self.field_explanations = {
    '📅': 'Date column goes here. Format detected automatically.',
    '⬤': 'Something to increase (positive metric).',
    '✕': 'Something to decrease (negative metric).',
    '⧖': 'Minutes/floor. The inverse is charted automatically.',
    'date_format': 'Date format could not be inferred. Manual selection required.',
}
```

#### Preventing Duplicate Column Selection

When a column is selected in one dropdown, it's removed from other dropdowns:

```python
# From Popups.py:1368-1397
def on_dropdown_changed(self, field_changed):
    """Update available options in other dropdowns when selection changes."""

    # Block signals to prevent recursive updates
    for dropdown in self.dropdowns_dict.values():
        dropdown.blockSignals(True)

    # Collect all currently selected columns
    all_selected_columns = []
    for field in self.dropdowns_dict.keys():
        selected_column = self.dropdowns_dict[field].currentText()
        if selected_column != self.column_placeholder:
            all_selected_columns.append(selected_column)

    # Update other dropdowns to exclude selected columns
    for field in self.dropdowns_dict.keys():
        if field != field_changed:
            dropdown = self.dropdowns_dict[field]
            selected = dropdown.currentText()

            if selected == self.column_placeholder:
                dropdown.clear()
                col_options = [col for col in self.numeric_columns
                              if col not in all_selected_columns]
                new_items = [self.column_placeholder] + col_options
                dropdown.addItems(new_items)

                # Disable dropdown if no options available
                if len(col_options) == 0:
                    dropdown.setEnabled(False)
                    dropdown.setStyleSheet(
                        "QComboBox { background-color: #f0f0f0; color: #808080; }"
                    )
                else:
                    dropdown.setEnabled(True)
                    dropdown.setStyleSheet("QComboBox { background-color: white; }")

    # Re-enable signals
    for dropdown in self.dropdowns_dict.values():
        dropdown.blockSignals(False)
```

> **Universally Applicable**: This UX pattern of excluding already-selected options is essential for any column mapping UI.

#### Date Format Auto-Detection with Fallback

```python
# From Popups.py:1399-1435
def check_date_format_warning(self):
    """Auto-detect date format; show manual selector if detection fails."""
    date_col = self.date_dropdown.currentText()

    if date_col == self.column_placeholder:
        self.format_label.hide()
        self.date_format_row.hide()
        return False

    # Try automatic parsing
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            pd.to_datetime(self.df[date_col])
            falls_back_to_dateutil = any(
                "Could not infer format" in str(warning.message)
                for warning in w
            )
        except Exception:
            falls_back_to_dateutil = True

    if falls_back_to_dateutil:
        # Show manual format selector
        self.format_label.show()
        self.date_format_row.show()

        # Try each known format to find a match
        for label, format_string in self.date_format_map.items():
            sample_date = self.df[date_col].dropna().iloc[0]
            try:
                # Detect separator used (-, /, or .)
                separator = next(char for char in sample_date if char in '/-.')
                adjusted_format = format_string.replace('-', separator)
                pd.to_datetime(self.df[date_col], format=adjusted_format, errors='raise')
                self.date_format_dropdown.setCurrentText(label)
                break
            except Exception:
                continue
    else:
        # Auto-detection succeeded; hide manual controls
        self.format_label.hide()
        self.date_format_row.hide()

    return falls_back_to_dateutil
```

#### Supported Date Formats

```python
# From Popups.py:1094-1101
date_format_map = {
    'YYYY-MM-DD': '%Y-%m-%d',
    'YY-MM-DD': '%y-%m-%d',
    'MM-DD-YYYY': '%m-%d-%Y',
    'MM-DD-YY': '%m-%d-%y',
    'DD-MM-YYYY': '%d-%m-%Y',
    'DD-MM-YY': '%d-%m-%y'
}
```

### Spreadsheet Editor Dialog

The `SpreadsheetDialog` (Popups.py:1926-2224) allows viewing and editing imported data.

#### Live Cell Editing with Type Coercion

```python
# From Popups.py:2071-2105
def _on_item_changed(self, item: QTableWidgetItem):
    """Live write-through: sync cell edits to DataFrame."""
    if self._suppress_item_changed or self.table_df is None:
        return

    sys_col = item.data(Qt.ItemDataRole.UserRole)
    if not sys_col or sys_col == 'd':  # Date is non-editable
        return

    r = item.row()
    text = (item.text() or "").strip()

    # Type coercion based on column type
    if text == "":
        value = pd.NA
    elif sys_col == 'm':  # Minutes column expects float
        try:
            value = float(text)
        except ValueError:
            value = pd.NA
    else:  # Other numeric columns
        try:
            value = int(text)
        except ValueError:
            try:
                value = float(text)
            except ValueError:
                value = text  # Keep as string if not numeric

    # Assign value, upcasting dtype if needed
    try:
        self.table_df.at[r, sys_col] = value
    except Exception:
        self.table_df[sys_col] = self.table_df[sys_col].astype('object')
        self.table_df.at[r, sys_col] = value
```

#### Numeric Input Validation

```python
# From Popups.py:2200-2224
def create_numeric_delegate(self):
    """Create validator for numeric cell editing."""

    class NumericDelegate(QItemDelegate):
        def createEditor(self, parent, option, index):
            editor = QLineEdit(parent)
            header_text = index.model().headerData(
                index.column(), Qt.Orientation.Horizontal
            )

            if header_text == "Minutes":
                # Minutes: 0-1440 range, 2 decimal places
                validator = QDoubleValidator(0, 1440, 2, editor)
                validator.setNotation(QDoubleValidator.Notation.StandardNotation)
            else:
                # Other columns: allow empty strings
                class IntValidator(QIntValidator):
                    def validate(self, input_str, pos):
                        if input_str == "":
                            return (QValidator.State.Acceptable, input_str, pos)
                        return super().validate(input_str, pos)

                validator = IntValidator(0, 999999, editor)

            editor.setValidator(validator)
            return editor

    return NumericDelegate(self)
```

---

## 6. Backend Processing Pipeline

### Event-Driven Architecture

The system uses a pub/sub event bus for loose coupling:

```python
# From DataManager.py:261-264 (Event subscriptions)
self.event_bus.subscribe('column_mapped_raw_data_import',
                         self.column_mapped_raw_data_import, has_data=True)
self.event_bus.subscribe('direct_data_entry',
                         self.direct_data_entry, has_data=True)
```

### Import Workflow Sequence

```python
# From app.py:1305-1323 (EventHandlers.import_data)
def import_data(self, file_path=None):
    # 1. Open file selection dialog
    file_path = self.select_import_path(file_path)
    if not file_path:
        return

    # 2. Clear existing column map for fresh import
    old_column_map = deepcopy(self.data_manager.chart_data['column_map'])
    self.data_manager.chart_data['column_map'] = {}

    # 3. Trigger import pipeline
    data_was_imported = self.event_bus.emit(
        'column_mapped_raw_data_import', file_path
    )

    if data_was_imported:
        # 4. Ensure data is visible (adjust date range)
        start_date = self.data_manager.prevent_blank_chart()

        # 5. Trigger chart update
        self.event_bus.emit('new_chart', start_date)
    else:
        # Restore previous column map on failure
        self.data_manager.chart_data['column_map'] = old_column_map
```

### Data Aggregation for Visualization

After import, data may be aggregated for different time views:

```python
# From DataManager.py:895-946 (DataPointColumn.agg_data_column)
def agg_data_column(self):
    """Aggregate raw data according to current view settings."""
    self.df_raw = self.data_manager.df_raw.copy()

    # Handle empty data
    if self.df_raw.size == 0:
        columns = ['d', 'm', self.sys_col] if self.sys_col != 'm' else ['d', 'm']
        self.df_raw = pd.DataFrame(columns=columns)
    else:
        # Add missing column with default value
        if self.sys_col not in self.df_raw.columns:
            self.df_raw[self.sys_col] = 0

    # Ensure datetime format
    self.df_raw['d'] = pd.to_datetime(self.df_raw['d'])

    # Ensure floor column exists
    if 'm' not in self.df_raw.columns:
        self.df_raw['m'] = 1

    # Get view settings
    agg_type = self.view_settings['agg_type']  # 'raw', 'mean', 'sum', etc.
    calendar_unit = self.view_settings['calendar_group']  # 'D', 'W', 'M', 'Y'

    # Calculate frequency for minute charts
    df_agg = self.df_raw.copy()
    df_agg[self.sys_col + '_total'] = df_agg[self.sys_col]

    chart_type = self.data_manager.event_bus.emit("get_chart_data", ['type', 'Daily'])
    if 'Minute' in chart_type:
        self._calculate_frequency(df_agg)

    # Perform calendar aggregation if not raw view
    if agg_type != 'raw':
        df_agg = self._aggregate_by_calendar(df_agg, calendar_unit, agg_type)

    return df_agg
```

---

## 7. Database Storage

### Data Points Table Schema

Data is stored in a **normalized format** (one row per date+column combination):

```python
# From database.py:633-645 (save_complete_chart)
operations = [
    {'query': f"DELETE FROM {self.db.TABLE_DATA_POINTS} WHERE chart_id = ?",
     'params': (chart_id,)},
]

# Add data point operations
if not df_data.empty:
    data_rows = self._prepare_data_points(chart_id, df_data)
    for row in data_rows:
        operations.append({
            'query': f"""INSERT INTO {self.db.TABLE_DATA_POINTS}
                        (chart_id, date, sys_col, value) VALUES (?, ?, ?, ?)""",
            'params': row  # (chart_id, date, sys_col, value)
        })
```

### Loading Data Back to DataFrame

```python
# From database.py:1298-1333 (_build_dataframe_from_series_table)
def _build_dataframe_from_series_table(self, results):
    """Convert normalized database rows back to DataFrame."""
    if not results:
        return pd.DataFrame()

    # Determine columns from first row group
    sys_col_idx = 2
    all_sys_cols = []
    for r in results:
        sys_col = r[sys_col_idx]
        if sys_col not in all_sys_cols:
            all_sys_cols.append(sys_col)
        else:
            break  # Found duplicate, we have all columns

    n_cols = len(all_sys_cols)
    rows = []

    # Process in chunks of n_cols (one full row per chunk)
    for i in range(0, len(results), n_cols):
        chunk = results[i:i + n_cols]
        if len(chunk) != n_cols:
            continue  # Skip incomplete row

        row = {"d": chunk[0][1]}  # Date from first item
        for r in chunk:
            col = r[2]  # sys_col
            val = r[3]  # value
            row[col] = val
        rows.append(row)

    df = pd.DataFrame(rows)
    df["d"] = pd.to_datetime(df["d"])
    df = df.reset_index(drop=True)

    return df
```

### JSON Import/Export for Portability

```python
# From database.py:938-988 (json_import)
def json_import(self, data):
    """Import JSON file to database."""
    json_file_path = data['json_file_path']
    base_chart_id = data['chart_id']

    # Generate unique chart_id with timestamp
    chart_id = f"{base_chart_id}_{int(time.time())}"

    try:
        with open(json_file_path, 'r') as file:
            loaded_chart = json.load(file)
    except json.JSONDecodeError:
        # Attempt repair of corrupted file
        loaded_chart = self.data_manager.file_manager._repair_corrupted_chart_file(
            json_file_path
        )
    except FileNotFoundError:
        return False

    # Clean and validate chart data
    clean_chart_data = self.data_manager.file_manager.chart_cleaning(
        loaded_chart, chart_id
    )

    # Extract raw_data
    raw_data = clean_chart_data.get('raw_data')
    if not raw_data:
        # Try legacy 'Backup' field
        raw_data = clean_chart_data.get('Backup')
        if raw_data:
            clean_chart_data['raw_data'] = raw_data

    # ... process and save to database
```

---

## 8. JavaScript Implementation Guide

### Recommended Libraries

| Python Component | JavaScript Equivalent |
|-----------------|----------------------|
| `pandas` | `danfojs` or `arquero` |
| `openpyxl` | `xlsx` (SheetJS) |
| `csv` reader | `papaparse` |
| Qt Dialogs | React/Vue/Svelte components |
| SQLite | `sql.js` or IndexedDB |

### Core Data Cleaning Functions (JavaScript)

```javascript
// Lazy column type detection
function lazyCheck(data, pattern, threshold = 0.8, checkLimit = 10) {
    const matchingColumns = [];
    const columns = Object.keys(data[0] || {});

    for (const col of columns) {
        let matches = 0;
        const toCheck = data.slice(0, checkLimit)
            .map(row => row[col])
            .filter(val => val != null && val !== '');
        const total = toCheck.length;

        if (total === 0) continue;

        for (const cell of toCheck) {
            if (pattern.test(String(cell))) {
                matches++;
            }
        }

        if (matches / total >= threshold) {
            matchingColumns.push(col);
        }
    }

    return matchingColumns;
}

// Patterns for detection
const datePattern = /^(?=.*\d{2})(?:[^-/.\n]*[-/.]){2,}[^-/.\n]*$/;
const numericPattern = /^\s*-?\d+(\.\d+)?\s*$/;

// Usage
const dateColumns = lazyCheck(data, datePattern);
const numericColumns = lazyCheck(data, numericPattern);
```

### Data Cleaning Pipeline (JavaScript)

```javascript
async function cleanImportedData(rawData, columnMap, dateFormat = null) {
    // Step 1: Rename columns (user names -> system names)
    const renamedData = rawData.map(row => {
        const newRow = {};
        for (const [sysCol, userCol] of Object.entries(columnMap)) {
            if (row.hasOwnProperty(userCol)) {
                newRow[sysCol] = row[userCol];
            }
        }
        return newRow;
    });

    // Step 2: Add default floor column if missing
    for (const row of renamedData) {
        if (!('m' in row)) {
            row.m = 1;
        }
    }

    // Step 3: Clean numeric columns
    const numericCols = ['c', 'i', 'm', ...Object.keys(renamedData[0])
        .filter(k => /^o\d+$/.test(k))];

    for (const row of renamedData) {
        for (const col of numericCols) {
            if (col in row) {
                // Strip whitespace
                let val = String(row[col]).trim();

                // Parse as number
                const num = parseFloat(val);

                if (isNaN(num) || num < 0) {
                    row[col] = null;  // Use null for NaN
                } else {
                    row[col] = num;
                }
            }
        }
    }

    // Step 4: Parse dates
    for (const row of renamedData) {
        if ('d' in row) {
            row.d = parseDate(row.d, dateFormat);
        }
    }

    // Step 5: Filter out rows with invalid dates
    const validData = renamedData.filter(row => row.d instanceof Date && !isNaN(row.d));

    // Step 6: Filter out completely empty rows
    return validData.filter(row => {
        const values = Object.entries(row)
            .filter(([k]) => k !== 'd')
            .map(([, v]) => v);
        return values.some(v => v != null);
    });
}

function parseDate(value, format) {
    // Handle partial dates
    const str = String(value).trim();

    // Year only: "2024" -> "2024-12-31"
    if (/^\d{4}$/.test(str)) {
        return new Date(`${str}-12-31`);
    }

    // Year-month: "2024-03" -> last day of month
    const yearMonthMatch = str.match(/^(\d{4})[-/.](\d{1,2})$/);
    if (yearMonthMatch) {
        const [, year, month] = yearMonthMatch;
        // Get last day of month
        const date = new Date(year, parseInt(month), 0);
        return date;
    }

    // Standard date parsing
    if (format) {
        // Use date-fns or moment.js for custom format parsing
        return parse(str, format, new Date());
    }

    return new Date(str);
}
```

### Column Mapping UI Component (React Example)

```jsx
function ColumnMappingDialog({ columns, onConfirm, onCancel }) {
    const [columnMap, setColumnMap] = useState({
        d: '',
        c: '',
        i: '',
        m: '',
    });
    const [miscColumns, setMiscColumns] = useState([]);

    // Get available options (exclude already selected)
    const getAvailableOptions = (excludeKey) => {
        const selected = Object.values(columnMap).filter(Boolean);
        const miscSelected = miscColumns.map(mc => mc.column).filter(Boolean);
        const allSelected = [...selected, ...miscSelected];

        return columns.filter(col =>
            !allSelected.includes(col) || columnMap[excludeKey] === col
        );
    };

    const handleChange = (key, value) => {
        setColumnMap(prev => ({
            ...prev,
            [key]: value === 'placeholder' ? '' : value
        }));
    };

    const addMiscColumn = () => {
        setMiscColumns(prev => [
            ...prev,
            { id: `o${prev.length}`, column: '' }
        ]);
    };

    return (
        <div className="column-mapping-dialog">
            <h3>Map Your Data Columns</h3>

            <div className="field-row">
                <label>📅 Date Column:</label>
                <select
                    value={columnMap.d || 'placeholder'}
                    onChange={(e) => handleChange('d', e.target.value)}
                >
                    <option value="placeholder">-- Select Column --</option>
                    {getAvailableOptions('d').map(col => (
                        <option key={col} value={col}>{col}</option>
                    ))}
                </select>
            </div>

            <div className="field-row">
                <label>⬤ Increase Column:</label>
                <select
                    value={columnMap.c || 'placeholder'}
                    onChange={(e) => handleChange('c', e.target.value)}
                >
                    <option value="placeholder">-- Select Column --</option>
                    {getAvailableOptions('c').map(col => (
                        <option key={col} value={col}>{col}</option>
                    ))}
                </select>
            </div>

            {/* Additional fields... */}

            <button onClick={addMiscColumn}>+ Add Column</button>

            <div className="actions">
                <button onClick={() => onConfirm(columnMap, miscColumns)}>
                    Confirm
                </button>
                <button onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );
}
```

### File Reading (JavaScript)

```javascript
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

async function readSpreadsheetFile(file) {
    const extension = file.name.split('.').pop().toLowerCase();

    if (['xlsx', 'xls', 'ods'].includes(extension)) {
        return readExcelFile(file);
    } else {
        return readCSVFile(file);
    }
}

async function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                resolve(jsonData);
            } catch (error) {
                // Fallback to CSV parsing
                readCSVFile(file).then(resolve).catch(reject);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function readCSVFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
            error: reject
        });
    });
}
```

---

## Summary: Key Patterns to Re-implement

### Universally Applicable

1. **Lazy column type detection** with configurable thresholds
2. **Fallback file reading** (try primary format, fallback to alternative)
3. **Progressive validation** (sample first, then full dataset)
4. **Preventing duplicate column selection** in UI
5. **Date format auto-detection** with manual fallback
6. **Whitespace stripping** before numeric conversion
7. **Coercive type conversion** with explicit NaN handling
8. **Event-driven architecture** for loose coupling

### Application-Specific (Evaluate for Your Domain)

1. **Column naming convention** (`c`, `i`, `m`, `o*`) - use domain-appropriate names
2. **Negative value rejection** - may not apply to all domains
3. **Partial date completion** (using last day of period)
4. **Minute/floor column** for rate calculations
5. **Zero count handling** (place below floor vs. hide)
6. **"Minute chart" vs "Daily chart"** type distinction

---

*Generated for JavaScript/TypeScript reimplementation purposes. Last updated based on codebase analysis.*
