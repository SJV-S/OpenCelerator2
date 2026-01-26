/**
 * EventBus - Centralized pub/sub event system for module communication
 *
 * Prevents circular dependencies by acting as a mediator between modules.
 * All modules import eventBus instead of importing each other directly.
 *
 * Usage:
 *   import { eventBus, EVENTS } from './eventBus.js';
 *
 *   // Publisher
 *   eventBus.emit(EVENTS.DATA_ENTRY_SUBMITTED);
 *
 *   // Subscriber
 *   eventBus.subscribe(EVENTS.DATA_ENTRY_SUBMITTED, () => {
 *       hideCounter();
 *   });
 */

/**
 * Event Catalog - Central registry of all event names
 *
 * Naming convention: namespace:action
 * - data: Data-related events (entries, dates, chart refresh)
 * - line: Line interaction events (clicks on phase/aim/cel/cut lines)
 * - mode: Drawing mode activation/deactivation
 * - nav: Navigation and UI state events
 * - ui: UI component updates (legend, styles)
 */
export const EVENTS = {
    // Data Events
    DATA_ENTRY_SUBMITTED: 'data:entry_submitted',
    DATA_START_DATE_CHANGED: 'data:start_date_changed',
    DATA_CHART_REFRESH: 'data:chart_refresh',
    DATA_CHART_REPLOT_COMPLETE: 'data:chart_replot_complete',

    // Line Click Events
    LINE_PHASE_CLICKED: 'line:phase_clicked',
    LINE_AIM_CLICKED: 'line:aim_clicked',
    LINE_CEL_CLICKED: 'line:cel_clicked',
    LINE_CUT_CLICKED: 'line:cut_clicked',
    LINE_REMOVE_CLICKABLE: 'line:remove_clickable',
    LINE_VISIBILITY_CHANGED: 'line:visibility_changed',

    // Drawing Mode Events
    MODE_PHASE_ACTIVATE: 'mode:phase_activate',
    MODE_PHASE_DEACTIVATE: 'mode:phase_deactivate',
    MODE_AIM_ACTIVATE: 'mode:aim_activate',
    MODE_AIM_DEACTIVATE: 'mode:aim_deactivate',
    MODE_CUT_ACTIVATE: 'mode:cut_activate',
    MODE_CUT_DEACTIVATE: 'mode:cut_deactivate',
    MODE_CEL_ACTIVATE: 'mode:cel_activate',
    MODE_CEL_DEACTIVATE: 'mode:cel_deactivate',
    MODE_ALL_DEACTIVATE: 'mode:all_deactivate',

    // Navigation Events
    NAV_COUNTER_HIDE: 'nav:counter_hide',
    NAV_TAB_SWITCH: 'nav:tab_switch',
    NAV_LINE_CLICKABILITY_TOGGLE: 'nav:line_clickability_toggle',

    // UI Events
    UI_LEGEND_RENDER: 'ui:legend_render',
    UI_TRACE_STYLE_CHANGED: 'ui:trace_style_changed'
};
class EventBus {
    constructor(name = 'EventBus') {
        this.name = name;
        this.subscribers = new Map();
        this.debug = {
            init: false,
            subscribe: false,
            emit: false,
            all: false
        };
    }

    /**
     * Subscribe a callback to an event
     * @param {string} event - Event name from EVENTS catalog
     * @param {Function} callback - Function to call when event fires
     * @param {boolean} hasData - Whether callback expects data parameter
     */
    subscribe(event, callback, hasData = false) {
        if (this.debug.all || this.debug.subscribe) {
            console.log(`[${this.name}] subscribe: ${event}`);
        }

        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, []);
        }

        this.subscribers.get(event).push({ callback, hasData });
    }

    /**
     * Emit an event to all subscribers
     * @param {string} event - Event name from EVENTS catalog
     * @param {*} data - Optional data to pass to subscribers
     * @returns {*} Result from last callback
     */
    emit(event, data = null) {
        if (this.debug.all || this.debug.emit) {
            console.log(`[${this.name}] emit: ${event}`, data);
        }

        let result = null;

        if (this.subscribers.has(event)) {
            for (const { callback, hasData } of this.subscribers.get(event)) {
                try {
                    result = hasData ? callback(data) : callback();
                } catch (error) {
                    console.error(`[${this.name}] Error in ${event}:`, error);
                }
            }
        }

        return result;
    }

    /**
     * Get all registered event names (debugging)
     * @returns {string[]} Array of event names with subscribers
     */
    getEventNames() {
        return Array.from(this.subscribers.keys());
    }

    /**
     * Set debug flags
     * @param {Object} options - { init, subscribe, emit, all }
     */
    setDebug(options) {
        Object.assign(this.debug, options);
    }
}

// Single global instance
export const eventBus = new EventBus('SCC');

// Export class for temp
export { EventBus };

