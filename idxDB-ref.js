/**
 * IndexedDB Reference - Utility commands for browser console
 * Run these in the browser console on any page that uses SCC_Charts database
 */

// =============================================================================
// LIST ALL CHARTS (full contents)
// =============================================================================
indexedDB.open('SCC_Charts').onsuccess = e => {
    const db = e.target.result;
    db.transaction('charts').objectStore('charts').getAll().onsuccess = e => {
        e.target.result.forEach((c, i) => {
            console.log(`\n=== Chart ${i + 1} ===\n` + JSON.stringify(c, null, 2));
        });
    };
};

// =============================================================================
// LIST ALL CHARTS (summary only)
// =============================================================================
indexedDB.open('SCC_Charts').onsuccess = e => {
    const db = e.target.result;
    db.transaction('charts').objectStore('charts').getAll().onsuccess = e => {
        e.target.result.forEach((c, i) => {
            console.log(i+1, c.id, c.chartName, c.metadata?.chartName, c.chartType, c.metadata?.chartType);
        });
    };
};

// =============================================================================
// COUNT CHARTS
// =============================================================================
indexedDB.open('SCC_Charts').onsuccess = e => {
    const db = e.target.result;
    db.transaction('charts').objectStore('charts').count().onsuccess = e => {
        console.log('Total charts:', e.target.result);
    };
};

// =============================================================================
// DELETE SPECIFIC CHART (replace ID)
// =============================================================================
indexedDB.open('SCC_Charts').onsuccess = e => {
    const db = e.target.result;
    db.transaction('charts', 'readwrite').objectStore('charts').delete('CHART-ID-HERE').onsuccess = () => console.log('Deleted');
};

// =============================================================================
// DELETE ALL CHARTS (nuke)
// =============================================================================
indexedDB.open('SCC_Charts').onsuccess = e => {
    const db = e.target.result;
    db.transaction('charts', 'readwrite').objectStore('charts').clear().onsuccess = () => console.log('All charts deleted');
};

// =============================================================================
// DELETE ENTIRE DATABASE
// =============================================================================
indexedDB.deleteDatabase('SCC_Charts').onsuccess = () => console.log('Database deleted');