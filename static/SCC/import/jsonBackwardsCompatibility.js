import { chartState } from '../chartState.js';

function fillMissing(target, reference) {
    for (const key in reference) {
        if (!(key in target) || target[key] == null || typeof target[key] !== typeof reference[key]) {
            target[key] = reference[key];
        } else if (typeof reference[key] === 'object' && !Array.isArray(reference[key])) {
            fillMissing(target[key], reference[key]);
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

export function jsonBackwardsCompatibilityCheck(loadedChart) {
    // Migrate renamed properties before fillMissing
    migrateTraceStyles(loadedChart.traceStyles);

    fillMissing(loadedChart, chartState);
}