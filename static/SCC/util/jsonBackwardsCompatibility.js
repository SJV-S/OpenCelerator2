import { chartState } from '../chartState.js';
import { eventBus, EVENTS } from '../eventBus.js';

const snapshot = JSON.parse(JSON.stringify(chartState));

function fillMissing(target, reference) {
    for (const key in reference) {
        if (!(key in target)) {
            target[key] = JSON.parse(JSON.stringify(reference[key]));
        } else if (typeof reference[key] === 'object' && reference[key] !== null && !Array.isArray(reference[key])) {
            fillMissing(target[key], reference[key]);
        }
    }
}

eventBus.subscribe(EVENTS.STORAGE_CHART_LOADED, () => {
    fillMissing(chartState, snapshot);
}, true);