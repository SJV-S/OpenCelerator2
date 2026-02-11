/**
 * Chart Import - Format detection and import from JSON
 *
 * Detects TC2 native or OpenCelerator format and imports accordingly.
 * Returns a result object pattern: { success, chartName, warnings, error }
 */

import { isNativeFormat } from './nativeImport.js';
import { isOpenCeleratorFormat, buildChartFromOpenCelerator } from './openCeleratorImport.js';
import { importChart } from '../storage/chartStorage.js';

/**
 * Import a chart from parsed JSON, auto-detecting format.
 * @param {object} json - Parsed JSON object
 * @param {string} fileName - Original file name (used for OpenCelerator naming)
 * @returns {Promise<{success: boolean, chartName?: string, warnings?: string[], error?: string}>}
 */
export async function importChartFromJson(json, fileName) {
    if (isNativeFormat(json)) {
        await importChart(json);
        return { success: true, chartName: json.chartName || 'Unnamed', warnings: [] };
    }

    if (isOpenCeleratorFormat(json)) {
        const result = buildChartFromOpenCelerator(json, fileName);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        await importChart(result.chartData);
        return { success: true, chartName: result.chartData.chartName, warnings: result.warnings };
    }

    return { success: false, error: 'Unrecognized JSON format. Expected TC2 or OpenCelerator export.' };
}
