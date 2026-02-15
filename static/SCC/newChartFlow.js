/**
 * New chart page flow — create or import a chart.
 * Extracted from new_chart.html inline script for CSP compliance.
 */

import { initStorage, createChart } from '/static/SCC/storage/chartStorage.js';
import { importChartFromJson } from '/static/SCC/import/chartImport.js';
import { initServerSync } from '/static/Server/init.js';

await initStorage();
await initServerSync();

const nameInput = document.getElementById('chart-name');
const nameError = document.getElementById('name-error');
const buttons = document.querySelectorAll('.chart-btn');

// Enable/disable buttons based on name input
function updateButtonState() {
    const hasName = nameInput.value.trim().length > 0;
    buttons.forEach(btn => {
        if (btn.hasAttribute('data-coming-soon')) return;
        btn.disabled = !hasName;
    });
    if (hasName) {
        nameError.classList.add('hidden');
    }
}

const modeRadios = document.querySelectorAll('input[name="chart-mode"]');

function updateMinuteOnlyButtons() {
    const isCount = document.querySelector('input[name="chart-mode"]:checked').value === 'count';
    document.querySelectorAll('[data-minute-only]').forEach(btn => {
        btn.style.display = isCount ? 'none' : '';
    });
}

modeRadios.forEach(r => r.addEventListener('change', updateMinuteOnlyButtons));
updateMinuteOnlyButtons();

nameInput.addEventListener('input', updateButtonState);
updateButtonState();

// Handle chart creation
buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) {
            nameError.classList.remove('hidden');
            nameInput.focus();
            return;
        }

        const chartType = btn.dataset.type;
        const minuteChart = document.querySelector('input[name="chart-mode"]:checked').value === 'minute';

        const id = await createChart(name, chartType, minuteChart);
        if (id) {
            window.location.href = `/chart/${id}`;
        }
    });
});

// Import chart
document.getElementById('import-chart-btn').addEventListener('click', () => {
    document.getElementById('import-chart-input').click();
});

document.getElementById('import-chart-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    const status = document.getElementById('import-status');

    try {
        const text = await file.text();

        let json;
        try {
            json = JSON.parse(text);
        } catch (parseErr) {
            status.textContent = `Invalid JSON file: ${parseErr.message}`;
            status.className = 'mt-2 text-sm text-center text-red-500';
            status.classList.remove('hidden');
            return;
        }

        const result = await importChartFromJson(json, file.name);
        if (!result.success) {
            status.textContent = result.error;
            status.className = 'mt-2 text-sm text-center text-red-500';
            status.classList.remove('hidden');
            return;
        }

        let message = `Imported "${result.chartName}"`;
        if (result.warnings.length > 0) {
            message += ` (${result.warnings.length} feature(s) not supported)`;
        }
        status.textContent = message + ' — redirecting...';
        status.className = 'mt-2 text-sm text-center text-green-600';
        status.classList.remove('hidden');

        setTimeout(() => { window.location.href = '/'; }, 1000);

    } catch (err) {
        console.error('Import error:', err);
        status.textContent = `Import failed: ${err.message}`;
        status.className = 'mt-2 text-sm text-center text-red-500';
        status.classList.remove('hidden');
    }
});

// Focus name input on load
nameInput.focus();
