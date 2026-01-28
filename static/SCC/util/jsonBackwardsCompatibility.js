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

export function jsonBackwardsCompatibilityCheck(loadedChart) {
    fillMissing(loadedChart, chartState);
}