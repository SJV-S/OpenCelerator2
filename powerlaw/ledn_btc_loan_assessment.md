# Ledn Bitcoin-Backed Loan: Current Conditions Assessment

**Date:** 2026-02-28
**BTC price at analysis:** $68,908 (Feb 17, 2026 -- last data point in CSV)
**Data source:** CoinGecko BTC/USD daily, 4,677 data points, Apr 28 2013 -- Feb 17 2026
**Model:** Power law fitted on daily data: a = -14.9379, b = 5.2553, RMSE = 0.2729, R² = 0.910

---

> **IMPORTANT: Ledn is unavailable to Swedish residents.** As of April 1, 2025, Ledn suspended new loan originations (including B2X) for residents of Sweden and several other EU countries. Existing loans can run to maturity but cannot be renewed or refinanced. Ledn states it is pursuing MiCA CASP authorization but provides no timeline. This report was originally written as a quantitative modelling exercise before the Sweden restriction was confirmed. The path risk analysis and power law modelling remain useful as a reference framework for evaluating *any* 50% LTV / 80% liquidation loan, but **Ledn itself is not a viable option for a Swedish private individual.**
>
> Additional disqualifiers beyond geography: fully custodial (BitGo holds all keys, no client multisig), USD-denominated only (FX risk for SEK/EUR borrowers), collateral transferred to unnamed institutional funding partner on Custodied loans, undisclosed FTX/Alameda exposure in 2022 (never quantified), TOS not publicly readable before account creation. See `btc_lender_comparison_sweden.md` for viable alternatives (Firefish, Debifi).

---

## 1. Ledn Loan Terms (current as of early 2026)

Since July 2025, Ledn offers only **Custodied Loans** (Standard Loans discontinued). Collateral is described as held in segregated addresses and not lent out, but is transferred ("re-posted") to an unnamed "institutional USD funding partner" (described as a regulated bank or credit fund). Ledn will not identify this counterparty. The collateral is claimed to be "legally ring-fenced" from the funding partner's assets, but this has never been tested in insolvency proceedings. **Fully custodial — BitGo holds all three keys; no client multisig.**

| Parameter | Value |
|---|---|
| Starting LTV | **50%** |
| APR | **12.9%** (US/Canada: **11.9%**, admin fee waived) |
| Admin fee | **2%** of principal (waived US/Canada) |
| Term | **12 months**, bullet repayment (no monthly payments) |
| Margin call | **70% LTV** (alert + option to add collateral) |
| Auto top-up trigger | **70% LTV** (restores to ~65% if enabled and BTC available) |
| Liquidation | **80% LTV** (automatic, irreversible -- see Section 8) |
| Auto-renewal threshold | LTV **<= 65%** at maturity |
| Early repayment penalty | **None** |
| Min collateral | $1,000 equivalent in BTC |
| Min loan | $500 |
| Credit check | None required |
| Disbursement | USDC (minutes) or USD wire (~18 hours) |

---

## 2. Illustrative Loan at Last Dataset Price

All figures below use the CSV's last daily close (**$68,908**, Feb 17 2026) as a reference price. Substitute your actual BTC price at time of borrowing -- the ratios and percentages stay the same.

| Item | Formula | Amount |
|---|---|---|
| Loan amount | price × 50% LTV | **$34,454** |
| Admin fee | loan × 2% | $689 (waived US/CA) |
| Net proceeds | loan − fee | $33,765 ($34,454 US/CA) |
| Owed at maturity | loan × 1.129 | **$38,898** |
| Interest cost | owed − loan | $4,444 |

### Critical price levels during the loan

These are fixed at origination. A 50% LTV loan always triggers margin call at a -28.6% drop and liquidation at a -37.5% drop, regardless of the starting price.

| Event | Formula | BTC Price | Drop from entry |
|---|---|--:|--:|
| Margin call (70% LTV) | loan ÷ 0.70 | **$49,220** | **-28.6%** |
| Liquidation (80% LTV) | loan ÷ 0.80 | **$43,067** | **-37.5%** |
| Auto-renewal at maturity (65% LTV) | owed ÷ 0.65 | $59,844 | -13.1% |

---

## 3. Where These Levels Sit on the Power Law Model

The power law model projects these values for **Feb 2027** (12 months out):

| Band | Feb 2027 Price | LTV if at this price at maturity |
|---|--:|--:|
| -2σ floor | $39,311 | 98.9% (liquidated during term) |
| -1σ support | $73,515 | 52.9% (auto-renewable) |
| Trend | $137,479 | 28.3% (comfortable) |
| +1σ | $257,096 | 15.1% (comfortable) |

The margin call price ($49,220) sits between -2σ and -1σ. The liquidation price ($43,067) sits near the -2σ floor.

Price does not need to *end* at these levels -- it only needs to *touch* them at any point during the 12-month term. This is the path risk, which is quantified below using daily data.

---

## 4. Historical Path Risk: Daily Data Analysis

Using **4,312 overlapping 365-day windows** from daily data (Apr 2013 -- Feb 2025). For each day, the analysis records the worst drawdown at any point during the following 365 days, and the return at the end of the 365 days.

### All starting points (unconditional) — 4,312 windows

**Max drawdown during the 365-day path:**

| Metric | Value |
|---|---|
| Median | -19.3% |
| Mean | -27.0% |
| 25th percentile | -49.6% |
| 10th percentile | -64.1% |
| 5th percentile | -70.6% |
| Worst | -83.6% |

**Margin call and liquidation probability:**

| Threshold | Probability | Of those, BTC ended the year positive anyway |
|---|---|---|
| Margin call (-28.6%) | **39.3%** (1,695 / 4,312) | 35.9% (609 / 1,695) |
| Liquidation (-37.5%) | **34.7%** (1,497 / 4,312) | 29.4% (440 / 1,497) |

10.2% of all starting days would have been liquidated despite BTC finishing the year higher.

**12-month forward return:**

| Metric | Value |
|---|---|
| Median | +76.2% |
| Mean | +146.8% |
| % positive | 72.0% |
| 25th percentile | -10.1% |
| 10th percentile | -54.1% |

---

### By starting condition — drawdowns and liquidation risk

| Starting condition | Windows | Median max drawdown | P(margin call) | P(liquidation) | Liquidated but year ended positive |
|---|--:|--:|--:|--:|--:|
| **Above both** | 1,273 | -44.9% | **61.1%** | **55.9%** | 6.3% of starts |
| **Below MA only** (above trend) | 410 | -55.7% | **100.0%** | **99.8%** | 42.0% of starts |
| **Below trend only** (above MA) | 1,420 | -5.0% | **10.4%** | **7.1%** | 7.1% of starts |
| **Below both** (current) | 871 | -12.0% | **15.6%** | **8.4%** | 5.3% of starts |

### By starting condition — 12-month forward returns

| Starting condition | Windows | Median return | Mean return | % positive | 10th pctl | 25th pctl |
|---|--:|--:|--:|--:|--:|--:|
| **Above both** | 1,273 | -15.6% | -0.5% | 39.0% | -65.7% | -52.1% |
| **Below MA only** (above trend) | 410 | -13.7% | -1.8% | 42.0% | -50.9% | -39.0% |
| **Below trend only** (above MA) | 1,420 | +183.3% | +335.2% | 100.0% | +90.3% | +122.5% |
| **Below both** (current) | 871 | +92.7% | +135.4% | 96.9% | +28.0% | +45.8% |

---

### Current condition: below both — detailed path risk

871 daily windows where BTC started below both the trendline and the 365-day MA:

| Metric | Value |
|---|---|
| **P(margin call during term)** | **15.6%** (136 / 871) |
| **P(liquidation during term)** | **8.4%** (73 / 871) |
| Of margin calls, year ended positive anyway | 80.1% (109 / 136) |
| Of liquidations, year ended positive anyway | 63.0% (46 / 73) |
| **P(liquidated AND year ended positive)** | **5.3%** (46 / 871) |
| Median max drawdown | -12.0% |
| 10th percentile max drawdown | -34.2% |
| 5th percentile max drawdown | -47.5% |
| Median 12-month return | +92.7% |
| % of windows with positive 12-month return | 96.9% |

The 5.3% figure is the core path risk: the probability that you get liquidated mid-term and then watch BTC finish the year higher -- a loss caused not by BTC declining, but by the *path* BTC took to get to a higher price.

The 73 liquidation days cluster into just three historical episodes:
- **Late 2014 -- early 2015:** post-Mt. Gox, drawdowns of -39% to -55%, bottoming ~30--100 days into the window
- **Nov 2018:** post-bubble capitulation, drawdowns of -42% to -43%, bottoming ~27--28 days in
- **Jun 2022:** LUNA/FTX collapse, drawdowns of -41% to -45%, bottoming ~150 days in

---

## 5. Probabilistic Scenario Matrix

Combining the power law model, Ledn's terms, and daily historical distributions:

| Scenario | Est. Probability | BTC at Maturity | LTV at Maturity | Net Outcome |
|---|--:|--:|--:|---|
| **Bull (above trend)** | ~30-35% | >$137,000 | <28% | Comfortably renewable; large equity cushion |
| **Base (trend to +1σ)** | ~20-25% | $73k--$137k | 28--53% | Renewable; healthy position |
| **Flat / mild recovery** | ~25-30% | $55k--$73k | 53--71% | Renewal borderline; may need to repay or refinance |
| **Extended bear (-1σ)** | ~10-15% | $39k--$55k | 71--99% | Margin call likely during term; liquidation possible near bottom |
| **Severe bear (-2σ)** | ~3-5% | <$39k | >99% | Liquidation |

### What the 365-day MA tells you about timing

The 365-day MA currently sits at **$99,637**. Price is 30.8% below it. Historically, when price is this far below the MA, it is in the trough of a cycle -- the kind of zone where 12-month forward returns have been strongly positive (median +92.7%, positive 96.9% of the time).

The MA will continue to decline as high-priced days from early 2025 roll off, making an MA crossover more achievable even without a dramatic price recovery.

---

## 6. The Auto Top-Up Question

Ledn's auto top-up feature moves BTC from your Transaction Account to loan collateral when LTV hits 70%, restoring it to ~65%. If you hold additional BTC on Ledn beyond your collateral:

- **With auto top-up enabled:** The margin call buffer widens. Each top-up buys time but increases total BTC at risk. The effective liquidation price drops proportionally to the extra BTC available.
- **Without auto top-up:** You rely on manual intervention when the 70% alert fires. Given that the gap between margin call ($49,220) and liquidation ($43,067) is only **12.5%**, a fast-moving market could cross both levels before you can act.

If you can set aside an additional **0.25 BTC** for auto top-up, the effective liquidation price drops to approximately **$34,500** (-50% from current), which sits below even the -2σ floor for the next 12 months.

---

## 7. Key Structural Observations

**What works in your favour at this entry point:**

- Price is **33% below the power law trend** -- historically, the model mean-reverts. The current deviation is at a level that has preceded strong recoveries.
- The "below both" starting condition has produced positive 12-month returns **96.9%** of the time historically (daily data, 871 windows).
- The margin call price ($49,220) requires a further -28.6% drop from an already depressed level. Historical probability of reaching it from this condition: 15.6%.
- Liquidation probability from this condition: **8.4%**.
- At maturity, even a **flat** price ($68,908) results in a 56.5% LTV -- comfortably within auto-renewal range.
- No early repayment penalty means you can close the loan at any time if conditions change.

**What works against you:**

- **Path risk is real.** 8.4% of the time from this starting condition, the daily path dipped deep enough to trigger liquidation. In 63% of those cases BTC ended the year positive -- meaning you would have been forced out of a winning position. This is the fundamental tension of collateralised lending: you can be right about the destination but wrong about the journey.
- The 871 "below both" daily windows cluster into just **three independent bear markets** (2014--15, 2018--19, 2022--23). Three events is a thin statistical basis. The probabilities have wide confidence intervals.
- The current period may be structurally different (macro regime, regulatory shifts, ETF flows) from the three bears that dominate the sample.
- The cost of borrowing is **$4,444 per BTC collateralised** over 12 months. You borrow $34,454 and owe $38,898 at maturity -- the $4,444 difference is the price of having $34,454 of liquidity for a year, regardless of what BTC does. If you deploy the borrowed funds at 0% return, you must cover the $4,444 gap from other sources or from your collateral.

---

## 8. How Ledn Actually Triggers Liquidation — What Is and Isn't Disclosed

This section covers the mechanics of how Ledn determines whether your LTV has breached the liquidation threshold. The details matter because they directly affect the path risk probabilities in Section 4.

### What the legal agreement says

From Ledn's [USD Loan Agreement](https://www.ledn.io/legal/usd-loan-agreement):

- **"Collateral Market Value"** is determined by Ledn **"in its sole discretion."** No specific pricing methodology (spot, VWAP, time-weighted average) is defined.
- Default occurs when the LTV ratio **"exceeds"** the liquidation LTV. No temporal qualifier -- no "for N hours," no "sustained for N days," no smoothing. The word "exceeds" with no further condition means any breach, however brief, is legally sufficient.
- Upon a margin call (70% LTV), the borrower must **"immediately transfer Additional Collateral."** No cure period is specified.
- On-chain collateral transfers require **9 block confirmations** (~90 minutes for Bitcoin) before Ledn counts them toward LTV.

### What S&P's analysis of Ledn's ABS deal reveals

S&P rated Ledn's $188M Bitcoin-backed asset-backed security in early 2026. Their presale report provides the only independent data on how liquidation actually works in practice:

- Ledn's liquidation engine is an **"algorithmic trading program that sources prices on multiple exchanges and/or is available through multiple trading partners."** The exact exchanges and aggregation method are not public.
- S&P used the phrase **"LTV EOD trigger"** — suggesting the formal liquidation check may occur at end-of-day or periodic intervals, not continuously on every price tick.
- Average time from trigger to execution: **under 10 seconds.**
- Average LTV at actual liquidation: **80.32%** (not 80.00%).
- Maximum LTV at actual liquidation: **84.66%.**
- Ledn has liquidated **7,493 loans** since 2018 with zero principal losses.
- In the Feb 2026 crash (~27% decline), Ledn liquidated **~1,300 loans** (25% of the ABS pool), all below **81.4% LTV**.

### What the numbers tell us

The fact that the average liquidation LTV is 80.32% and the maximum is 84.66% means the system is **not instantaneous on every price tick.** If it were, every liquidation would fire at almost exactly 80.00%. The overshoot implies either:

- A **polling interval** — LTV is checked periodically (perhaps every few minutes, perhaps end-of-day), not on every trade
- A **processing delay** between detection and execution
- Or both

This is partially good news (a sub-minute flash crash wick that instantly recovers might not trigger liquidation if it falls between polling checks) and partially bad news (an 84.66% max overshoot means that in fast-moving markets, you can lose significantly more collateral than the 80% threshold implies).

### What is NOT disclosed

| Question | Answer |
|---|---|
| Exact polling/monitoring frequency | Not disclosed |
| Specific exchanges used for price feed | Not disclosed |
| Whether spot, VWAP, or median is used | Not disclosed |
| Whether a brief wick triggers liquidation | Not disclosed — legally it can, practically it may not |
| Grace period between margin call and liquidation | **None specified** |
| Grace period to add collateral after margin call | **None specified** — agreement says "immediately" |

### How this compares to competitors

| Lender | Margin call cure period | Liquidation threshold |
|---|---|---|
| **Ledn** | **None specified** | 80% LTV, auto-liquidation |
| Strike | **24 hours explicit** | 85% LTV |
| Arch Lending | **24 hours explicit**, possible extension | Varies |

Ledn is notably less transparent than competitors on cure periods. Strike and Arch both give you an explicit 24-hour window to add collateral after a margin call. Ledn's legal agreement says "immediately" and specifies no timeframe.

### What this means for the path risk analysis

The probabilities in Section 4 use **daily closing prices** as the basis for drawdown calculations. The actual trigger mechanism is somewhere between daily and instantaneous:

- If Ledn checks at **end-of-day**: our daily data analysis is a reasonable approximation. A wick that recovers by close would not trigger liquidation.
- If Ledn checks **continuously or at frequent intervals**: the actual liquidation probability is somewhat higher than our daily-based estimates, because intraday drawdowns can exceed daily close-to-close drawdowns.
- The S&P "LTV EOD trigger" language leans toward the first interpretation, but this is not guaranteed.

The safest assumption: treat the probabilities in Section 4 as a **lower bound**. The true probability may be moderately higher due to intraday volatility that our daily data does not capture.

---

*Analysis based on power law model (R² = 0.910) fitted to CoinGecko daily data (4,677 points). Ledn terms sourced from ledn.io, help.ledn.io, ledn.io/legal/usd-loan-agreement, S&P presale reports, and third-party reviews as of early 2026. Historical probabilities are backward-looking and do not constitute predictions.*
