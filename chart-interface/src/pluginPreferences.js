/**
 * pluginPreferences.js
 *
 * Lightweight shim for getUserPreferences / setUserPreference.
 * Replaces the IDB-backed Server/init.js equivalents.
 * Used by celSettingsModal.js and lineSettingsModal.js.
 */

const STORAGE_KEY = 'scc-plugin-preferences';

let _cache = null;

function load() {
    if (_cache) return _cache;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        _cache = raw ? JSON.parse(raw) : {};
    } catch {
        _cache = {};
    }
    return _cache;
}

export function getUserPreferences() {
    return load();
}

export async function setUserPreference(key, value) {
    const prefs = load();
    prefs[key] = value;
    _cache = prefs;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        // Ignore storage errors (private browsing, quota exceeded)
    }
}
