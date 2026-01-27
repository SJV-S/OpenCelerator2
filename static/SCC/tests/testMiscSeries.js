/**
 * Test Script for Dynamic Misc Series
 *
 * Run in browser console after loading the chart page:
 * import('/static/SCC/tests/testMiscSeries.js').then(m => m.runAllTests())
 */

import { chartState } from '../chartState.js';
import {
    addMiscSeries,
    removeMiscSeries,
    getMiscSeriesIds,
    canAddMiscSeries,
    getNextMiscId
} from '../series/miscSeries.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`✓ ${message}`);
        passed++;
    } else {
        console.error(`✗ ${message}`);
        failed++;
    }
}

function assertEqual(actual, expected, message) {
    const condition = JSON.stringify(actual) === JSON.stringify(expected);
    if (condition) {
        console.log(`✓ ${message}`);
        passed++;
    } else {
        console.error(`✗ ${message}`);
        console.error(`  Expected: ${JSON.stringify(expected)}`);
        console.error(`  Actual: ${JSON.stringify(actual)}`);
        failed++;
    }
}

// ============================================================================
// Test: Initial State
// ============================================================================

function testInitialState() {
    console.log('\n--- Test: Initial State ---');

    assert(typeof chartState.series.misc === 'object', 'chartState.series.misc is an object');
    assert(typeof chartState.traceStyles.misc === 'object', 'chartState.traceStyles.misc is an object');
    assert(typeof chartState.lineStyles.trend.misc === 'object', 'chartState.lineStyles.trend.misc is an object');
}

// ============================================================================
// Test: Add Misc Series
// ============================================================================

function testAddMiscSeries() {
    console.log('\n--- Test: Add Misc Series ---');

    // Clear any existing misc series first
    getMiscSeriesIds().forEach(id => removeMiscSeries(id));

    // Add first series
    const id1 = addMiscSeries();
    assertEqual(id1, 'misc1', 'First series should be misc1');
    assert(chartState.series.misc['misc1'] !== undefined, 'misc1 data array exists');
    assert(chartState.traceStyles.misc['misc1'] !== undefined, 'misc1 traceStyles exists');
    assert(chartState.lineStyles.trend.misc['misc1'] !== undefined, 'misc1 lineStyles exists');

    // Check config
    const config1 = chartState.traceStyles.misc['misc1'].raw;
    assertEqual(config1.seriesName, 'Misc 1', 'First series name is "Misc 1"');
    assertEqual(config1.markerSymbol, 'square', 'First series symbol is square');
    assertEqual(config1.markerFaceColor, '#FFA500', 'First series color is orange');

    // Add second series
    const id2 = addMiscSeries();
    assertEqual(id2, 'misc2', 'Second series should be misc2');

    const config2 = chartState.traceStyles.misc['misc2'].raw;
    assertEqual(config2.seriesName, 'Misc 2', 'Second series name is "Misc 2"');
    assertEqual(config2.markerSymbol, 'triangle-up', 'Second series symbol is triangle-up');
    assertEqual(config2.markerFaceColor, '#FF0000', 'Second series color is red');

    // Check getMiscSeriesIds
    assertEqual(getMiscSeriesIds(), ['misc1', 'misc2'], 'getMiscSeriesIds returns sorted IDs');
}

// ============================================================================
// Test: Remove Misc Series
// ============================================================================

function testRemoveMiscSeries() {
    console.log('\n--- Test: Remove Misc Series ---');

    // Remove misc1
    const removed = removeMiscSeries('misc1');
    assert(removed === true, 'removeMiscSeries returns true for existing series');
    assert(chartState.series.misc['misc1'] === undefined, 'misc1 data array removed');
    assert(chartState.traceStyles.misc['misc1'] === undefined, 'misc1 traceStyles removed');
    assert(chartState.lineStyles.trend.misc['misc1'] === undefined, 'misc1 lineStyles removed');

    // misc2 should still exist
    assert(chartState.series.misc['misc2'] !== undefined, 'misc2 still exists');

    // Try to remove non-existent series
    const notRemoved = removeMiscSeries('misc99');
    assert(notRemoved === false, 'removeMiscSeries returns false for non-existent series');
}

// ============================================================================
// Test: ID Gap Filling
// ============================================================================

function testIdGapFilling() {
    console.log('\n--- Test: ID Gap Filling ---');

    // Currently misc2 exists, misc1 does not
    assertEqual(getNextMiscId(), 'misc1', 'Next ID fills gap (misc1)');

    // Add to fill the gap
    const id = addMiscSeries();
    assertEqual(id, 'misc1', 'Added series fills gap');

    // Now next should be misc3
    assertEqual(getNextMiscId(), 'misc3', 'Next ID is misc3');
}

// ============================================================================
// Test: Max Series Limit
// ============================================================================

function testMaxSeriesLimit() {
    console.log('\n--- Test: Max Series Limit ---');

    // Clear all
    getMiscSeriesIds().forEach(id => removeMiscSeries(id));

    // Add 10 series
    for (let i = 0; i < 10; i++) {
        const id = addMiscSeries();
        assert(id !== null, `Added series ${i + 1}`);
    }

    assertEqual(getMiscSeriesIds().length, 10, '10 series exist');
    assert(!canAddMiscSeries(), 'canAddMiscSeries returns false at limit');

    // Try to add 11th
    const id11 = addMiscSeries();
    assertEqual(id11, null, 'Cannot add 11th series (returns null)');

    // Clean up - remove all
    getMiscSeriesIds().forEach(id => removeMiscSeries(id));
}

// ============================================================================
// Test: Data Array Initialization
// ============================================================================

function testDataArrayInitialization() {
    console.log('\n--- Test: Data Array Initialization ---');

    // Get current timestamps length
    const dataLength = chartState.series.timestamps.length;

    // Add a new series
    const id = addMiscSeries();

    // Check data array is initialized with correct length
    assertEqual(
        chartState.series.misc[id].length,
        dataLength,
        `Data array initialized with length ${dataLength}`
    );

    // Check all values are NaN
    const allNaN = chartState.series.misc[id].every(v => isNaN(v));
    assert(allNaN, 'All initial values are NaN');

    // Clean up
    removeMiscSeries(id);
}

// ============================================================================
// Test: UI Elements
// ============================================================================

function testUIElements() {
    console.log('\n--- Test: UI Elements ---');

    // Add a series
    const id = addMiscSeries();

    // Check tab button exists
    const tabButton = document.querySelector(`[data-series-tab="${id}"]`);
    assert(tabButton !== null, 'Tab button created');

    // Check config panel exists
    const panel = document.getElementById(`${id}-series-config`);
    assert(panel !== null, 'Config panel created');

    // Check counter input exists (if misc-inputs-container is present)
    const miscInputsContainer = document.getElementById('misc-inputs-container');
    if (miscInputsContainer) {
        const input = document.getElementById(id);
        assert(input !== null, 'Counter input created');
    }

    // Remove series
    removeMiscSeries(id);

    // Check UI elements removed
    const tabButtonAfter = document.querySelector(`[data-series-tab="${id}"]`);
    assert(tabButtonAfter === null, 'Tab button removed');

    const panelAfter = document.getElementById(`${id}-series-config`);
    assert(panelAfter === null, 'Config panel removed');
}

// ============================================================================
// Run All Tests
// ============================================================================

export function runAllTests() {
    console.log('===========================================');
    console.log('Dynamic Misc Series Tests');
    console.log('===========================================');

    passed = 0;
    failed = 0;

    try {
        testInitialState();
        testAddMiscSeries();
        testRemoveMiscSeries();
        testIdGapFilling();
        testMaxSeriesLimit();
        testDataArrayInitialization();
        testUIElements();
    } catch (e) {
        console.error('Test error:', e);
        failed++;
    }

    console.log('\n===========================================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('===========================================');

    return { passed, failed };
}

// Export individual tests for selective running
export {
    testInitialState,
    testAddMiscSeries,
    testRemoveMiscSeries,
    testIdGapFilling,
    testMaxSeriesLimit,
    testDataArrayInitialization,
    testUIElements
};
