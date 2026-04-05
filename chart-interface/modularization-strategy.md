# SCCChart Plugin — Modularization Strategy

Lessons from the first integration attempt (FL-Flash2, 2026-04-04). Almost every issue traces back to two architectural root causes inherited from TC2's single-app design.

---

## Root Cause 1: Module-level singletons

The event bus and `chartState` are module-level singletons — one object shared across the entire JS module scope for the lifetime of the page. Fine for TC2, where there is exactly one chart that never needs to be torn down. Wrong for a plugin.

**Consequences:**
- `destroy()` clears the container HTML but cannot unregister event bus subscriptions — they accumulate permanently
- Calling `new SCCChart()` a second time doubles every event handler; behaviour is undefined
- The singleton workaround in `consumer-contract.md` is a documented patch over a structural flaw, not a design decision

**Fix:** Make the event bus and `chartState` per-instance objects constructed fresh on each instantiation. Modules receive them as constructor dependencies rather than importing the module-level singleton. `destroy()` discards the bus object — all subscriptions vanish automatically. Two charts on one page become possible without any special handling.

This is the highest-priority change. It is a prerequisite for everything else.

---

## Root Cause 2: No semantic distinction between "load" and "user" mutations

In TC2, every state mutation is user-caused. The event system has no reason to distinguish them. In a plugin context, `loadData()` is a programmatic operation initiated by the consumer — but because it calls `Object.assign(chartState, data)` and emits state-mutating events (e.g. `CHART_WINDOW_CHANGED`), the consumer's `onStateChanged` fires, schedules a backend write, and has no way to know it was its own load that triggered it.

**Consequences:**
- Every deck switch generates a backend write for zero user-initiated changes
- Consumers must implement their own suppression logic (fragile, unscalable)

**Fix:** Add a loading flag or a dedicated `loadData` event path that suppresses `STATE_MUTATING` emissions for the duration of the load. `onStateChanged` should only fire when a human actually did something. One option: `loadData()` emits a single `LOAD_COMPLETE` event at the end instead of individual mutating events, letting consumers ignore it for save purposes.

---

## Secondary Issue: Inconsistent dragmode management

Interactive modes that require click events handle `dragmode` inconsistently. The drawing modes (aim, cut, cel line creation) correctly call `relayout({ dragmode: false })` at activation. The line click-to-edit path (`toggleLineCategoryEdit`) never does — which is why `plotly_click` fires for drawing but not for click-to-edit.

With `dragmode: "pan"` and `fixedrange` on both axes, the Plotly drag layer sits on top of all traces and consumes pointer events before Plotly's hit-testing can attribute them to a specific trace. `dragmode: false` disables this layer.

**Fix:** A single mode manager that centralizes all `dragmode` transitions. Every interactive mode activates and deactivates through it. "Forgot to set dragmode" becomes impossible by construction.

---

## Secondary Issue: State mutations can silently bypass the event system

Any handler can mutate `chartState` directly without emitting an event. The chart-type-change bug (2026-04-04) was caught because the symptom was visible. Others may not be. There is no enforcement.

**Fix (longer term):** Route all `chartState` mutations through a single setter function or ES6 `Proxy` that guarantees an event is always emitted. "Forgot to emit" becomes structurally impossible.

---

## Priority Order

| Priority | Change | Unblocks |
|----------|--------|----------|
| 1 | Per-instance event bus + chartState | Clean destroy/recreate, multi-instance, all subscription bugs |
| 2 | Load/user event distinction in `loadData` | Spurious writes, consumer save logic |
| 3 | Centralized dragmode mode manager | click-to-edit, any future interactive mode |
| 4 | Gated chartState mutations (Proxy/setter) | Silent event-miss bugs |

---

## What Good Looks Like

The `consumer-contract.md` currently documents too many workarounds: the singleton constraint, the `id` null-reset behavior, the `traceStyles` shallow-merge footgun. A well-designed plugin should be hard to misuse — these shouldn't require documented warnings. Once the root causes above are addressed, most of those warnings should be removable because the problems they describe will no longer exist.
