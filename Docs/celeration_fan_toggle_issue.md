# Celeration Fan Toggle Issue

## Original Problem
Toggling the celeration fan OFF in settings caused Firefox to freeze and CPU spike.

## Root Cause (Infinite Loop) - FIXED
In `static/SCC/misc/celerationFan.js`, the `init()` function subscribes to `FAN_VISIBILITY_CHANGED`:

```javascript
export function init() {
    eventBus.subscribe(EVENTS.FAN_VISIBILITY_CHANGED, (data) => {
        toggleCelerationFan(data.visible);
    }, true);
}
```

Previously, `addCelerationFan()` and `removeCelerationFan()` emitted `FAN_VISIBILITY_CHANGED` after completing their work. This created an infinite loop:

1. Checkbox emits `FAN_VISIBILITY_CHANGED`
2. Subscriber calls `toggleCelerationFan()`
3. `removeCelerationFan()` emits `FAN_VISIBILITY_CHANGED`
4. Subscriber calls `toggleCelerationFan()` again
5. Loop continues indefinitely

## Fix Applied
Removed `eventBus.emit(EVENTS.FAN_VISIBILITY_CHANGED, ...)` from both `addCelerationFan()` and `removeCelerationFan()`.

## Remaining Issue
After fixing the infinite loop, toggling the fan visibility is still computationally expensive. The cause has not been identified.

### Code Flow (as traced)
1. Checkbox `change` event fires
2. `main.js:482` emits `FAN_VISIBILITY_CHANGED` with `{ visible: e.target.checked }`
3. `celerationFan.init()` subscriber calls `toggleCelerationFan(data.visible)`
4. `toggleCelerationFan()` calls `addCelerationFan()` or `removeCelerationFan()`
5. Those functions call `Plotly.relayout()` once and set `chartState.fanVisible`

### Files Involved
- `static/SCC/misc/celerationFan.js` - fan toggle logic
- `static/SCC/main.js` - checkbox event listener
- `static/SCC/eventBus.js` - event subscription system
- `static/SCC/chartState.js` - state management (contains `fanVisible` property)

### Unknown
Why a single `Plotly.relayout()` call causes noticeable computational expense when toggling simple shapes.
