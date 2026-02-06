# Home Menu Button Styling Guide

## Overview

This document describes the visual styling approach for a vertical sidebar menu with icon+text buttons. The design uses a **soft blue/cyan color palette** with clear visual feedback for hover and selected states.

---

## Color Palette

| State | Color | Hex Code |
|-------|-------|----------|
| **Default/Idle** | Pale ice blue | `#e7efff` |
| **Hover** | Light cyan | `#96deeb` |
| **Selected/Active** | Cyan/turquoise | `#6ad1e3` |

### Visual Relationship
The colors form a gradient of "intensity" from subtle to prominent:
- **Idle** is the most muted (cool, pale blue-white)
- **Hover** is a noticeable step up (light cyan tint appears)
- **Selected** is the most saturated (distinct turquoise/cyan)

---

## Button Characteristics

### Shape & Borders
- **No visible border** (0px)
- **Sharp corners** (0px border-radius) - buttons are rectangular
- **No margin between buttons** - they stack flush against each other creating a seamless column
- **Internal padding**: 5px

### Typography
- Text is **black**
- Font style is **normal** (not italic or bold)
- Text color does not change across states

### Layout
- Each button contains an **icon above text** (vertical stacking)
- Buttons have a **fixed height** for uniformity
- Icons are small (16x16px) and centered above the label

---

## Interaction Behavior

### Hover State
When the cursor moves over **any** button (selected or not):
- Background transitions to the **hover color** (`#96deeb`)
- This provides immediate visual feedback that the element is interactive

### Selected State
The currently active/selected button:
- Background is set to the **selected color** (`#6ad1e3`)
- Remains this color persistently until another button is selected
- Still shows hover effect when moused over (hover color takes precedence during hover)

### Non-Selected State
All buttons that are not currently selected:
- Background is the **default color** (`#e7efff`)
- Transition to hover color on mouseover

---

## Design Philosophy

1. **Subtle but clear**: The default state is very soft, almost white, keeping the UI clean and non-distracting
2. **Progressive feedback**: Colors increase in saturation as interaction intensifies (idle → hover → selected)
3. **Consistent palette**: All three colors are in the blue-cyan family, creating visual harmony
4. **No harsh transitions**: The color steps are gentle, avoiding jarring visual changes
5. **Flat design**: No gradients, shadows, or 3D effects - purely flat color fills
6. **Seamless stacking**: Zero-margin layout creates a unified menu block rather than discrete floating buttons

---

## Example Implementation Pseudocode

```
Menu Button States:
  default:
    background: #e7efff (pale ice blue)
    border: none
    border-radius: 0

  hover:
    background: #96deeb (light cyan)

  selected:
    background: #6ad1e3 (cyan/turquoise)
```

---

## Summary

The style is **clean, flat, and uses soft cyan/blue tones** with three distinct visual states. The key characteristic is the use of **color saturation progression** (pale → light → medium cyan) to indicate interactivity levels, combined with a **borderless, flush-stacked** button layout that creates a cohesive sidebar menu.
