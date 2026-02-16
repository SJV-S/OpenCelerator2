# Standard Change Chart (SCC) — User Manual

> **INSTRUCTIONS FOR THE AI ANSWERING QUESTIONS FROM THIS MANUAL:**
>
> You are a helpful assistant answering questions about the Standard Change Chart (SCC) application. This document is your complete knowledge base.
>
> **Communication rules:**
> - Respond in plain, non-technical language. The user is comfortable with computers and apps but may not know the specific terminology used in the Standard Change Chart.
> - Avoid software/developer jargon entirely. Say "your browser's storage" not "IndexedDB", "a live connection" not "WebSocket", "a data file" not "JSON".
> - Use step-by-step numbered instructions when explaining how to do something. Always include exact navigation paths: which tab to open, which section to look in, which button to click.
> - If the user explicitly asks a technical question (mentions code, APIs, databases, encryption, etc.), you may switch to technical language for that answer only.
> - **Always use the UI labels the user actually sees**, not internal names. The four line categories are called **Event Markers**, **Count Markers**, **Cut Lines**, and **Change Lines** in the interface. Do not call them "phase lines", "aim lines", or "celeration lines" unless the user uses those terms first.
> - Briefly explain domain-specific terms (celeration, bounce envelope, aggregation, etc.) on first use in a conversation, but don't re-explain if the user has already shown they understand.
> - When a feature has a keyboard shortcut, always mention it.
> - If you are unsure about something, say so honestly. Do not invent features that are not described in this document.

---

## TABLE OF CONTENTS

1. [What is the Standard Change Chart?](#1-what-is-the-standard-change-chart)
2. [First Launch & Setup](#2-first-launch--setup)
3. [The Chart Explorer (Home Page)](#3-the-chart-explorer-home-page)
4. [Creating a New Chart](#4-creating-a-new-chart)
5. [Understanding What You See](#5-understanding-what-you-see)
6. [The Menu](#6-the-menu)
7. [Entering Data](#7-entering-data)
8. [Editing & Deleting Data](#8-editing--deleting-data)
9. [Series (Data Tracks)](#9-series-data-tracks)
10. [Drawing Lines on the Chart](#10-drawing-lines-on-the-chart)
11. [Event Markers](#11-event-markers)
12. [Count Markers](#12-count-markers)
13. [Cut Lines](#13-cut-lines)
14. [Change Lines (Trend Analysis)](#14-change-lines-trend-analysis)
15. [Editing & Deleting Lines](#15-editing--deleting-lines)
16. [Line Style Defaults](#16-line-style-defaults)
17. [Chart Settings](#17-chart-settings)
18. [Credits](#18-credits)
19. [The Legend](#19-the-legend)
20. [The Celeration Fan](#20-the-celeration-fan)
21. [The Crosshair](#21-the-crosshair)
22. [Fullscreen Mode](#22-fullscreen-mode)
23. [Sharing & Collaboration](#23-sharing--collaboration)
24. [Exporting (Screenshots, Spreadsheets, Chart Files)](#24-exporting)
25. [Importing Data from Spreadsheets](#25-importing-data-from-spreadsheets)
26. [Importing Chart Files](#26-importing-chart-files)
27. [Syncing Across Devices](#27-syncing-across-devices)
28. [Backups](#28-backups)
29. [Account & Identity](#29-account--identity)
30. [Keyboard Shortcuts & Touch Gestures](#30-keyboard-shortcuts--touch-gestures)
31. [Auto-Save](#31-auto-save)
32. [Troubleshooting](#32-troubleshooting)

---

## 1. WHAT IS THE STANDARD CHANGE CHART?

The Standard Change Chart (SCC) is a web application for tracking and visualizing data over time. You plot counts, errors, and timing data on a logarithmic chart, then use built-in analytical tools — event markers, count markers, change lines, and more — to identify trends and patterns.

It can be used for behavioral tracking, education, business metrics, or any scenario where you want to measure change over time.

The app works in any modern web browser (Chrome, Firefox, Safari, Edge) on desktops, laptops, tablets, and phones. It can also be installed as a standalone app on your device (see [Installing as an App](#installing-as-an-app) below), which means it works offline and appears as its own icon on your home screen or app drawer.

All data is stored locally in your browser by default. Nothing is sent to any server unless you explicitly turn on syncing or sharing.

### Installing as an App

SCC is a Progressive Web App (PWA). When your browser detects it can be installed, an **"Install App"** button appears in the top-right corner of the Chart Explorer.

1. Click **"Install App"**.
2. Your browser shows its native install prompt — confirm to install.
3. The app appears as a standalone icon on your home screen, taskbar, or app drawer.

Once installed, the app:
- Opens in its own window without a browser address bar.
- Works offline — all pages and assets are cached locally by a service worker.
- Auto-updates in the background when connected to the internet.

**Supported platforms**: Chrome and Edge on desktop and Android; Safari on iOS 16.4+. The install button only appears when the browser supports PWA installation and the app has not already been installed.

---

## 2. FIRST LAUNCH & SETUP

When you open the app for the first time, you see a welcome screen with two options:

### Create new user
1. Click **"Create new user"**.
2. Enter a **username**.
3. Select your use case: **Business**, **Teaching**, or **Both**.
4. Click **"Start using the Standard Change Chart"**.
5. You are taken to the Chart Explorer (home page).

There is no email, password, or sign-up process.

### Import existing user
Use this if you already have SCC data on another device or in a backup file.

1. Click **"Import existing user"**.
2. Choose one of two methods:
   - **Upload a backup file**: Click "Choose .json backup file..." and select the backup file you previously downloaded.
   - **Paste a sync link**: Paste a sync URL (generated from another device) into the URL field and click "Import from link".

---

## 3. THE CHART EXPLORER (HOME PAGE)

The Chart Explorer is the home page. It shows all your saved charts in a table.

### What you see
- A **search bar** at the top to find charts.
- A **table** listing all charts, with columns: Name, Type (Daily/Weekly/Monthly/Yearly), Tags, Shared.
- **Buttons in the top-right corner**:
  - **Paste Link** — Only visible when running as an installed app (no address bar). Opens a dialog where you can paste a share link or sync link to navigate to it. In a regular browser tab, you would paste the link directly in the address bar instead.
  - **Install App** — Appears when your browser supports installing the app (see Section 1). Hidden if already installed.
  - **Donate** — Opens a donation dialog with PayPal and Bitcoin (base chain and Lightning) options.
  - **Settings** (gear icon) — Opens the settings modal.
  - **New Chart** (teal button) — Create a new chart.

### Searching and filtering
- Type in the search bar to search. Choose the search mode using the radio buttons next to it:
  - **Name** (default) — searches chart names
  - **Credits** — searches credit fields (supervisor, organization, etc.)
  - **Tags** — searches tags you've assigned
- Check **"Filter Shared Charts"** to show only charts that have been shared.

### Managing charts
- **Open a chart**: Click its row in the table.
- **See credits without opening**: Click the expand arrow on the left side of a row.
- **Delete a chart**: Hover over a row, click the trash icon on the right. Confirm in the dialog. This cannot be undone.
- **Edit tags**: Hover over a row, click the tag/edit icon. Type comma-separated tags and click Save.
- **Pagination**: If you have many charts, use the Previous/Next buttons at the bottom.

### The Settings gear (top right)
Opens a modal with:
- **Sync Across Devices** toggle — turn syncing on/off
- **Username** — change your display name
- **Backup section** (expandable) — download backups, set backup reminders
- **Sync Device section** (expandable) — generate sync links, import backups from other devices

---

## 4. CREATING A NEW CHART

1. From the Chart Explorer, click the **"New Chart"** button (teal, top right).
2. Enter a **chart name**.
3. Choose **Minute** or **Count**:
   - **Minute**: You will record both counts and timing (how long you observed). The chart displays *frequency* (count per minute).
   - **Count**: You only record raw counts. No timing needed.
4. Click one of the **chart type** buttons:
   - **Daily** — each chart position = one day
   - **Weekly** — each position = one week (Monday to Sunday)
   - **Monthly** — each position = one calendar month
   - **Yearly** — each position = one year
   - **Frequency Collections** — (Coming Soon) visible in the interface but currently disabled
5. Your chart opens immediately.

Alternatively, click **"Import Chart"** at the bottom to upload an existing chart file (.json) exported from SCC or OpenCelerator.

---

## 5. UNDERSTANDING WHAT YOU SEE

When you open a chart, you see:

- **The chart area** taking up most of the screen. The horizontal axis shows time periods. The vertical axis shows values on a logarithmic scale (1, 10, 100, 1000...).
- **Data points** as colored symbols:
  - **Green dots** = Corrects
  - **Red X marks** = Errors
  - **Purple dashes** = Timing frequency (minute charts only)
- **Grid lines** — horizontal and vertical reference lines.
- **Credit information** — text labels below the chart (if filled in). On mobile, credits appear in the Credit tab instead.
- A **pan slider** — a horizontal range slider above the chart for scrolling through data that extends beyond the visible window. It is transparent by default and becomes visible when you hover over it. Drag the slider thumb left or right to pan through your data.
- A **return button** in the bottom-right corner to go back to the Chart Explorer.
- A **menu hint** near the bottom center of the screen — a white arrow icon (pointing up when the menu is closed, down when open) with a text box below it. On desktop it reads "Press spacebar for menu"; on mobile it reads "Swipe up for menu." The hint fades away after a few seconds.

### Why logarithmic?
A logarithmic scale shows proportional changes clearly. A change from 1 to 2 (doubling) looks the same size as a change from 50 to 100 (also doubling). This makes it easy to spot consistent rates of improvement or decline.

### What is "frequency"?
On a minute chart: frequency = count ÷ timing in minutes. If someone completed 30 items in 5 minutes, the frequency is 6 per minute. On a count chart, the raw count is plotted directly.

### What is the "chart window"?
The chart window controls how many time periods are visible at once. Default values vary by chart type: Daily = 7, Weekly = 5, Monthly = 6, Yearly = 5. If your data spans more time than the window shows, you can scroll left/right using the pan slider above the chart.

---

## 6. THE MENU

The menu is a panel with 7 tabs that gives you access to all chart features.

### Opening the menu
- Press **spacebar** on your keyboard
- **Swipe up** on a touch device
- Click the **arrow hint** at the bottom of the chart

### Closing the menu
- Press **spacebar** again
- **Swipe down** on a touch device
- Click outside the menu

### Desktop vs. mobile layout
- **Desktop** (screen width ≥ 1024px): The menu is a fixed sidebar on the left side of the screen (280–400px wide). It is always visible when open, and the chart area shifts right to make room. The Credit tab is hidden on desktop because credit fields are shown directly below the chart.
- **Mobile** (screen width < 1024px): The menu is a full-screen overlay that slides up from the bottom. All 7 tabs are available, including the Credit tab (which is the only place to view credits on mobile since they don't fit below the chart). Tabs are displayed as text-labeled buttons along the top of the menu.

### The 7 tabs
Tabs are labeled with plain text (no icons or numbers on the tab buttons themselves).

| Tab | What it does |
|-----|-------------|
| **Data** | Enter new data points, or view/edit/delete previous entries |
| **Credit** | View and edit the chart's credit labels (supervisor, performer, organization, etc.). Hidden on desktop where credits appear below the chart. |
| **Lines** | Access the four line drawing tools and their edit mode toggles |
| **Series** | Add/remove extra data tracks, customize how each series looks |
| **Settings** | Change chart name, type, window size, height, grid, and display options |
| **Share** | Take screenshots, export data/chart files, create share links |
| **Import** | Import data from spreadsheet files (CSV, Excel, ODS) |

---

## 7. ENTERING DATA

1. Open the menu (spacebar or swipe up). The **Data** tab opens with the **"New"** sub-tab active.
2. **Set the date**: Use the date picker in the center. The left/right arrow buttons move one day forward or back.
3. **Enter Corrects**: Type the number in the Corrects field.
4. **Enter Incorrects**: Type the number in the Incorrects field.
5. **Enter Timing** (minute charts only): Fill in at least one of the Hours, Minutes, or Seconds fields. The timing label turns red if this is missing.
6. **Enter Misc fields** (if you've added extra series): Additional input fields appear below.
7. Click **Submit** or press **Enter**.

The data point appears on the chart immediately and the menu closes.

### Validation
- All numeric input fields only accept digits (0–9). Non-numeric characters are silently stripped.
- On minute charts, at least one timing field (Hours, Minutes, or Seconds) must have a value. If all three are empty when you click Submit, the "Timing" label turns **red** and submission is blocked. Fill in a timing value and the label returns to normal.
- On count charts, timing fields are not shown and no timing validation occurs.

### Tips
- **Click on the chart to set the date**: When the Data tab is open, clicking a spot on the chart auto-fills the date field to that position's date.
- **Order doesn't matter**: You can enter data for any date in any order. The app sorts everything chronologically.
- **Date snapping**: On weekly charts, dates snap to Monday. On monthly charts, to the 1st. On yearly charts, to January 1st. Daily charts accept any date.
- **Duplicate dates**: If you add data to a date that already has data, both entries are kept. If more than 10 points land on one position, the app automatically switches to showing the median and notifies you.

---

## 8. EDITING & DELETING DATA

1. Open the menu → **Data** tab → click the **"Previous"** sub-tab.
2. Use the **left/right arrows** to navigate between existing data points by date. The currently selected date is shown in the center.
3. The recorded values for that date appear below.
4. To **edit**: Change the values and click **Update** (cyan button).
5. To **delete**: Click **Delete** (red button). The data point is removed immediately.

There is no undo. Changes and deletions are permanent.

---

## 9. SERIES (DATA TRACKS)

Every chart starts with built-in series: **Corrects** (green dots), **Errors** (red X marks), and **Timing** (purple dashes, minute charts only).

### Adding extra series
You can add up to 10 additional series (called "misc series"):
1. Open the menu → **Series** tab.
2. Click **"Add Series"** (button with a plus icon at the bottom of the series list).
3. The new series gets a unique color and symbol automatically.
4. Once added, a new input field appears in the Data tab when entering data.

### Customizing a series' appearance
1. Open the menu → **Series** tab.
2. Click on the **series name** in the list to expand its settings.
3. You can change:
   - **Line**: Style (solid, dashed, dotted, etc.), width (0–10), color
   - **Marker**: Symbol (circle, square, diamond, triangle, star, etc.), size (1–50), fill color, edge color
4. Click **Apply** to save, or **Reset** to revert to defaults.

### Renaming a series
1. In the Series tab, click the series heading to expand it.
2. Type a new name in the **"Display Name"** field.
3. Click **Apply**.

### Removing a misc series
1. In the Series tab, click the series heading.
2. Scroll down and click the **"Delete Series"** button (red).

### Aggregation
When multiple data points fall on the same chart position, they need to be combined. This is called aggregation.

**Setting aggregation** (per series):
1. In the Series tab, click a series to expand it.
2. Under **"Per-Position (on X)"**, select a method from the dropdown: Raw (default), Median, Mean, Min, Max, First, Last, or Sum.
3. Click **Add**.

**What "Raw" means**: Every data point is plotted individually at its position, even if multiple points share the same position. If any single position accumulates more than 10 data points, the app automatically switches that series to median aggregation to prevent visual clutter.

**Rolling window** (smoothing across positions):
1. Under **"Rolling Window (across X)"**, select a method.
2. Set the **window size** (e.g., 7 for a 7-period moving average).
3. Click **Add**.

This smooths out variation and makes trends easier to see.

---

## 10. DRAWING LINES ON THE CHART

The app has four types of lines you can draw, all accessed from the **Lines** tab in the menu. The Lines tab is organized into sections:

- **Event Markers** section (top) — contains two buttons for top/bottom event markers
- **Count Markers** section — contains two buttons for horizontal/diagonal count markers
- **Cut Series Line** section — contains the scissors button
- **Add Change Line** section — contains the change line button
- **Edit mode** toggles (bottom) — four switches labeled Event, Count, Cut, Change

Each line type is explained in its own section below.

---

## 11. EVENT MARKERS

Event markers are vertical lines with a horizontal arm and a text label. They mark when something changed — a new condition, a new phase, a program change, etc.

### How to draw one
1. Open the menu → **Lines** tab.
2. In the **"Event Markers"** section at the top, click one of two buttons:
   - **Top icon** — the line drops down from the top of the chart
   - **Bottom icon** — the line rises up from the bottom of the chart
3. The menu closes and your cursor changes to a crosshair.
4. **Click on the chart** where you want the vertical line placed. A temporary purple vertical line appears.
5. **Click again to the right** to set where the horizontal arm ends. A temporary purple horizontal line appears.
6. A **text input dialog** slides in from the top-right corner of the screen. It has the heading "Enter Event Marker Text", a text field (max 50 characters), and **Submit** / **Cancel** buttons. Type a label (e.g., "New program", "Week 3 change"). Press **Enter** or click **Submit** to continue. Press **Escape** or click **Cancel** to discard the line and exit drawing mode.
7. A confirmation prompt appears asking **"Save line?"** with **Yes** and **No** buttons. Click **Yes** to finalize the line, or **No** to discard it.

The event marker now appears with a vertical line, horizontal arm, and your label at the end.

On touch devices, tap instead of click — all line drawing modes fully support touch input.

---

## 12. COUNT MARKERS

Count markers are lines that mark target levels or goals. They can be flat (horizontal) or sloped (diagonal).

### How to draw one
1. Open the menu → **Lines** tab.
2. In the **"Count Markers"** section, click one of two buttons:
   - **Diagonal icon** — draw a sloped line between two points
   - **Horizontal icon** — draw a flat line at a specific Y-value
3. The menu closes and your cursor changes.
4. **Click on the chart** for the first point.
5. **Click again** for the second point. For horizontal lines, the second click only sets where the line ends — the height stays the same as your first click.
6. A **text input dialog** slides in from the top-right corner with the heading "Enter Event Marker Text", a text field (max 50 characters), and **Submit** / **Cancel** buttons. Type a label (e.g., "Goal: 50/min"). Press **Enter** or click **Submit** to continue. Press **Escape** or click **Cancel** to discard the line.
7. A confirmation prompt appears asking **"Save line?"** with **Yes** and **No** buttons. Click **Yes** to finalize the line, or **No** to discard it.

---

## 13. CUT LINES

Cut lines are vertical dividers that split your data into segments. Use them to separate before/after periods for comparison.

### How to draw one
1. Open the menu → **Lines** tab.
2. In the **"Cut Series Line"** section, click the **scissors icon** button.
3. The menu closes. A vertical guide line follows your cursor across the chart.
4. **Click** where you want to place the cut. The cut is placed and drawing mode deactivates automatically.

To place multiple cuts, repeat the process — each activation places one cut. On touch devices, touch and drag to position the guide line, then release to place the cut.

---

## 14. CHANGE LINES (TREND ANALYSIS)

Change lines are trend lines fitted to your data. They show the rate of change over a selected time range — whether things are getting better, getting worse, or staying the same.

### Configuring change line settings (before drawing)
Change line settings — fit method, bounce envelope, and forecast — are **global settings** that apply to all new change lines, not per-line options. Configure them before drawing:

1. Open the menu → **Lines** tab.
2. Click the **gear icon** next to the **"Add Change Line"** section heading.
3. A **"Change Line Settings"** modal appears with three controls:
   - **Fit Method** — a dropdown with 6 options (see below)
   - **Bounce Envelope** — a dropdown with 5 options (see below)
   - **Forecast** — a number input (0–100) with a unit label matching your chart type (e.g., "days", "weeks")
4. Changes apply immediately when you select them — there is no Save button. Click **Close** when done.

### How to draw one
1. Open the menu → **Lines** tab.
2. In the **"Add Change Line"** section, click the **line icon** button.
3. The menu closes. A notification appears with buttons for each data series (Corrects, Errors, Timing, and any misc series you've added).
4. **Click the series** you want to analyze.
5. Your cursor changes. **Click and drag** across a range on the chart. A shaded area highlights your selection.
6. The app automatically calculates and places a trend line using the current global settings (fit method, bounce envelope, and forecast configured via the gear icon).

### Fit methods
Six methods for calculating the trend:
- **Theil-Sen** (default) — robust, ignores outliers. Best for most situations.
- **Least-squares** — standard regression. Sensitive to outliers.
- **Quarter-intersect** — divides data into quarters, connects the medians of the first and last quarters.
- **Split-middle-line** — an improved version of quarter-intersect.
- **Mean** — a flat line at the average value.
- **Median** — a flat line at the middle value.

### Bounce envelopes
Bands above and below the change line that show data variability:
- **None** (default)
- **5-95 percentile** — captures 90% of the data
- **Interquartile range** — captures the middle 50%
- **Standard deviation** — one standard deviation above and below
- **90% confidence interval** — statistical confidence band

### The value label
The label on a change line shows the celeration value — the rate of change per time period:
- **×1.5** means values are multiplying by 1.5 each period (accelerating)
- **÷1.2** means values are dividing by 1.2 each period (decelerating)
- **×1.0** means no change (flat)

### Forecast
Setting a forecast number (e.g., 14) extends the change line beyond your selected data range by that many positions, showing where the trend projects.

### Requirements
At least **5 data points** must exist within the selected range.

---

## 15. EDITING & DELETING LINES

You cannot click on a line to edit it by default. Editing must be explicitly turned on.

### How to edit or delete a line
1. Open the menu → **Lines** tab.
2. At the bottom of the tab, find the **"Edit mode"** section with four toggle switches: **Event**, **Count**, **Cut**, **Change**.
3. Turn **ON** the toggle for the type of line you want to edit.
4. **Close the menu** (spacebar or swipe down).
5. Now **click on the line** on the chart.
6. An edit dialog appears where you can change the line's color, width, style, text, or remove it.

**Important**: All edit mode toggles turn OFF automatically every time you open the menu. This is intentional — the menu overlay covers the chart and blocks interaction with lines, so leaving edit mode on would be confusing. You must re-enable the toggle each time you want to edit a line.

---

## 16. LINE STYLE DEFAULTS

You can set default styles for new event markers and count markers so every new line you draw uses your preferred colors and sizes.

1. Open the menu → **Lines** tab.
2. Click the **gear icon** next to the **"Event Markers"** or **"Count Markers"** section heading.
3. A settings popup appears where you can set:
   - **Color** — line color
   - **Width** — line thickness
   - **Dash style** — solid, dashed, dotted, etc.
   - **Font color** — label text color
   - **Font size** — label text size
4. Changes are saved to your profile and apply to all future lines across all charts. Existing lines are not affected.

The change line section also has a gear icon, but it opens a different modal — the **Change Line Settings** for fit method, bounce envelope, and forecast (see Section 14).

---

## 17. CHART SETTINGS

Open the menu → **Settings** tab to access all display and configuration options.

### Chart Name
Type a new name in the **"Chart Name"** field at the top. Saved automatically.

### Chart Type
Use the **"Chart Type"** dropdown to switch between Daily, Weekly, Monthly, or Yearly. The page reloads to apply the change.

### Chart Window
Controls how many time positions are visible at once. The label shows the unit for your chart type (e.g., "Chart Window in Days"). Use the **left/right arrow buttons** next to the window number to decrease/increase. Each click adjusts by one snap increment (14 for Daily, 5 for Weekly, etc.).

- **Defaults**: Daily = 7, Weekly = 5, Monthly = 6, Yearly = 5
- **Minimum**: Daily = 28, Weekly = 10, Monthly = 24, Yearly = 20
- **Maximum**: The chart's full capacity (Daily = 280, Weekly = 200, Monthly = 240, Yearly = 200)

If your data extends beyond the visible window, scroll using the pan slider above the chart.

### Start Date
Click **"Start Date"** to open a modal dialog where you can set when the chart timeline begins. The modal shows spinbox controls (left/right arrow buttons around a value) — which spinboxes appear depends on chart type:
- **Daily**: Monday (week number 1–5), Month (1–12), Year
- **Weekly**: Month (1–12), Year
- **Monthly**: Year
- **Yearly**: Decade

Year and Decade fields accept direct text input. Click **Save** to apply or **Cancel** to discard. Changing the start date does not delete any data — it only shifts what's visible.

### Chart Height
Use the **minus/plus buttons** next to "Chart Height in Pixels" to make the chart shorter or taller. Each click adjusts by 30 pixels. Minimum height is 600 pixels; maximum is your screen height.

### Grid
Three toggles:
- **Date Lines** — vertical lines marking time periods
- **Count Lines** — horizontal lines marking value levels
- **Minor Grid** — smaller subdivision lines

### Celeration Fan
Toggle to show/hide the celeration fan (a visual reference overlay). Desktop only — hidden on mobile.

### Place Zeros Below Floor
When ON (default), zero values (and values below the floor threshold on minute charts) are plotted as visible markers just below the bottom gridline of the chart, using the same marker style as the series they belong to (green dots for Corrects, red X marks for Errors, etc.) but without connecting lines. When OFF, these values are invisible.

### Legend
Toggle to show/hide the legend box on the chart. When the legend is visible, a **"Legend Position"** dropdown lets you place it in any corner: Top Right (default), Top Left, Bottom Right, Bottom Left.

### Reset to Defaults
Button at the bottom that resets visual and layout settings. A confirmation prompt asks **"Reset all visual settings to defaults?"** with **Reset** / **Cancel** buttons.

What gets reset:
- **Chart window** → half of the chart's capacity
- **Chart height** → clears any custom height, reverts to the default flex layout
- **Grid toggles** → all OFF (date lines, count lines, minor grid)
- **Celeration fan** → ON
- **Place zeros below floor** → ON
- **Legend** → ON, positioned at Top Right

What is **not** reset: chart name, start date, data, drawn lines, and series configuration.

---

## 18. CREDITS

Credits are informational labels displayed below the chart. They have two rows of fields:
- **Row 1**: Supervisor, Performer, Timer, Counted, Advisor
- **Row 2**: Organization, Manager, Counter, Charter, Room

Fill in whichever fields are relevant to your use case and leave the rest blank.

**To view or edit**: Open the menu → **Credit** tab. On desktop, credits are also visible directly below the chart.

---

## 19. THE LEGEND

The legend is a small box on the chart showing which colors and symbols correspond to which data series.

- **Show/hide**: Menu → Settings tab → **Legend** toggle.
- **Position**: When the legend is on, use the **Legend Position** dropdown (same Settings tab) to choose a corner.
- **Toggle individual series**: **Click a series name** in the legend to hide or show it. Hidden series appear grayed out in the legend and their data points disappear from the chart. Click again to restore. The legend also has a collapsible section for toggling line categories (count markers, event markers, change lines, grid).

---

## 20. THE CELERATION FAN

The celeration fan is a visual reference overlay — a fan-shaped set of 9 lines radiating from a single point, each representing a different rate of change. Compare your data's change line to the fan lines to estimate the rate of acceleration or deceleration.

The 9 fan lines represent these celeration values:
**×16, ×4, ×2, ×1.4, ×1, ÷1.4, ÷2, ÷4, ÷16**

The ×1 line is horizontal (no change). Lines above ×1 show acceleration (values increasing); lines below show deceleration (values decreasing). The rate label (e.g., "per week", "per month") depends on your chart type.

- **Show/hide**: Menu → Settings tab → **Celeration Fan** toggle.
- **Move it**: When visible, drag the fan to reposition it on the chart.
- **Position**: On count charts the fan appears on the right side. On minute charts it appears on the left.
- **Desktop only**: The fan is hidden on mobile devices and small screens.

---

## 21. THE CROSSHAIR

The crosshair is a data inspection tool that shows detailed values at any position on the chart.

- **Activate**: Hold **Shift** and move your mouse over the chart.
- **What you see**: Gray dashed crosshair lines follow your cursor on a canvas overlay. Colored markers appear on data points at the current X position.
- **Info panel**: The crosshair replaces the menu sidebar (on desktop) or opens a panel with three sections:
  - **Date**: Day name and number, month name and number, year
  - **Cursor**: The X position (integer) and Y value at the cursor
  - **Series**: Each visible series' value at that X position, with the series name and aggregation info (if aggregation is active). If change lines cross the cursor's X position, their fit method label, trend Y value, and bounce envelope values are shown below their matching series.

---

## 22. FULLSCREEN MODE

- **Enter fullscreen**: Press **Shift+F**, or hover over the chart and click the **expand icon** in the top-right corner.
- **Exit fullscreen**: Press **Shift+F** again, or click the expand icon again.

---

## 23. SHARING & COLLABORATION

### Creating a share link
1. Open the menu → **Share** tab.
2. In the **"Sharing Links"** section at the bottom, you'll see two options side by side:
   - **View-only Link** (left) — the recipient can see the chart but not edit it
   - **Edit Link** (right) — the recipient can both view and modify the chart
3. Click the icon for the type of link you want.
4. The link is copied to your clipboard. A "Copied ✓" message confirms it.
5. Send the link to the other person however you like.

The recipient just opens the link in a browser. No account needed.

### Real-time collaboration
Shared charts update in real time. When anyone makes a change, all other viewers/editors see it instantly via a live connection.

### Stop sharing
In the Share tab, scroll to the bottom. If the chart is shared, a **"Stop sharing chart"** button appears in red. Click it to disable all share links.

### Simultaneous editing
Multiple people can edit via edit links. If two people save changes at the exact same moment, the last save wins — there is no merge. When a remote update arrives, the other editor's chart reloads and replots automatically with the new data. There is no conflict warning — any unsaved local changes are silently replaced by the incoming version. In practice this rarely matters because saves happen frequently (every ~1 second).

---

## 24. EXPORTING

All export options are in the menu → **Share** tab, in the top three sections:

### Screenshot
Click the **camera icon** under "Screenshot". A high-quality PNG image of the chart is downloaded. The filename matches your chart name.

### Export Data (spreadsheet)
Click the **CSV icon** under "Export Data". A CSV file is downloaded with all data points — dates, corrects, errors, timing (if applicable), and any misc series. Open it in Excel, Google Sheets, or any spreadsheet program.

### Export Chart File
Click the **file icon** under "Export File". A .json data file is downloaded containing the complete chart — all data, lines, settings, credits, and styling. This file can be imported back into SCC later.

---

## 25. IMPORTING DATA FROM SPREADSHEETS

You can bulk-import data from spreadsheet files. Supported formats: **CSV** (.csv), **Excel** (.xlsx, .xls), **OpenDocument Spreadsheet** (.ods).

### How to import
1. Open the menu → **Import** tab.
2. **Drag and drop** a file onto the drop zone, or **click** to browse for a file.
3. A **column mapping** screen appears showing your file's columns.
4. Use the dropdowns to map each column:
   - **Date** (required) — which column contains dates
   - **Corrects** — which column has correct counts
   - **Errors** — which column has error counts
   - **Minutes** (minute charts only, required) — which column has timing data
   - Click **"+ Add Column"** to map additional misc series
5. If your chart already has data, check **"Replace existing data"** to overwrite it. Leave unchecked to merge.
6. Click **Import**.

### Helpers
Before selecting a file, you'll see two links at the top of the Import tab:
- **"Download example template"** — downloads a CSV with the correct column headers.
- **"Copy AI formatting prompt"** — copies a prompt you can paste into an AI assistant to help format your data.

### Supported date formats
ISO (2024-03-15), US (03/15/2024), European (15.03.2024), text (15-Mar-2024, March 2024), and many more.

### Data rules
- Empty cells = missing data (not zero)
- Negative values are rejected
- At least one data column must be mapped
- Invalid dates are skipped

---

## 26. IMPORTING CHART FILES

You can import complete chart files (data + lines + settings + styling).

### From SCC
1. Go to the Chart Explorer.
2. Click **"New Chart"**.
3. Click **"Import Chart"** at the bottom of the page.
4. Select a .json file previously exported from SCC.
5. The chart is imported with everything intact.

### From OpenCelerator
SCC can also import chart files from OpenCelerator. The format is auto-detected. Note:
- Data and series styles (colors, markers) are imported.
- Event markers, count markers, and change lines are **not** imported and would need to be redrawn.

---

## 27. SYNCING ACROSS DEVICES

### Setting up sync
1. On your **current device**: Go to the Chart Explorer → click the **Settings** gear icon (top right).
2. Turn on **"Sync Across Devices"**.
3. Expand the **"Sync Device"** section by clicking it.
4. Click **"Generate sync link"**.
5. A **QR code** and **URL** appear, along with a **countdown timer** (MM:SS format). The link is one-time-use and expires after **15 minutes**. When the timer reaches zero, the link becomes invalid and the UI resets so you can generate a new one.
6. On your **new device**, either:
   - Scan the QR code, or
   - On the welcome screen, choose "Import existing user" → "Paste Sync Link" → paste the URL → click "Import from link"
7. Your identity transfers. Charts begin syncing.

### How sync works
- Every change you make is saved locally, then pushed to the server automatically (after a brief delay).
- When you open the Chart Explorer or a chart, the app checks the server for newer versions and downloads them.
- Shared charts sync in real time via a live connection.
- All data is **encrypted on your device** before being sent. The server cannot read your charts.

### Offline
Changes are saved locally and queued. When you go back online and open the app, queued changes sync automatically.

### Cost
Syncing is free.

---

## 28. BACKUPS

### Downloading a backup
1. Chart Explorer → **Settings** gear icon.
2. Expand the **"Backup"** section.
3. Click **"Download backup"**.
4. A file is downloaded containing all your charts and identity. Store it somewhere safe.

The filename follows the pattern: `YourName-scc-full-backup-YYYY-MM-DD.json` (or `scc-full-backup-YYYY-MM-DD.json` if no display name is set). Spaces in names are replaced with hyphens.

### Restoring from a backup
Two options:
- **On first launch**: Welcome screen → "Import existing user" → "Upload Backup File" → select the file.
- **From settings**: Chart Explorer → Settings → expand "Sync Device" → **"Import backup"** → select the file. You'll be asked whether to keep existing charts or start fresh.

### Backup reminders
1. In Settings → Backup section.
2. Check **"Remind me to back up"**.
3. Set the interval (e.g., every 7 days, every 2 weeks, every 1 month).
4. The app will remind you when it's time.

### What's included
Everything: your identity, all charts (data, lines, settings, credits, styling), and all preferences.

---

## 29. ACCOUNT & IDENTITY

SCC does not use traditional accounts with emails and passwords. Instead:

- When you first enable sync, a secret **passphrase** is generated automatically. This passphrase is stored only in your browser and is never sent to any server.
- The passphrase is the root of your identity — it generates your encryption keys and unique user ID.
- Syncing the passphrase to another device (via sync link or backup) is what makes both devices share the same identity.

### Changing your username
Chart Explorer → Settings gear → type a new name in the **"Username"** field.

### If you clear your browser data
You will lose your identity and all charts. The app detects the missing identity and automatically redirects you to the welcome screen (the same screen you saw on first launch), where you can either create a new user or import an existing one. Restore from a backup file or by using a sync link from another device.

### Multiple devices
Set up device sync (see section 27). Both devices then share the same identity and keep charts in sync.

---

## 30. KEYBOARD SHORTCUTS & TOUCH GESTURES

### Keyboard
| Shortcut | Action |
|----------|--------|
| **Spacebar** | Open/close the menu |
| **Shift + F** | Toggle fullscreen |
| **Shift + Mouse Move** | Activate crosshair |
| **Enter** | Submit data (when in the data entry form) |
| **Left/Right Arrows** | Adjust date by one day (when the date field is focused) |

### Touch
| Gesture | Action |
|---------|--------|
| **Swipe Up** | Open the menu |
| **Swipe Down** | Close the menu |
| **Drag on chart** | Pan/scroll horizontally |
| **Tap on chart** | Place a point when drawing event markers, count markers, or cut lines (same as clicking) |
| **Touch and drag** | Select a range when drawing change lines (same as click-and-drag) |

---

## 31. AUTO-SAVE

The app saves your work automatically. Every time you enter data, draw a line, or change a setting, the chart is saved to your browser's storage after a brief delay (about 1 second). There is no "Save" button and no visual save indicator — saving happens silently in the background.

If sync is enabled, the chart is also pushed to the server after each save.

---

## 32. TROUBLESHOOTING

### My chart looks empty even though I entered data
- **Scroll to your data**: Your data might be outside the visible window. Use the pan slider above the chart (hover to reveal it), or increase the chart window size in **Menu → Settings → Chart Window**.
- **Check the start date**: In **Menu → Settings → Start Date**, make sure it's set before your earliest data.
- **Check zero handling**: If all values are zero and "Place Zeros Below Floor" is off (**Menu → Settings**), they'll be invisible. Turn it on.
- **Check series visibility**: Hover over the legend and make sure your series aren't hidden.

### I can't click on a line to edit it
Line editing must be explicitly turned on. Go to **Menu → Lines tab → Edit mode** (bottom) → turn on the toggle for the line type you want to edit. Close the menu, then click the line. Remember: toggles reset every time you open the menu.

### My imported data has wrong dates
Check that you mapped the correct column to "Date" during the column mapping step. If the format isn't being recognized, reformat dates to YYYY-MM-DD in your spreadsheet and re-import.

### The celeration fan isn't showing
The fan is desktop-only — it's hidden on phones and small screens. Make sure the toggle is on: **Menu → Settings → Celeration Fan**.

### A shared chart isn't updating
Real-time sync needs an active internet connection. The app maintains a live connection that automatically reconnects with increasing delays (starting at 1 second, up to 30 seconds) if it drops. On reconnect, it catches up on any missed changes. If updates still aren't coming through, reloading the page forces a fresh connection and a pull from the server.

### I accidentally deleted something
There is no undo feature. Deletions of data points, lines, and charts are permanent. Regular backups are strongly recommended.

### The app is slow with lots of data
Try:
- Switching to aggregation (median or mean) in **Menu → Series** to reduce rendered points
- Reducing the chart window size in **Menu → Settings**
- Using a rolling window aggregation

### How do I completely reset the app?
Open your browser's developer console (usually F12) and type `nuke()`. This erases everything — all charts, your identity, and all local data — then reloads the app. **This cannot be undone.**

---

*This manual covers all features of the Standard Change Chart as of February 2026.*
