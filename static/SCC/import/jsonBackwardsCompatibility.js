// ============================================================================
// Schema Version
// ============================================================================

/**
 * Current schema version. Bump this and add a migration function below
 * whenever chartState's shape changes.
 *
 * Version history:
 *   (none yet — version 0 is the initial schema)
 */
export const CURRENT_SCHEMA_VERSION = 0;

// ============================================================================
// Migration Functions
// ============================================================================

// Future migrations go here:
//
// async function migrate_0_to_1(chart) { ... return modified; }

// ============================================================================
// Migration Registry
// ============================================================================

/**
 * Ordered array of migration functions. Index = source version.
 * migrations[0] migrates 0 → 1, migrations[1] migrates 1 → 2, etc.
 */
const migrations = [
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
        console.log(`[Migration] Running ${v} → ${v + 1}`);
        const changed = await migrateFn(chart);
        if (changed) modified = true;
    }

    if (startVersion < CURRENT_SCHEMA_VERSION) {
        chart._schemaVersion = CURRENT_SCHEMA_VERSION;
        modified = true;
    }

    return modified;
}
