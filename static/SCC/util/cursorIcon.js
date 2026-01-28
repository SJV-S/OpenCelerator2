/**
 * Creates custom cursor from SVG source
 * @param {string|Function} svgSource - SVG string or function returning SVG
 * @param {Object} options - {size: 32, hotspotX, hotspotY, color: '#000', fallback: 'crosshair'}
 * @returns {string} CSS cursor value
 */
export function createSvgCursor(svgSource, options = {}) {
    const {size = 32, hotspotX, hotspotY, color = '#000000', fallback = 'crosshair'} = options;
    const hX = hotspotX !== undefined ? hotspotX : size / 2;
    const hY = hotspotY !== undefined ? hotspotY : size / 2;

    try {
        const svgString = typeof svgSource === 'function' ? svgSource() : svgSource;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = svgString;
        const svgElement = tempDiv.querySelector('svg');
        const pathElement = svgElement.querySelector('path');
        const pathData = pathElement.getAttribute('d');
        const viewBox = svgElement.getAttribute('viewBox');

        return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}' width='${size}' height='${size}'%3E%3Cpath d='${pathData}' fill='${color}'/%3E%3C/svg%3E") ${hX} ${hY}, ${fallback}`;
    } catch (error) {
        console.error('Error creating SVG cursor:', error);
        return fallback;
    }
}

/**
 * Apply SVG cursor to chart elements
 * @param {HTMLElement} container - Chart container
 * @param {string|Function} svgSource - SVG source
 * @param {Object} options - Cursor options
 */
export function applySvgCursor(container, svgSource, options = {}) {
    const {size = 32, hotspotX = 16, hotspotY = 16} = options;
    const svgString = typeof svgSource === 'function' ? svgSource(size) : svgSource;
    const encoded = encodeURIComponent(svgString.replace(/\s+/g, ' ').trim());
    const cursor = `url("data:image/svg+xml,${encoded}") ${hotspotX} ${hotspotY}, crosshair`;

    const plotArea = container.querySelector('.plotly .drag');
    if (plotArea) {
        plotArea.style.cursor = cursor;
    }

    const svgLayer = container.querySelector('.plotly .svg-container');
    if (svgLayer) {
        svgLayer.style.cursor = cursor;
    }
}

/**
 * Restore default cursor
 * @param {HTMLElement} container - Chart container
 */
export function restoreCursor(container) {
    ['.plotly .drag', '.plotly .svg-container'].forEach(sel => {
        const el = container.querySelector(sel);
        if (el) el.style.cursor = '';
    });
}