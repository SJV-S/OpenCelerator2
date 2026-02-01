/**
 * Application Configuration
 */

export const CORRECTS = 'corrects';
export const ERRORS = 'errors';
export const TIMING = 'timing';

// Auto-aggregation threshold: if any x-position has more than this many
// y-values when using 'raw' aggregation, auto-switch to median
export const AUTO_AGG_THRESHOLD = 10;