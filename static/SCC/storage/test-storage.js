/**
 * Storage Test Script
 *
 * Run from browser console:
 *   import('/static/SCC/storage/test-storage.js');
 */

import { saveChart, loadChart, listCharts, deleteChart } from './chartStorage.js';
import { chartState } from '../chartState.js';

async function runTest() {
    console.log('=== Storage Test ===\n');

    // 0. Check initial state
    console.log('0. Initial chartState.id:', chartState.id);

    // 1. Save current state
    const id = await saveChart();
    console.log('1. Saved chart:', id);
    console.log('   chartState.id is now:', chartState.id);

    // 2. Record original value and alter it
    const originalName = chartState.chartName;
    chartState.chartName = 'MODIFIED_TEST_VALUE';
    console.log('2. Changed chartName:', `"${originalName}"`, '→', `"${chartState.chartName}"`);

    // 3. Reload from IndexedDB
    await loadChart(id);
    console.log('3. Reloaded chart from IndexedDB');

    // 4. Print result
    console.log('4. chartName after reload:', `"${chartState.chartName}"`);

    if (chartState.chartName === originalName) {
        console.log('\n✓ SUCCESS: Value restored');
    } else {
        console.log('\n✗ FAIL: Value not restored');
    }

    // 5. Show all saved charts
    const charts = await listCharts();
    console.log('\n5. All saved charts:', charts);

    // 6. Cleanup - delete test chart
    await deleteChart(id);
    console.log('6. Cleaned up test chart');
    console.log('   chartState.id is now:', chartState.id);

    console.log('\n=== Test Complete ===');
}

runTest();
