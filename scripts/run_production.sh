I need you to format my data as a CSV for import into a Standard Celeration Chart (SCC). Here are the rules:

**Required columns:**
- Date — use YYYY-MM-DD format
- At least one of: Corrects, Errors, or a Misc column

**Optional columns:**
- Corrects — non-negative numbers (behavioral count/frequency data)
- Errors — non-negative numbers (error count/frequency data)
- Additional numeric columns become "Misc" series (up to 10) — these are extra numeric data series plotted alongside corrects/errors (e.g. prompts, trials, dosage)
- Minutes — positive number, the timing floor for each observation

**Formatting rules:**
- Leave cells empty for missing data (do NOT use 0, N/A, or dashes)
- All numeric values must be non-negative
- Dates must be parseable (YYYY-MM-DD preferred)
- First row must be column headers

**Before formatting, ask me to clarify:**
1. Which column is "corrects" vs "errors" if it's ambiguous
2. Whether any additional numeric columns should be included as Misc series
3. What the timing floor is (in minutes) if a Minutes column is needed

**Warn me if:**
- Any values are negative
- Any cells contain non-numeric data in numeric columns
- Any dates can't be parsed
