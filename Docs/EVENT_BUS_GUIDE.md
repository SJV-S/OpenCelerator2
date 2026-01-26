# Event Bus Architecture Guide

A centralized pub/sub event system for JavaScript ES6 module communication that eliminates circular dependencies.

---

## Problem Solved

When peer modules need to communicate (Module A calls Module B, Module B calls Module A), circular dependencies create:
- Import order issues
- Tight coupling between modules
- Difficulty tracing data flow
- Mental overhead when making changes

The Event Bus provides a central mediator so modules never import each other directly.

---

## Core Concept

```
┌─────────────────────────────────────┐
│   UI Modules (peer level)           │
│   moduleA, moduleB, moduleC         │
└─────────────────┬───────────────────┘
                  │ emit/subscribe
                  ▼
┌─────────────────────────────────────┐
│   EventBus (single global instance) │
│   Mediates all module communication │
└─────────────────────────────────────┘
```

**Rule**: Modules emit events and subscribe to events. They never import peer modules.

---

## Implementation

### eventBus.js

```javascript
/**
 * Centralized event bus for module-to-module communication
 * Pattern: Single global instance
 */
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
     * @param {string} event - Event name (use namespace: 'area:action')
     * @param {function} callback - Callback function
     * @param {boolean} hasData - Whether callback expects data parameter
     */
    subscribe(event, callback, hasData = false) {
        if (this.debug.all || this.debug.subscribe) {
            console.log(`[DEBUG][${this.name}] Subscribing to: ${event}`);
        }

        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, []);
        }

        this.subscribers.get(event).push({ callback, hasData });
    }

    /**
     * Emit an event, calling all subscribers
     * @param {string} event - Event name
     * @param {*} data - Optional data to pass to callbacks
     * @returns {*} Result from last callback (if any)
     */
    emit(event, data = null) {
        let result = null;

        if (this.debug.all || this.debug.emit) {
            console.log(`[DEBUG][${this.name}] Emitting: ${event}`, data);
        }

        if (this.subscribers.has(event)) {
            for (const { callback, hasData } of this.subscribers.get(event)) {
                try {
                    result = hasData ? callback(data) : callback();
                } catch (error) {
                    console.error(`[${this.name}] Error in callback for '${event}':`, error);
                }
            }
        }

        return result;
    }

    /** Get all registered event names */
    getEventNames() {
        return Array.from(this.subscribers.keys());
    }

    /** Enable/disable debug logging */
    setDebug(options) {
        Object.assign(this.debug, options);
    }
}

// Single global instance
export const eventBus = new EventBus('Global');
export { EventBus };
```

---

## Usage Pattern

### 1. Create an Event Catalog

Define all events in a central file to prevent typos and document what events exist:

```javascript
// events.js
export const EVENTS = {
    // Navigation
    NAVIGATE_TO_SECTION: 'app:navigate_to_section',

    // Data operations
    ITEM_CREATED: 'app:item_created',
    ITEM_UPDATED: 'app:item_updated',
    ITEM_DELETED: 'app:item_deleted',
    REFRESH_LIST: 'app:refresh_list',

    // UI state
    OPEN_MODAL: 'app:open_modal',
    CLOSE_MODAL: 'app:close_modal',
    CLEAR_SELECTIONS: 'app:clear_selections'
};
```

**Naming Convention**: `namespace:action` (e.g., `dashboard:user_created`, `editor:save_complete`)

### 2. Subscribe in Module Init

Modules subscribe to events they care about during initialization:

```javascript
// moduleA.js
import { eventBus } from './eventBus.js';
import { EVENTS } from './events.js';

const moduleA = {
    init() {
        // Subscribe without data
        eventBus.subscribe(EVENTS.REFRESH_LIST, () => {
            this.loadItems();
        }, false);  // false = no data parameter

        // Subscribe with data
        eventBus.subscribe(EVENTS.ITEM_CREATED, (data) => {
            this.handleNewItem(data.itemId);
        }, true);  // true = expects data parameter
    },

    loadItems() { /* ... */ },
    handleNewItem(itemId) { /* ... */ }
};

export { moduleA };
```

### 3. Emit Events Instead of Direct Calls

When a module needs to trigger behavior in another module, emit an event:

```javascript
// moduleB.js
import { eventBus } from './eventBus.js';
import { EVENTS } from './events.js';

const moduleB = {
    async createItem(itemData) {
        const response = await api.post('/items', itemData);

        // Instead of: moduleA.handleNewItem(response.id)
        // Emit event:
        eventBus.emit(EVENTS.ITEM_CREATED, { itemId: response.id });
    },

    deleteItem(itemId) {
        api.delete(`/items/${itemId}`);
        eventBus.emit(EVENTS.REFRESH_LIST);
    }
};

export { moduleB };
```

### 4. Coordinator Wires Everything Together

A top-level coordinator imports all modules and sets up cross-module event handling:

```javascript
// coordinator.js
import { eventBus } from './eventBus.js';
import { EVENTS } from './events.js';
import { moduleA } from './moduleA.js';
import { moduleB } from './moduleB.js';
import { moduleC } from './moduleC.js';

const coordinator = {
    init() {
        // Initialize all modules
        moduleA.init();
        moduleB.init();
        moduleC.init();

        // Wire up cross-module coordination
        eventBus.subscribe(EVENTS.NAVIGATE_TO_SECTION, (data) => {
            this.showSection(data.section);
        }, true);

        eventBus.subscribe(EVENTS.OPEN_MODAL, (data) => {
            moduleC.openModal(data.modalType, data.modalData);
        }, true);
    },

    showSection(sectionName) { /* ... */ }
};

document.addEventListener('DOMContentLoaded', () => {
    coordinator.init();
});

export { coordinator };
```

---

## Communication Rules

| Allowed | Not Allowed |
|---------|-------------|
| Parent imports child | Child imports parent |
| Module imports utilities | Peer imports peer |
| Module imports eventBus | Direct peer-to-peer calls |
| Coordinator calls module methods | Module calls peer methods |

**Always allowed imports**: `eventBus`, `events`, utility modules, API clients, config

---

## Before/After Example

### Before (Circular Dependency)

```javascript
// listModule.js
import { detailModule } from './detailModule.js';  // Circular!

const listModule = {
    handleItemClick(itemId) {
        detailModule.showDetails(itemId);  // Direct call
    }
};

// detailModule.js
import { listModule } from './listModule.js';  // Circular!

const detailModule = {
    async deleteItem() {
        await api.delete(`/items/${this.itemId}`);
        listModule.refresh();  // Direct call back
    }
};
```

### After (Event Bus)

```javascript
// listModule.js
import { eventBus } from './eventBus.js';
import { EVENTS } from './events.js';

const listModule = {
    init() {
        eventBus.subscribe(EVENTS.REFRESH_LIST, () => {
            this.refresh();
        }, false);
    },

    handleItemClick(itemId) {
        eventBus.emit(EVENTS.ITEM_SELECTED, { itemId });
    }
};

// detailModule.js
import { eventBus } from './eventBus.js';
import { EVENTS } from './events.js';

const detailModule = {
    init() {
        eventBus.subscribe(EVENTS.ITEM_SELECTED, (data) => {
            this.showDetails(data.itemId);
        }, true);
    },

    async deleteItem() {
        await api.delete(`/items/${this.itemId}`);
        eventBus.emit(EVENTS.ITEM_DELETED, { itemId: this.itemId });
        eventBus.emit(EVENTS.REFRESH_LIST);
    }
};
```

---

## Debugging

Enable debug logging to trace all events:

```javascript
// See everything
eventBus.setDebug({ all: true });

// Or selective debugging
eventBus.setDebug({
    emit: true,      // Log all emitted events
    subscribe: true  // Log subscription registrations
});

// List all registered events
console.log(eventBus.getEventNames());
```

Console output:
```
[DEBUG][Global] Emitting: app:item_selected { itemId: 123 }
[DEBUG][Global] Subscribing to: app:refresh_list
```

---

## Testing

Mock the event bus for isolated unit tests:

```javascript
// Mock eventBus
const mockEventBus = {
    emit: jest.fn(),
    subscribe: jest.fn()
};

// Test that module emits correct event
moduleB.createItem({ name: 'Test' });
expect(mockEventBus.emit).toHaveBeenCalledWith('app:item_created', { itemId: expect.any(Number) });
```

---

## Summary

1. **Single global instance** - Import `eventBus` everywhere
2. **Event catalog** - Define all event names in one file
3. **Subscribe in init()** - Modules register their event handlers during initialization
4. **Emit, don't call** - Use `eventBus.emit()` instead of calling peer modules directly
5. **Coordinator orchestrates** - Top-level module wires up cross-cutting concerns
6. **No peer imports** - Modules only import utilities, eventBus, and events

This pattern eliminates circular dependencies and makes module communication explicit and traceable.