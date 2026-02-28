// ============================================================================
// Schema Version
// ============================================================================

/**
 * Current schema version. Bump this and add a migration function below
 * whenever chartState's shape changes.
 *
 * Version history:
 *   0: Initial schema — traceStyles keyed by aggType string ("raw", "median", etc.)
 *   1: Counter-based traceStyles keys ("0", "1", ...) with explicit onXAgg / acrossXAgg
 *   2: Add collaborators array for edit-link recipients
 *   3: Remove CelLines.settings (moved to IDB user_preferences)
 *   4: Add detrend: null to all trace configs (feature later removed; property is now dead)
 *   5: Add aggId: "0" to all CelLines entries (trendlines track specific aggregation)
 *   6: Convert flat seriesVisibility to nested { baseKey: { aggId: bool } }
 */
export const CURRENT_SCHEMA_VERSION = 6;

// ============================================================================
// Migration Functions
// ============================================================================

/**
 * Migration 0 → 1: Convert traceStyles from aggType-string keys to counter-based keys
 * with explicit onXAgg / acrossXAgg properties.
 *
 * Before: traceStyles.corrects = { "raw": {...}, "median": {...} }
 * After:  traceStyles.corrects = { "0": {..., onXAgg: "raw", acrossXAgg: null},
 *                                   "1": {..., onXAgg: "median", acrossXAgg: null} }
 *
 * Also renames seriesVisibility keys: "corrects_raw" → "corrects_0", etc.
 */
async function migrate_0_to_1(chart) {
    let modified = false;
    const traceStyles = chart.traceStyles;
    if (!traceStyles) return modified;

    // Map: seriesKey → { oldAggType → newCounterId }  (used to remap seriesVisibility)
    const keyMapping = {};

    /**
     * Convert one series' aggConfigs object from string keys to counter keys
     */
    function convertSeries(seriesKey, configs) {
        if (!configs || typeof configs !== 'object') return;

        const oldKeys = Object.keys(configs);
        // Already migrated if keys are numeric
        if (oldKeys.length > 0 && oldKeys.every(k => /^\d+$/.test(k))) return;

        const mapping = {};
        let counter = 0;
        const newConfigs = {};

        for (const aggType of oldKeys) {
            const id = String(counter);
            mapping[aggType] = id;
            newConfigs[id] = {
                ...configs[aggType],
                onXAgg: aggType,
                acrossXAgg: null
            };
            counter++;
        }

        // Replace in-place
        for (const key of oldKeys) delete configs[key];
        Object.assign(configs, newConfigs);

        keyMapping[seriesKey] = mapping;
        modified = true;
    }

    // Fixed series
    for (const seriesKey of ['corrects', 'errors', 'timing']) {
        if (traceStyles[seriesKey]) {
            convertSeries(seriesKey, traceStyles[seriesKey]);
        }
    }

    // Misc series
    if (traceStyles.misc && typeof traceStyles.misc === 'object') {
        for (const miscId of Object.keys(traceStyles.misc)) {
            convertSeries(miscId, traceStyles.misc[miscId]);
        }
    }

    // Remap seriesVisibility keys
    if (chart.seriesVisibility && modified) {
        const oldVis = { ...chart.seriesVisibility };
        const newVis = {};

        for (const [oldKey, value] of Object.entries(oldVis)) {
            // Parse "corrects_raw" → baseKey="corrects", aggPart="raw"
            const underscoreIdx = oldKey.indexOf('_');
            if (underscoreIdx === -1) {
                // No underscore — keep as-is
                newVis[oldKey] = value;
                continue;
            }

            const baseKey = oldKey.slice(0, underscoreIdx);
            const aggPart = oldKey.slice(underscoreIdx + 1);

            const mapping = keyMapping[baseKey];
            if (mapping && mapping[aggPart] !== undefined) {
                newVis[`${baseKey}_${mapping[aggPart]}`] = value;
            } else {
                // No mapping found — keep as-is (shouldn't happen for well-formed data)
                newVis[oldKey] = value;
            }
        }

        chart.seriesVisibility = newVis;
    }

    return modified;
}

/**
 * Migration 1 → 2: Add collaborators array for edit-link recipients.
 *
 * Before: no collaborators field
 * After:  collaborators: []
 */
async function migrate_1_to_2(chart) {
    if (Array.isArray(chart.collaborators)) return false;
    chart.collaborators = [];
    return true;
}

/**
 * Migration 2 → 3: Remove CelLines.settings (moved to IDB user_preferences).
 *
 * Before: CelLines.settings = { fitMethod, bounceEnvelope, forecast, labelFormat }
 * After:  CelLines only contains line entries keyed by ID
 */
async function migrate_2_to_3(chart) {
    if (!chart.CelLines || !chart.CelLines.settings) return false;
    delete chart.CelLines.settings;
    return true;
}

/**
 * Migration 3 → 4: Add detrend: null to all trace configs.
 *
 * Before: trace configs have onXAgg + acrossXAgg only
 * After:  trace configs also have detrend: null
 */
async function migrate_3_to_4(chart) {
    let modified = false;
    const traceStyles = chart.traceStyles;
    if (!traceStyles) return modified;

    function addDetrendToConfigs(configs) {
        if (!configs || typeof configs !== 'object') return;
        for (const aggId of Object.keys(configs)) {
            const cfg = configs[aggId];
            if (cfg && typeof cfg === 'object' && !('detrend' in cfg)) {
                cfg.detrend = null;
                modified = true;
            }
        }
    }

    // Fixed series
    for (const seriesKey of ['corrects', 'errors', 'timing']) {
        if (traceStyles[seriesKey]) {
            addDetrendToConfigs(traceStyles[seriesKey]);
        }
    }

    // Misc series (nested: misc[miscId][aggId])
    if (traceStyles.misc && typeof traceStyles.misc === 'object') {
        for (const miscId of Object.keys(traceStyles.misc)) {
            addDetrendToConfigs(traceStyles.misc[miscId]);
        }
    }

    return modified;
}

/**
 * Migration 4 → 5: Add aggId to all CelLines entries.
 *
 * Cel lines are fitted on a specific aggregation's data. Before this
 * migration the aggId was implicit (always "0"). Now it's stored
 * explicitly so trendlines can be fitted on any aggregation (raw,
 * rolling window, residuals, etc.) and their visibility tracks the
 * correct series+agg combination.
 *
 * Before: CelLines[id] = { seriesKey, ... }           (no aggId)
 * After:  CelLines[id] = { seriesKey, aggId: "0", ... }
 */
async function migrate_4_to_5(chart) {
    if (!chart.CelLines || typeof chart.CelLines !== 'object') return false;
    let modified = false;
    for (const entry of Object.values(chart.CelLines)) {
        if (entry && typeof entry === 'object' && !('aggId' in entry)) {
            entry.aggId = '0';
            modified = true;
        }
    }
    return modified;
}

/**
 * Migration 5 → 6: Convert flat seriesVisibility to nested structure.
 *
 * Before: { "corrects_0": true, "misc1_2": false }
 * After:  { corrects: { "0": true }, misc1: { "2": false } }
 *
 * Parses each key with lastIndexOf('_') — this is the last place that
 * compound-key parsing ever runs.
 */
async function migrate_5_to_6(chart) {
    if (!chart.seriesVisibility || typeof chart.seriesVisibility !== 'object') return false;

    const flat = chart.seriesVisibility;
    const keys = Object.keys(flat);
    if (keys.length === 0) return false;

    // Check if already nested (first value is an object, not a boolean)
    const firstVal = flat[keys[0]];
    if (firstVal !== null && typeof firstVal === 'object') return false;

    const nested = {};
    for (const [compoundKey, value] of Object.entries(flat)) {
        const idx = compoundKey.lastIndexOf('_');
        if (idx === -1) continue; // malformed — skip
        const baseKey = compoundKey.slice(0, idx);
        const aggId = compoundKey.slice(idx + 1);
        if (!nested[baseKey]) nested[baseKey] = {};
        nested[baseKey][aggId] = value;
    }

    chart.seriesVisibility = nested;
    return true;
}

// ============================================================================
// Migration Registry
// ============================================================================

/**
 * Ordered array of migration functions. Index = source version.
 * migrations[0] migrates 0 → 1, migrations[1] migrates 1 → 2, etc.
 */
const migrations = [
    migrate_0_to_1,
    migrate_1_to_2,
    migrate_2_to_3,
    migrate_3_to_4,
    migrate_4_to_5,
    migrate_5_to_6,
];

// ============================================================================
// Migration Runner
// ============================================================================

/**
 * Run all needed migrations on a loaded chart object.
 * Charts without _schemaVersion are treated as version 0.
 *
 * @param {object} chart - The chart data object (mutated in place)
 * @returns {Promise<boolean>} true if any migration ran (chart needs re-saving)
 */
export async function migrateChart(chart) {
    const startVersion = chart._schemaVersion || 0;
    let modified = false;

    for (let v = startVersion; v < CURRENT_SCHEMA_VERSION; v++) {
        const migrateFn = migrations[v];
        if (!migrateFn) {
            console.error(`[Migration] No migration function for version ${v} → ${v + 1}`);
            break;
        }
        const changed = await migrateFn(chart);
        if (changed) modified = true;
    }

    if (startVersion < CURRENT_SCHEMA_VERSION) {
        chart._schemaVersion = CURRENT_SCHEMA_VERSION;
        modified = true;
    }

    return modified;
}
