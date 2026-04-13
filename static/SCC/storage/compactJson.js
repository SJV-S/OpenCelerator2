/**
 * Compact JSON Storage Format
 *
 * Reduces chart JSON size by:
 *   1. Omitting series arrays that are entirely null
 *   2. Replacing constant arrays (every element identical) with the scalar value
 *
 * compactChart() runs at serialization time (before storage/export).
 * expandChart() runs at deserialization time (after load/import).
 * The rest of the codebase never sees the compact format.
 */

const SERIES_KEYS = ['corrects', 'errors', 'timing'];

/**
 * Compact a chart object in place for storage.
 * Shallow-copies chart.series (and .misc) so the live chartState is not mutated.
 */
export function compactChart(chart) {
    if (!chart.series) return;

    const s = { ...chart.series };
    chart.series = s;

    for (const key of SERIES_KEYS) {
        const arr = s[key];
        if (!Array.isArray(arr) || arr.length === 0) continue;
        if (arr.every(v => v === null)) {
            delete s[key];
        } else {
            const first = arr[0];
            if (arr.every(v => v === first)) s[key] = first;
        }
    }

    if (s.misc) {
        s.misc = { ...s.misc };
        for (const key of Object.keys(s.misc)) {
            const arr = s.misc[key];
            if (!Array.isArray(arr) || arr.length === 0) continue;
            // Don't delete all-null misc arrays — their existence is meaningful (user created them).
            // Only collapse constant non-null arrays to a scalar.
            const first = arr[0];
            if (first !== null && arr.every(v => v === first)) s.misc[key] = first;
        }
    }
}

/**
 * Expand a compact chart object back to full arrays in place.
 * Missing keys become null-filled arrays; scalar values become constant arrays.
 * Length is derived from series.xValues.
 */
export function expandChart(data) {
    const s = data.series;
    if (!s) return;

    const len = s.xValues?.length || 0;

    for (const key of SERIES_KEYS) {
        if (!(key in s)) {
            s[key] = Array(len).fill(null);
        } else if (!Array.isArray(s[key])) {
            s[key] = Array(len).fill(s[key]);
        }
    }

    if (s.misc) {
        for (const key of Object.keys(s.misc)) {
            if (!Array.isArray(s.misc[key])) {
                s.misc[key] = Array(len).fill(s.misc[key]);
            }
        }
    }
}
