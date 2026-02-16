# CSS Styling Survey

A comprehensive analysis of vanilla CSS and Tailwind CSS usage in the SCC project.

## Overview

The project uses a **hybrid approach** combining three styling methods:

| Method | Primary Use Case | Files |
|--------|-----------------|-------|
| Vanilla CSS | Sidebar menu, complex components | `chart_menu.css`, inline `<style>` blocks |
| Tailwind CSS | Layout, spacing, responsive utilities | CDN in templates |
| CSS-in-JS | Dynamic runtime styling | Direct `.style.*` manipulation in ES6 modules |

**No build process** — relies on Tailwind CDN + vanilla CSS files.

---

## 1. Vanilla CSS Files

### `static/SCC/css/chart_menu.css` (558 lines)

The primary stylesheet covering the entire sidebar menu system.

**Key Sections:**

| Section | Selectors | Purpose |
|---------|-----------|---------|
| Menu Container | `#counter-overlay`, `@media (min-width: 1024px)` | Fixed position panel, 25vw width on desktop |
| Tab Navigation | `.chart-menu-tabs`, `.chart-menu-tab-btn` | Tab styling with cyan hover (`#96deeb`) |
| Tab Content | `.chart-menu-content`, `.chart-menu-tab-pane` | Scrollable content area |
| Form Elements | `.chart-menu-content input/select/textarea` | Full-width inputs with cyan focus border |
| Buttons | `.chart-menu-btn-primary`, `.chart-menu-btn-danger` | Action buttons (cyan/red) |
| Icon Buttons | `.chart-menu-icon-btn` | Grid-based icon buttons for lines tab |
| Grid Layouts | `.chart-menu-grid-2`, `.chart-menu-grid-3` | CSS Grid layouts |
| Data Tab | `.data-subtabs`, `.data-subpane` | Sub-tab switching |
| Series Tab | `.series-tab-layout`, `.series-subtabs` | Complex sub-menu system |
| Chart Area Offset | `#chart-area`, `#chart-container` | Shift chart for sidebar |
| Crosshair Panel | `.crosshair-panel`, `.crosshair-info` | Monospace info display |
| Credit Display | `.credit-tab-mobile`, `.mobile-credit-display` | Container queries for mobile |

**Technical notes:**
- Uses `@media (min-width: 1024px)` for desktop/mobile breakpoints
- Custom color scheme: cyan (`#6ad1e3`), grays from `#1f2937` to `#f9fafb`
- Container queries for credit display (`cqw`, `cqh` units)
- Percentage-based padding for flexible layouts

---

## 2. Inline `<style>` Blocks

### `templates/SCC/base.html`

Comprehensive `<style>` block (105 lines) for global elements:

| Feature | Selectors | Purpose |
|---------|-----------|---------|
| Body Reset | `html, body` | Full-height, flexbox centering |
| Date Input | `.date-centered` | Hide calendar picker, center text |
| Input Focus | `input:focus` | Cyan border override |
| Custom Legend | `#custom-legend`, `.legend-item` | Position variants, hover effects |

### `templates/SCC/menu_page.html`

Local styles for chart list page:

| Class | Purpose |
|-------|---------|
| `.expand-btn.expanded` | Rotate chevron 90deg |
| `.credits-row` | Collapsible credits row |
| `.table-row:hover` | Row highlight |
| `.delete-btn`, `.edit-tags-btn` | Opacity transitions on hover |

### `templates/SCC/new_chart.html`

Local styles for chart creation form:

| Class | Purpose |
|-------|---------|
| `.chart-btn` | Chart type buttons with transitions |
| `.chart-btn:hover` | Dark background on hover |
| `.chart-btn:disabled` | Reduced opacity state |

### `templates/SCC/chart.html`

Inline styles on elements:
- `#chart` — `position: relative`
- `#custom-legend` — `display: none` initially
- `#menu-hint` — Fixed tooltip with CSS animations

---

## 3. Tailwind CSS Usage

### Configuration

**CDN-based** — no local build:
```html
<script src="https://cdn.tailwindcss.com"></script>
```

No `tailwind.config.js`, `postcss.config.js`, or build dependencies.

### Files Loading Tailwind CDN

- `templates/SCC/base.html`
- `templates/SCC/menu_page.html`
- `templates/SCC/new_chart.html`

### Common Patterns

| Category | Examples | Frequency |
|----------|----------|-----------|
| Spacing | `mb-4 lg:mb-3`, `px-6 py-4`, `gap-2`, `space-y-4` | Very high |
| Flex | `flex`, `flex-col`, `items-center`, `justify-between` | Very high |
| Grid | `grid`, `grid-cols-2`, `grid-cols-3` | High |
| Typography | `text-sm`, `font-semibold`, `text-gray-600` | Very high |
| Colors | `bg-white`, `text-gray-800`, `bg-red-500` | Very high |
| Sizing | `w-full`, `h-10`, `max-w-5xl` | High |
| Borders | `border`, `rounded-lg`, `border-gray-300` | High |
| States | `hover:`, `disabled:`, `focus:`, `peer-checked:` | High |
| Breakpoints | `lg:`, `sm:`, `md:` | Medium |

### Custom Color Bracket Syntax

Since no `tailwind.config.js` exists, custom colors use bracket syntax:
- `bg-[#6ad1e3]` — Primary cyan
- `accent-[#6ad1e3]` — Radio/checkbox accent
- `text-[#6ad1e3]` — Link color
- `peer-checked:bg-[#6ad1e3]` — Toggle switches

---

## 4. Mixed Usage by File

| File | Vanilla CSS | Tailwind | Strategy |
|------|------------|----------|----------|
| `base.html` | ✅ Extensive `<style>` block | Loads CDN only | Vanilla for complex states |
| `chart.html` | ✅ Inline styles | None | Vanilla for positioning |
| `menu_page.html` | ✅ Local `<style>` | ✅ Extensive | Tailwind for layout, vanilla for transitions |
| `new_chart.html` | ✅ Local `<style>` | ✅ Extensive | Same as above |
| `data_tab.html` | Uses `chart_menu.css` | ✅ Extensive | Tailwind for responsive grids |
| `chart_tab.html` | Uses `chart_menu.css` | ✅ Extensive | Same as above |
| `series_tab.html` | Uses `chart_menu.css` | ✅ Extensive | Same as above |
| `lines_tab.html` | Uses `chart_menu.css` | None | Pure vanilla CSS |
| `credit_tab.html` | Uses `chart_menu.css` | None | Pure vanilla CSS |

---

## 5. CSS-in-JS (Dynamic Styles)

**18 JavaScript files** manipulate styles directly. Key patterns:

### Display Toggle

```javascript
// navigation.js
counterOverlay.style.display = 'flex';  // or 'none'
```

### classList API

```javascript
// navigation.js, customLegend.js
content.classList.remove('active');
button.classList.add('active');
creditsRow.classList.toggle('expanded');
```

### Dynamic Positioning

```javascript
// toaster.js - generates entire style
const baseStyles = `
    position: fixed;
    z-index: 10000;
    top: ${topValue};
    transform: translateX(${slideDirection});
    transition: transform ${TIMING_MS}ms ease-out;
`;
toast.style.cssText = baseStyles;
```

### Files with Style Manipulation

| File | Purpose |
|------|---------|
| `navigation.js` | Menu show/hide, tab switching |
| `toaster.js` | Toast notification positioning/stacking |
| `customLegend.js` | Legend item visibility |
| `cursorIcon.js` | Custom SVG cursors |
| `crosshair.js` | Info panel positioning |
| `celerationFan.js` | Chart element positioning |

---

## 6. Summary by Component

| Component | Primary Approach | Reason |
|-----------|-----------------|--------|
| Sidebar Menu | Vanilla CSS | Complex states, hover effects, @media queries |
| Tab System | Vanilla CSS + classList | Active state toggling |
| Data Entry Forms | Tailwind + Vanilla | Tailwind grids, vanilla inputs |
| Chart Area | Vanilla CSS | Desktop/mobile offset |
| Toasts | Pure CSS-in-JS | Dynamic stacking/positioning |
| Custom Legend | Vanilla + classList | Position variants, visibility |
| Chart List Page | Tailwind | Table layout, responsive |
| New Chart Form | Tailwind + Vanilla | Transitions need vanilla CSS |
| Lines Tab | Pure Vanilla CSS | Icon grid layout |
| Credit Tab | Pure Vanilla CSS | Container queries |

---

## 7. Color Consistency

Primary cyan `#6ad1e3` is defined in:

| Location | Implementation |
|----------|---------------|
| `chart_menu.css` | CSS custom properties or direct hex |
| Tailwind templates | `bg-[#6ad1e3]`, `accent-[#6ad1e3]` |
| `config.js` | `COLORS.PRIMARY` constant |

---

## 8. Opportunities & Observations

### What Vanilla CSS Handles Better

1. **Complex pseudo-selectors** — `:hover`, `:focus`, `::before`, `::after`
2. **Transition animations** — Multi-property transitions with custom timing
3. **Container queries** — `@container` rules for credit display
4. **Legacy browser support** — Some components predate Tailwind adoption

### What Tailwind Handles Better

1. **Layout utilities** — Flex/grid with responsive variants
2. **Spacing** — Margin/padding at different breakpoints
3. **Quick prototyping** — Inline utility classes
4. **Consistency** — Standard spacing scale

### No Build Concern

Using Tailwind CDN means:
- Slower page loads (downloads entire Tailwind CSS)
- No tree-shaking of unused utilities
- No custom theme configuration
- But: Zero build complexity

### Potential Consolidation Targets

| Current State | Potential Improvement |
|---------------|----------------------|
| `lines_tab.html` pure vanilla | Could use Tailwind grid |
| `credit_tab.html` pure vanilla | Container queries require vanilla |
| Duplicate button styles | Could standardize with Tailwind or CSS classes |
| `#6ad1e3` hardcoded everywhere | Could use CSS custom property `--primary` |
