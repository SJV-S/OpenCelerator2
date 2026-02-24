/**
 * File download utility - creates a Blob, triggers browser download, and cleans up.
 *
 * @param {string|Blob} content - The file content (string or pre-built Blob)
 * @param {string} filename - The download filename
 * @param {string} mimeType - MIME type (e.g. 'text/csv', 'application/json')
 */
export function downloadFile(content, filename, mimeType) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.visibility = 'hidden';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
}
