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
 * - line: Line events (save, remove, visibility)
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

    // Line Events
    LINE_REMOVE_CLICKABLE: 'line:remove_clickable',
    LINE_VISIBILITY_CHANGED: 'line:visibility_changed',

    // Line Save Events
    LINE_PHASE_SAVED: 'line:phase_saved',
    LINE_AIM_SAVED: 'line:aim_saved',
    LINE_CEL_SAVED: 'line:cel_saved',

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
    NAV_DATA_SUBTAB_SWITCH: 'nav:data_subtab_switch',
    NAV_LINE_CLICKABILITY_TOGGLE: 'nav:line_clickability_toggle',

    // UI Events
    UI_LEGEND_RENDER: 'ui:legend_render',
    UI_TRACE_STYLE_CHANGED: 'ui:trace_style_changed',

    // Misc Series Events
    MISC_SERIES_ADDED: 'misc:series_added',
    MISC_SERIES_REMOVED: 'misc:series_removed',

    // Fan Events
    FAN_VISIBILITY_CHANGED: 'fan:visibility_changed',
    FAN_REPOSITION: 'fan:reposition',

    // Chart Settings Events
    CHART_PANNING_ENABLED_CHANGED: 'chart:panning_enabled_changed',
    CHART_NAME_CHANGED: 'chart:name_changed',
    CHART_WINDOW_CHANGED: 'chart:window_changed',
    CHART_GRID_VISIBILITY_CHANGED: 'chart:grid_visibility_changed',

    // Counter Events
    COUNTER_ENTRY_DATE_CHANGED: 'counter:entry_date_changed',
    COUNTER_SHOW: 'counter:show',
    COUNTER_HIDE: 'counter:hide',

    // Chart Click Events
    CHART_CLICKED: 'chart:clicked',

    // Credit Events
    CREDITS_UPDATED: 'credits:updated',

    // Storage Events
    STORAGE_CHART_SAVED: 'storage:chart_saved',
    STORAGE_CHART_LOADED: 'storage:chart_loaded',
    STORAGE_CHART_DELETED: 'storage:chart_deleted',
    STORAGE_ERROR: 'storage:error',

    // Sync Events
    SYNC_CHART_UPDATED: 'sync:chart_updated',

    // Data Import Events
    DATA_IMPORT_STARTED: 'data:import_started',
    DATA_IMPORT_FILE_PARSED: 'data:import_file_parsed',
    DATA_IMPORT_COMPLETED: 'data:import_completed',
    DATA_IMPORT_FAILED: 'data:import_failed',

    // Plotly Wrapper Events (guaranteed to fire after render complete)
    PLOTLY_RELAYOUT_COMPLETE: 'plotly:relayout_complete',
    PLOTLY_REACT_COMPLETE: 'plotly:react_complete',
    PLOTLY_RESTYLE_COMPLETE: 'plotly:restyle_complete',
    PLOTLY_NEWPLOT_COMPLETE: 'plotly:newplot_complete',
    PLOTLY_ADDTRACES_COMPLETE: 'plotly:addtraces_complete',
    PLOTLY_DELETETRACES_COMPLETE: 'plotly:deletetraces_complete'
};

/**
 * Event Categories - Groups of events that share behavior
 */
export const EVENT_CATEGORIES = {
    STATE_MUTATING: 'category:state_mutating'
};

/**
 * Maps events to their categories.
 * When an event in this map is emitted, category subscribers are also notified.
 */
const EVENT_CATEGORY_MAP = {
    // Data mutations
    [EVENTS.DATA_ENTRY_SUBMITTED]: [EVENT_CATEGORIES.STATE_MUTATING],
    [EVENTS.DATA_START_DATE_CHANGED]: [EVENT_CATEGORIES.STATE_MUTATING],
    // Note: DATA_CHART_REFRESH is a rendering event, not a mutation - excluded from STATE_MUTATING

    // Line saves
    [EVENTS.LINE_PHASE_SAVED]: [EVENT_CATEGORIES.STATE_MUTATING],
    [EVENTS.LINE_AIM_SAVED]: [EVENT_CATEGORIES.STATE_MUTATING],
    [EVENTS.LINE_CEL_SAVED]: [EVENT_CATEGORIES.STATE_MUTATING],
    [EVENTS.LINE_VISIBILITY_CHANGED]: [EVENT_CATEGORIES.STATE_MUTATING],

    // Misc series
    [EVENTS.MISC_SERIES_ADDED]: [EVENT_CATEGORIES.STATE_MUTATING],
    [EVENTS.MISC_SERIES_REMOVED]: [EVENT_CATEGORIES.STATE_MUTATING],

    // Fan
    [EVENTS.FAN_VISIBILITY_CHANGED]: [EVENT_CATEGORIES.STATE_MUTATING],

    // Chart settings
    [EVENTS.CHART_NAME_CHANGED]: [EVENT_CATEGORIES.STATE_MUTATING],
    [EVENTS.CHART_WINDOW_CHANGED]: [EVENT_CATEGORIES.STATE_MUTATING],

    // Data import
    [EVENTS.DATA_IMPORT_COMPLETED]: [EVENT_CATEGORIES.STATE_MUTATING],

    // UI state changes
    [EVENTS.UI_TRACE_STYLE_CHANGED]: [EVENT_CATEGORIES.STATE_MUTATING]
};

class EventBus {
    constructor(name = 'EventBus') {
        this.name = name;
        this.subscribers = new Map();
        this.categorySubscribers = new Map();
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
     * Subscribe a callback to all events in a category
     * @param {string} category - Category name from EVENT_CATEGORIES
     * @param {Function} callback - Function to call when any event in category fires
     * @param {boolean} hasData - Whether callback expects data parameter (receives { event, data })
     */
    subscribeToCategory(category, callback, hasData = false) {
        if (this.debug.all || this.debug.subscribe) {
            console.log(`[${this.name}] subscribeToCategory: ${category}`);
        }

        if (!this.categorySubscribers.has(category)) {
            this.categorySubscribers.set(category, []);
        }

        this.categorySubscribers.get(category).push({ callback, hasData });
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

        // Notify direct subscribers
        if (this.subscribers.has(event)) {
            for (const { callback, hasData } of this.subscribers.get(event)) {
                try {
                    result = hasData ? callback(data) : callback();
                } catch (error) {
                    console.error(`[${this.name}] Error in ${event}:`, error);
                }
            }
        }

        // Notify category subscribers
        const categories = EVENT_CATEGORY_MAP[event];
        if (categories) {
            for (const category of categories) {
                if (this.categorySubscribers.has(category)) {
                    for (const { callback, hasData } of this.categorySubscribers.get(category)) {
                        try {
                            result = hasData ? callback({ event, data }) : callback();
                        } catch (error) {
                            console.error(`[${this.name}] Error in category ${category} for ${event}:`, error);
                        }
                    }
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

