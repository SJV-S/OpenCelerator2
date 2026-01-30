/**
 * Debug utilities - exposes internals to window for console access
 */

import { chartState } from './chartState.js';

window.chartState = chartState;
