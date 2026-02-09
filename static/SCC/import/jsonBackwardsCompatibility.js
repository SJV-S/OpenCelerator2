import { chartState } from '../chartState.js';
import { CORRECTS, ERRORS, TIMING, LINE_DEFAULTS, COLORS } from '../config.js';
import { generateChartKey } from '../../Server/crypto.js';

// Keys whose contents are dynamic user data, not structural schema.
// fillMissing backfills these wholesale if absent, but never recurses into them.
const NO_RECURSE_KEYS = ['traceStyles'];

function fillMissing(target, reference, skipKeys = ['id', '_createdAt', 'lastModified']) {
    for (const key in reference) {
        if (skipKeys.includes(key)) continue;
        if (!(key in target) || target[key] == null) {
            target[key] = reference[key];
        } else if (typeof reference[key] === 'object' && reference[key] !== null && !Array.isArray(reference[key]) && !NO_RECURSE_KEYS.includes(key)) {
            fillMissing(target[key], reference[key], []);
        }
    }
}

/**
 * Migrate renamed trace config properties within a single config object.
 * - markerFaceColor → markerColor
 * - textSize → markerSize
 */
function migrateTraceConfig(config) {
    if (!config || typeof config !== 'object') return;

    // markerFaceColor → markerColor
    if ('markerFaceColor' in config && !('markerColor' in config)) {
        config.markerColor = config.markerFaceColor;
        delete config.markerFaceColor;
    }

    // textSize → markerSize (used in errors/timing)
    if ('textSize' in config && !('markerSize' in config)) {
        config.markerSize = config.textSize;
        delete config.textSize;
    }
}

/**
 * Migrate all trace configs in traceStyles (handles nested aggregation structure)
 */
function migrateTraceStyles(traceStyles) {
    if (!traceStyles || typeof traceStyles !== 'object') return;

    // Fixed series: corrects, errors, timing
    for (const seriesName of ['corrects', 'errors', 'timing']) {
        if (traceStyles[seriesName]) {
            for (const aggType of Object.keys(traceStyles[seriesName])) {
                migrateTraceConfig(traceStyles[seriesName][aggType]);
            }
        }
    }

    // Dynamic misc series
    if (traceStyles.misc) {
        for (const miscId of Object.keys(traceStyles.misc)) {
            for (const aggType of Object.keys(traceStyles.misc[miscId])) {
                migrateTraceConfig(traceStyles.misc[miscId][aggType]);
            }
        }
    }
}

export async function jsonBackwardsCompatibilityCheck(loadedChart) {
    let modified = false;

    // Migrate renamed properties before fillMissing
    migrateTraceStyles(loadedChart.traceStyles);

    // Generate chartKey for old charts that don't have one
    if (!loadedChart.chartKey) {
        const cryptoKey = await generateChartKey();
        const raw = await crypto.subtle.exportKey('raw', cryptoKey);
        loadedChart.chartKey = Array.from(new Uint8Array(raw))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        modified = true;
    }

    // Backfill style object on existing CelLines entries with concrete defaults
    if (loadedChart.CelLines) {
        for (const [key, entry] of Object.entries(loadedChart.CelLines)) {
            if (key === 'settings' || typeof entry !== 'object') continue;
            if (!entry.style) {
                const sk = entry.seriesKey;
                let color = 'black';
                if (sk === CORRECTS) color = COLORS.TREND_CORRECTS;
                else if (sk === ERRORS) color = COLORS.TREND_ERRORS;
                else if (sk === TIMING) color = COLORS.TREND_TIMING;
                entry.style = {
                    color,
                    width: LINE_DEFAULTS.TREND_WIDTH,
                    dash: 'solid',
                    bounceColor: color,
                    bounceWidth: 1,
                    bounceDash: 'dot'
                };
                modified = true;
            } else {
                // Backfill bounce fields added after initial style migration
                if (entry.style.bounceColor == null) {
                    entry.style.bounceColor = entry.style.color;
                    modified = true;
                }
                if (entry.style.bounceWidth == null) {
                    entry.style.bounceWidth = 1;
                    modified = true;
                }
                if (entry.style.bounceDash == null) {
                    entry.style.bounceDash = 'dot';
                    modified = true;
                }
            }
        }
    }

    // Backfill style object on existing PhaseLines entries
    if (loadedChart.PhaseLines) {
        for (const entry of Object.values(loadedChart.PhaseLines)) {
            if (!entry || typeof entry !== 'object' || !entry.id) continue;
            if (!entry.style) {
                entry.style = {
                    color: COLORS.PHASE_LINE,
                    width: LINE_DEFAULTS.PHASE_WIDTH,
                    dash: 'solid',
                    fontColor: COLORS.PHASE_LINE,
                    fontSize: 12
                };
                modified = true;
            } else {
                if (entry.style.dash == null) {
                    entry.style.dash = 'solid';
                    modified = true;
                }
                if (entry.style.fontColor == null) {
                    entry.style.fontColor = entry.style.color || COLORS.PHASE_LINE;
                    modified = true;
                }
                if (entry.style.fontSize == null) {
                    entry.style.fontSize = 12;
                    modified = true;
                }
            }
        }
    }

    // Backfill style object on existing AimLines entries
    if (loadedChart.AimLines) {
        for (const entry of Object.values(loadedChart.AimLines)) {
            if (!entry || typeof entry !== 'object' || !entry.id) continue;
            if (!entry.style) {
                entry.style = {
                    color: COLORS.AIM_LINE,
                    width: LINE_DEFAULTS.AIM_WIDTH,
                    dash: 'solid',
                    fontColor: COLORS.AIM_LINE,
                    fontSize: 12
                };
                modified = true;
            } else {
                if (entry.style.dash == null) {
                    entry.style.dash = 'solid';
                    modified = true;
                }
                if (entry.style.fontColor == null) {
                    entry.style.fontColor = entry.style.color || COLORS.AIM_LINE;
                    modified = true;
                }
                if (entry.style.fontSize == null) {
                    entry.style.fontSize = 12;
                    modified = true;
                }
            }
        }
    }

    // Migrate lineVisibility.grid from boolean to per-component object
    if (typeof loadedChart.lineVisibility?.grid === 'boolean') {
        const val = loadedChart.lineVisibility.grid;
        loadedChart.lineVisibility.grid = { dateLines: val, countLines: val, minorGrid: val };
        modified = true;
    }

    // Migrate '__NaN__' strings to null in series arrays (old serialization format)
    if (loadedChart.series) {
        const migrateArray = (arr) => {
            if (!Array.isArray(arr)) return false;
            let changed = false;
            for (let i = 0; i < arr.length; i++) {
                if (arr[i] === '__NaN__') {
                    arr[i] = null;
                    changed = true;
                }
            }
            return changed;
        };

        if (migrateArray(loadedChart.series.corrects)) modified = true;
        if (migrateArray(loadedChart.series.errors)) modified = true;
        if (migrateArray(loadedChart.series.timing)) modified = true;
        if (loadedChart.series.misc) {
            for (const arr of Object.values(loadedChart.series.misc)) {
                if (migrateArray(arr)) modified = true;
            }
        }
    }

    // Track keys before fillMissing
    const keysBefore = Object.keys(loadedChart).length;
    fillMissing(loadedChart, chartState);
    if (Object.keys(loadedChart).length !== keysBefore) {
        modified = true;
    }

    return modified;
}