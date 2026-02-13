/**
 * Centralized HTTP client for all server communication.
 * Every fetch call in the app routes through here.
 *
 * Emits eventBus events for every request/response/error,
 * except health pings (would fire every few seconds and add noise).
 */

import { eventBus, EVENTS } from '../SCC/eventBus.js';

let userId = null;

/**
 * Set the user ID to include as X-User-Id header on all non-health requests.
 * @param {string} id
 */
export function setUserId(id) {
    userId = id;
}

/**
 * @param {string} url
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {object} [options.body] - Auto-serialized to JSON, sets Content-Type header
 * @param {AbortSignal} [options.signal]
 * @param {string} [options.cache]
 * @returns {Promise<Response>}
 */
export async function api(url, { method = 'GET', body, signal, cache } = {}) {
    const options = { method };

    const headers = {};
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    // Health pings fire every few seconds — exclude from event bus
    const silent = url === '/api/health';

    if (userId && !silent) {
        headers['X-User-Id'] = userId;
    }

    if (Object.keys(headers).length) {
        options.headers = headers;
    }

    if (signal) options.signal = signal;
    if (cache) options.cache = cache;

    if (!silent) {
        eventBus.emit(EVENTS.API_REQUEST, { url, method });
    }

    let response;
    try {
        response = await fetch(url, options);
    } catch (err) {
        if (!silent) {
            eventBus.emit(EVENTS.API_ERROR, { url, method, error: err });
        }
        throw err;
    }

    if (!silent) {
        if (response.ok) {
            eventBus.emit(EVENTS.API_RESPONSE, { url, method, status: response.status });
        } else {
            eventBus.emit(EVENTS.API_ERROR, { url, method, status: response.status });
            if (response.status === 402) {
                eventBus.emit(EVENTS.SUBSCRIPTION_EXPIRED);
            }
        }
    }

    return response;
}
