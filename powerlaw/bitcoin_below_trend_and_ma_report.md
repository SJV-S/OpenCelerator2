# Bitcoin: Periods Below the Power Law Trendline and 365-Day Moving Average

**Date:** 2026-02-28
**Dataset:** CoinGecko BTC/USD daily, 4,677 data points, Apr 28 2013 -- Feb 17 2026
**Model:** Power law fitted on daily data: a = -14.9379, b = 5.2553, RMSE = 0.2729, R² = 0.910
**MA:** 365-day simple moving average (trailing arithmetic mean of daily closes)

Periods with gaps of 14 days or fewer are consolidated into single periods. Flicker periods under 7 days are excluded from the trend-only and MA-only sections (but their days are counted in the totals).

---

## 1. Summary at a Glance

| Condition | Days | % of data | Sustained periods |
|---|--:|--:|--:|
| Above both indicators | 1,536 | 35.6% | -- |
| Below trendline only | 1,396 | 32.4% | 7 |
| Below 365-day MA only | 416 | 9.6% | 5 |
| **Below BOTH** | **965** | **22.4%** | **8** |

Total days with 365-day MA available: 4,313.

Bitcoin spends roughly a quarter of its time in the most bearish zone -- below both the long-term power law trend and its own trailing yearly average. It is above both indicators only about 36% of the time.

---

## 2. Below BOTH the Trendline AND the 365-Day MA

These are the periods of deepest structural weakness -- price has broken below the long-term growth model *and* its own recent momentum. Every instance corresponds to a known bear market or crash event.

**8 consolidated periods, 965 days total**

| # | Period | Duration | Price Range | Avg vs Trend | Avg vs MA | Deepest vs Trend | Context |
|--:|---|---|---|--:|--:|--:|---|
| 1 | 2014-10-04 -- 2014-10-07 | 4 days | $325 -- $332 | -1.5% | -42.0% | -2.3% | Brief flicker before main bear |
| 2 | 2014-10-25 -- 2015-10-21 | 362 days (11.9 mo) | $172 -- $419 | -47.2% | -32.6% | -70.2% | Post-Mt. Gox bear market |
| 3 | 2018-11-17 -- 2019-05-03 | 168 days (5.5 mo) | $3,217 -- $5,639 | -36.5% | -38.9% | -47.0% | Post-2017-bubble capitulation |
| 4 | 2019-11-25 -- 2019-11-25 | 1 day | $6,936 | -27.3% | -1.1% | -27.3% | Brief flicker |
| 5 | 2019-12-15 -- 2020-01-06 | 23 days (0.8 mo) | $6,627 -- $7,488 | -27.5% | -1.6% | -32.6% | Pre-COVID softness |
| 6 | 2020-03-09 -- 2020-05-25 | 78 days (2.6 mo) | $5,033 -- $9,959 | -34.5% | -12.2% | -54.4% | COVID crash + recovery |
| 7 | 2022-06-12 -- 2023-03-14 | 276 days (9.1 mo) | $15,742 -- $28,374 | -38.5% | -38.8% | -53.7% | LUNA/FTX bear market |
| 8 | 2025-11-15 -- 2026-02-17 | 95 days (3.1 mo) | $62,854 -- $97,008 | -12.3% | -14.9% | -38.3% | Current period |

### Observations

- The three major bear periods (2, 3, 7) lasted **168--362 days** and averaged **-41%** below trendline.
- The COVID crash (6) was intense (-54.4% deepest vs trend) but short (78 days), with rapid recovery.
- Periods 1, 4, and 5 are brief flickering episodes near the boundary -- price was hovering at the trendline and dipping just below.
- The current period (8) is **95 days in** with average deviations of -12.3% (trend) and -14.9% (MA) -- shallower than every prior major bear. However, the deepest single-day deviation (-38.3% on Feb 6 2026) is already comparable to the average deviations of the 2018--19 bear.

---

## 3. Below the Trendline Only (above the 365-Day MA)

Price sits below the power law trend but is still riding above its own trailing yearly average. This is typically the long recovery phase after a bear market bottom, or a consolidation zone.

**7 sustained periods (>= 7 days), 1,496 days total**

| # | Period | Duration | Price Range | Avg vs Trend | Avg vs MA |
|--:|---|---|---|--:|--:|
| 1 | 2015-10-17 -- 2017-08-02 | 656 days (21.6 mo) | $262 -- $3,014 | -49.0% | +59.4% |
| 2 | 2019-05-04 -- 2019-05-19 | 16 days (0.5 mo) | $5,716 -- $8,192 | -7.5% | +21.6% |
| 3 | 2019-09-25 -- 2020-03-08 | 166 days (5.5 mo) | $6,627 -- $10,329 | -14.4% | +15.0% |
| 4 | 2020-04-30 -- 2020-11-08 | 193 days (6.3 mo) | $8,605 -- $15,553 | -20.4% | +19.2% |
| 5 | 2023-03-15 -- 2024-02-26 | 349 days (11.5 mo) | $24,471 -- $52,287 | -28.5% | +30.0% |
| 6 | 2024-06-25 -- 2024-07-15 | 21 days (0.7 mo) | $55,880 -- $62,820 | -2.4% | +28.8% |
| 7 | 2024-08-03 -- 2024-11-05 | 95 days (3.1 mo) | $53,923 -- $72,781 | -4.9% | +17.2% |

### Observations

- This is the **most common bearish condition** (1,396 days, 32.4%).
- Period 1 (Oct 2015 -- Aug 2017) is the classic post-bear recovery: price was rising fast enough to be well above its MA (+59% avg) but the power law model ran even faster, keeping it below trend for **656 consecutive days**.
- Periods 4 and 5 show the same pattern: slow grinds where price climbs (above MA) but hasn't caught up to the trendline yet.
- These periods resolve **upward** -- eventually price catches the trendline during a bull leg. Every single one of these periods ended with price breaking above the trendline.

---

## 4. Below the 365-Day MA Only (above the trendline)

Momentum has rolled over (price below its own recent average) but price is still above the long-term power law model. This is typically the early stage of a bear market, before price falls far enough to break below the trendline.

**5 sustained periods (>= 7 days), 450 days total**

| # | Period | Duration | Price Range | Avg vs Trend | Avg vs MA |
|--:|---|---|---|--:|--:|
| 1 | 2014-08-14 -- 2014-10-24 | 72 days (2.4 mo) | $325 -- $521 | +36.3% | -21.3% |
| 2 | 2014-11-09 -- 2014-11-24 | 16 days (0.5 mo) | $349 -- $419 | +1.8% | -35.1% |
| 3 | 2018-05-27 -- 2018-11-16 | 174 days (5.7 mo) | $5,687 -- $8,422 | +35.2% | -19.0% |
| 4 | 2021-12-18 -- 2022-06-11 | 176 days (5.8 mo) | $28,647 -- $50,901 | +52.8% | -14.9% |
| 5 | 2025-11-05 -- 2025-11-16 | 12 days (0.4 mo) | $94,456 -- $105,909 | +7.3% | -0.9% |

### Observations

- This is the **rarest condition** (416 days, 9.6%) -- it is transitional and unstable.
- Periods 1, 3, and 4 each directly preceded a major "below both" bear market (2014--15, 2018--19, 2022--23 respectively). In every case, price continued falling until it broke below the trendline too.
- Period 5 (Nov 2025) is the current cycle's instance: price broke below the MA on Nov 5, then broke below the trendline on Nov 15, entering the "below both" zone within **10 days**. This is consistent with the historical pattern of MA-only being an early warning.

---

## 5. Comparative Analysis

### How the two indicators differ

| Characteristic | Power Law Trendline | 365-Day Moving Average |
|---|---|---|
| Nature | Long-term structural model (all-history fit) | Short/medium-term momentum indicator |
| Sensitivity to recent price | None -- changes only with regression refit | High -- directly tracks last 365 days |
| Signal type | "Is Bitcoin undervalued vs its growth model?" | "Is Bitcoin losing momentum?" |
| Days below (total) | 2,361 (54.7%) | 1,381 (32.0%) |
| Longest single period below | 910 days (Nov 2014 -- Jun 2017) | 428 days (Aug 2014 -- Oct 2015) |

### Overlap and divergence

```
                          Below Trendline
                    ┌──────────────────────────────┐
                    │                              │
                    │   1,396 days                 │
                    │   (trend only)               │
                    │          ┌─────────────┐     │
                    │          │             │     │
                    │          │  965 days   │     │
                    │          │   (BOTH)    │     │
                    │          │             │     │
                    │          └─────────────┘     │
                    │                    │         │
                    └────────────────────┼─────────┘
                                         │
                                416 days │
                                (MA only)│
                                ─────────┘
                             Below 365-day MA
```

- **2,361 days** below the trendline (54.7%) -- Bitcoin spends more than half its time below its own power law trend, reflecting the model's tendency to be pulled upward by parabolic bull runs.
- **1,381 days** below the 365-day MA (32.0%) -- a tighter, momentum-focused measure.
- **965 days** below both (22.4%) -- the intersection, isolating the most bearish conditions.
- The trendline is a **broader net** (catches more days); the MA is more **selective**. Using both as a joint filter reduces false signals and isolates genuine bear markets.

### Sequencing pattern

The daily data confirms a consistent sequence across bear markets:

**Entering a bear (the current period followed this exact sequence):**
1. Price drops below the **365-day MA** first (early warning -- momentum fading)
2. Price then falls below the **trendline** (structural weakness confirmed -- "below both" zone)

| Bear market | MA broke first | Trend broke (entered "below both") | Gap |
|---|---|---|---|
| 2014--15 | Aug 14, 2014 | Oct 4, 2014 | 51 days |
| 2018--19 | May 27, 2018 | Nov 17, 2018 | 174 days |
| 2022--23 | Dec 18, 2021 | Jun 12, 2022 | 176 days |
| **2025--26** | **Nov 5, 2025** | **Nov 15, 2025** | **10 days** |

**Exiting a bear:**
1. Price recovers above the **365-day MA** first (momentum returning while still below trend)
2. Price finally recovers above the **trendline** (full recovery)

| Bear market | MA recovered | Trend recovered | Gap |
|---|---|---|---|
| 2014--15 | Oct 17, 2015 | -- (stayed below trend until Aug 2017) | 656+ days |
| 2018--19 | May 4, 2019 | May 14, 2019 | 10 days |
| 2022--23 | Mar 15, 2023 | Feb 27, 2024 | 349 days |

---

## 6. Current Period in Context (Nov 2025 -- Feb 2026)

| Metric | Current (95 days) | 2014--15 bear | 2018--19 bear | 2022--23 bear |
|---|---|---|---|---|
| Duration | 95 days | 362 days | 168 days | 276 days |
| Avg vs trendline | -12.3% | -47.2% | -36.5% | -38.5% |
| Avg vs MA | -14.9% | -32.6% | -38.9% | -38.8% |
| Deepest vs trendline | -38.3% | -70.2% | -47.0% | -53.7% |
| Deepest vs MA | -37.4% | -65.8% | -60.5% | -56.2% |

The current period's average deviations are shallower than every prior major bear. However, it is also younger -- the 2014 and 2022 bears both deepened significantly after their 95th day. The deepest single-day deviation (-38.3% vs trend, Feb 6 2026) is already approaching the average level of the 2018--19 bear, suggesting the downturn has had sharp moments even if the average has been milder.

The notably short gap between the MA break (Nov 5) and the trend break (Nov 15) -- just 10 days vs 51--176 days in prior bears -- means the transition into "below both" was unusually fast this cycle.

---

## 7. Note on Using This Data for Collateralised Lending Decisions

This analysis uses **daily closing prices**. If you are evaluating this data in the context of a Bitcoin-backed loan (e.g., Ledn), be aware that the actual liquidation trigger mechanics may operate on a different timescale:

- **Intraday drawdowns can exceed daily close-to-close drawdowns.** A day that closes at -25% may have touched -35% intraday. Our data does not capture this.
- **Ledn's liquidation trigger methodology is not publicly disclosed.** Their legal agreement says collateral value is determined "in Ledn's sole discretion." No specific pricing method (spot, VWAP, average), monitoring frequency, or grace period is defined. S&P's analysis of Ledn's ABS deal references an "LTV EOD trigger," hinting at end-of-day checks, but this is not confirmed by Ledn.
- **Ledn specifies no cure period** between margin call (70% LTV) and liquidation (80% LTV). Competitors like Strike and Arch explicitly provide 24 hours. Ledn's agreement says the borrower must act "immediately."

The drawdown probabilities derived from this daily data should therefore be treated as a **lower bound** for intraday-triggered liquidation scenarios. See the companion report (`ledn_btc_loan_assessment.md`, Section 8) for full details on Ledn's liquidation mechanics and what is and isn't disclosed.

---

*Analysis based on CoinGecko BTC/USD daily data and a power law model fitted in log-log space. The 365-day moving average uses the simple arithmetic mean of the trailing 365 daily closes. Periods with gaps <= 14 days are consolidated; flicker periods < 7 days are excluded from trend-only and MA-only sections.*
