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
 */
export const CURRENT_SCHEMA_VERSION = 1;

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

// ============================================================================
// Migration Registry
// ============================================================================

/**
 * Ordered array of migration functions. Index = source version.
 * migrations[0] migrates 0 → 1, migrations[1] migrates 1 → 2, etc.
 */
const migrations = [
    migrate_0_to_1,
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
