#!/usr/bin/env python3
"""
Bitcoin DCA Strategy Comparison — Backwards Simulation

All strategies get the SAME fixed USD budget (= number of days × $1, i.e. what
plain DCA would spend over the full dataset).  Simulation runs BACKWARDS from
the most recent day, so recent prices dominate and we stop when the budget is
exhausted.

Strategies:
  1) Plain DCA         — $1 every day.
  2) Below-trend $2    — $2 on days price < trendline, $0 otherwise.
  3) Smash (any below) — $1/day; buy below trend, stash above, smash on first
                          day back below trend.
  5) $3/day below P40  — $3 on days residual ≤ P40, $0 otherwise.

Power law:  log₁₀(Price) = -14.8193 + 5.2224 × log₁₀(days since 2009-01-03)
"""

import datetime
import csv
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import matplotlib.dates as mdates

GENESIS = datetime.date(2009, 1, 3)
CSV_PATH = "/home/owl/Temp/currency conversions/source/btc-usd-max(1).csv"
OUT_DIR  = "/home/owl/Temp/currency conversions/source"
A = -14.8193
B =  5.2224


def power_law_price(date):
    d = (date - GENESIS).days
    if d <= 0:
        return 0.0
    return 10 ** (A + B * np.log10(d))


def load_daily_prices():
    dates, prices = [], []
    with open(CSV_PATH, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dt = datetime.date.fromisoformat(row["snapped_at"][:10])
            price = float(row["price"])
            dates.append(dt)
            prices.append(price)
    return dates, prices


def simulate():
    dates_fwd, prices_fwd = load_daily_prices()
    n = len(dates_fwd)

    # Reverse: most recent day first
    dates = dates_fwd[::-1]
    price = np.array(prices_fwd[::-1])
    trend = np.array([power_law_price(d) for d in dates])
    residuals = np.log10(price) - np.log10(trend)
    below = price < trend

    # Percentile thresholds (computed on full forward dataset for consistency)
    all_residuals = np.log10(np.array(prices_fwd)) - np.log10(
        np.array([power_law_price(d) for d in dates_fwd]))
    p40_thresh = np.percentile(all_residuals, 40)
    p40_ratio  = 10**p40_thresh
    mask_p40   = residuals <= p40_thresh

    # Budget = what plain DCA spends over the full dataset ($1 × n days)
    BUDGET = float(n)

    print(f"  Dataset: {dates_fwd[0]} → {dates_fwd[-1]}  ({n:,} days)")
    print(f"  Simulation: backwards from {dates[0]}")
    print(f"  Fixed budget: ${BUDGET:,.0f}")
    print(f"  P40 threshold: price < {p40_ratio:.1%} of trend ({(1-p40_ratio)*100:.1f}% discount)")
    print(f"  Days below trend: {np.sum(below):,} ({100*np.sum(below)/n:.1f}%)")
    print(f"  Days ≤ P40:       {np.sum(mask_p40):,} ({100*np.sum(mask_p40)/n:.1f}%)")
    print()

    # ── Strategy 1: Plain DCA — $1/day backwards ──────────────────────
    s1_btc = 0.0
    s1_spent = 0.0
    s1_days_used = 0
    s1_btc_arr = np.zeros(n)
    s1_spent_arr = np.zeros(n)
    for i in range(n):
        if s1_spent + 1.0 > BUDGET:
            break
        s1_btc += 1.0 / price[i]
        s1_spent += 1.0
        s1_days_used = i + 1
        s1_btc_arr[i] = s1_btc
        s1_spent_arr[i] = s1_spent

    # ── Strategy 2: $2 below trend, $0 above — backwards ─────────────
    s2_btc = 0.0
    s2_spent = 0.0
    s2_days_used = 0
    s2_btc_arr = np.zeros(n)
    s2_spent_arr = np.zeros(n)
    for i in range(n):
        if below[i] and s2_spent + 2.0 <= BUDGET:
            s2_btc += 2.0 / price[i]
            s2_spent += 2.0
        s2_days_used = i + 1
        s2_btc_arr[i] = s2_btc
        s2_spent_arr[i] = s2_spent
        if s2_spent >= BUDGET:
            break

    # ── Strategy 3: Accumulate + smash — backwards ────────────────────
    # Going backwards, "above trend then crossing below" means:
    # walking back in time, we encounter below-trend first, then above.
    # We need to flip the logic: walking backwards, a "smash" triggers
    # on the first below-trend day after a streak of above-trend days.
    s3_btc = 0.0
    s3_spent = 0.0
    s3_cash = 0.0
    s3_days_used = 0
    s3_btc_arr = np.zeros(n)
    s3_spent_arr = np.zeros(n)
    s3_stash_arr = np.zeros(n)
    s3_allocated = 0.0
    was_above = False
    for i in range(n):
        if s3_allocated >= BUDGET:
            break
        s3_allocated += 1.0

        if below[i]:
            if was_above and s3_cash > 0:
                s3_btc += s3_cash / price[i]
                s3_spent += s3_cash
                s3_cash = 0.0
            s3_btc += 1.0 / price[i]
            s3_spent += 1.0
            was_above = False
        else:
            s3_cash += 1.0
            was_above = True

        s3_days_used = i + 1
        s3_btc_arr[i] = s3_btc
        s3_spent_arr[i] = s3_spent
        s3_stash_arr[i] = s3_cash

    # ── Strategy 5: $3 below P40, $0 otherwise — backwards ───────────
    s5_btc = 0.0
    s5_spent = 0.0
    s5_days_used = 0
    s5_btc_arr = np.zeros(n)
    s5_spent_arr = np.zeros(n)
    for i in range(n):
        if mask_p40[i] and s5_spent + 3.0 <= BUDGET:
            s5_btc += 3.0 / price[i]
            s5_spent += 3.0
        s5_days_used = i + 1
        s5_btc_arr[i] = s5_btc
        s5_spent_arr[i] = s5_spent
        if s5_spent >= BUDGET:
            break

    # ── Results ────────────────────────────────────────────────────────
    strats = [
        ("1) Plain DCA ($1/day)",   s1_spent, 0.0,     s1_btc, s1_days_used, dates[s1_days_used-1]),
        ("2) Below-trend $2",       s2_spent, 0.0,     s2_btc, s2_days_used, dates[s2_days_used-1]),
        ("3) Smash (any below)",    s3_spent, s3_cash,  s3_btc, s3_days_used, dates[s3_days_used-1]),
        ("5) $3/day below P40",     s5_spent, 0.0,     s5_btc, s5_days_used, dates[s5_days_used-1]),
    ]

    print("=" * 115)
    print("  BACKWARDS DCA COMPARISON — Fixed ${:,.0f} budget, most recent data first".format(BUDGET))
    print("=" * 115)
    print()

    hdr = (f"{'Strategy':<26} {'USD Spent':>10} {'vs DCA':>8} {'Cash':>8} "
           f"{'BTC':>12} {'vs DCA':>8} {'Days':>6} {'Reached back to':>16}")
    print(hdr)
    print("-" * len(hdr))

    for name, spent, cash, btc, days_used, earliest in strats:
        spent_vs = (spent / s1_spent - 1) * 100 if s1_spent > 0 else 0
        btc_vs = (btc / s1_btc - 1) * 100 if s1_btc > 0 else 0
        spent_vs_str = "—" if "Plain" in name else f"{spent_vs:>+6.1f}%"
        btc_vs_str = "—" if "Plain" in name else f"{btc_vs:>+6.1f}%"
        print(f"{name:<26} ${spent:>8,.0f}  {spent_vs_str:>8} ${cash:>6,.0f}  "
              f"{btc:>10.6f}  {btc_vs_str:>8} {days_used:>5,}  {earliest}")
    print()

    # ── Year-by-year backwards (which years did each strategy buy in?) ─
    print("  SPEND BY YEAR (backwards from most recent):")
    print("  " + "-" * 90)
    print(f"  {'Year':<6} {'S1 spent':>10} {'S2 spent':>10} {'S3 spent':>10} {'S5 spent':>10}"
          f"   {'S1 BTC':>10} {'S2 BTC':>10} {'S3 BTC':>10} {'S5 BTC':>10}")
    print("  " + "-" * 90)

    all_strat_arrs = [
        (s1_spent_arr, s1_btc_arr),
        (s2_spent_arr, s2_btc_arr),
        (s3_spent_arr, s3_btc_arr),
        (s5_spent_arr, s5_btc_arr),
    ]

    # Reversed arrays: index 0 = most recent, index k = k days ago.
    # For each year, find the reversed indices belonging to that year,
    # compute marginal spend/BTC = value at last index minus value at first-1.
    # If the strategy didn't reach that year (array is 0), skip it.
    days_used_map = {"S1": s1_days_used, "S2": s2_days_used,
                     "S3": s3_days_used, "S5": s5_days_used}

    year_start = dates_fwd[0].year
    year_end   = dates_fwd[-1].year
    for yr in range(year_end, year_start - 1, -1):
        yr_mask = np.array([d.year == yr for d in dates])
        if not np.any(yr_mask):
            continue
        yr_idx = np.where(yr_mask)[0]
        i_first, i_last = yr_idx[0], yr_idx[-1]

        row_spent = []
        row_btc   = []
        for (tag, days_used), (spent_arr, btc_arr) in zip(
                days_used_map.items(), all_strat_arrs):
            # If strategy didn't reach this year at all
            if i_first >= days_used:
                row_spent.append(f" {'—':>9}")
                row_btc.append(f" {'—':>10}")
                continue
            # Clip i_last to strategy's reach
            il = min(i_last, days_used - 1)
            s_end = spent_arr[il]
            s_start = spent_arr[i_first - 1] if i_first > 0 else 0.0
            b_end = btc_arr[il]
            b_start = btc_arr[i_first - 1] if i_first > 0 else 0.0
            yr_spent = s_end - s_start
            yr_btc = b_end - b_start
            row_spent.append(f" ${yr_spent:>8,.0f}")
            row_btc.append(f" {yr_btc:>10.6f}")

        print(f"  {yr:<6}{''.join(row_spent)}  {''.join(row_btc)}")
    print()

    # ══════════════════════════════════════════════════════════════════════
    # CHARTS
    # ══════════════════════════════════════════════════════════════════════
    # For charts, re-flip to chronological order so time goes left→right
    # We need to map reversed indices back to forward dates

    COLORS = {"s1": "#2196F3", "s2": "#FF5722", "s3": "#4CAF50", "s5": "#00BCD4"}
    labels = {"s1": "1) Plain DCA", "s2": "2) Below-trend $2",
              "s3": "3) Smash (any below)", "s5": "5) $3/day below P40"}

    # Convert reversed arrays back to forward chronological order
    fwd_price = np.array(prices_fwd)
    fwd_trend = np.array([power_law_price(d) for d in dates_fwd])
    fwd_below = fwd_price < fwd_trend
    fwd_dates = np.array(dates_fwd)

    # Flip cumulative arrays back to chronological and fill from the right
    def flip_cum(arr, days_used):
        """Reversed cumulative → forward array (value grows from right to left)."""
        fwd = np.zeros(n)
        used = min(days_used, n)
        # arr[0] is most recent day, arr[used-1] is earliest day
        # In forward: fwd[n-1] = arr[0], fwd[n-2] = arr[1], ...
        for j in range(used):
            fwd[n - 1 - j] = arr[j]
        return fwd

    s1_btc_fwd = flip_cum(s1_btc_arr, s1_days_used)
    s2_btc_fwd = flip_cum(s2_btc_arr, s2_days_used)
    s3_btc_fwd = flip_cum(s3_btc_arr, s3_days_used)
    s5_btc_fwd = flip_cum(s5_btc_arr, s5_days_used)

    s1_spent_fwd = flip_cum(s1_spent_arr, s1_days_used)
    s2_spent_fwd = flip_cum(s2_spent_arr, s2_days_used)
    s3_spent_fwd = flip_cum(s3_spent_arr, s3_days_used)
    s5_spent_fwd = flip_cum(s5_spent_arr, s5_days_used)

    fig, axes = plt.subplots(4, 1, figsize=(16, 22),
                              gridspec_kw={"height_ratios": [3, 2, 2, 2]})

    # Panel 1: Price + trend + percentile lines
    ax1 = axes[0]
    ax1.semilogy(fwd_dates, fwd_price, color="#333", lw=0.8, label="BTC price")
    ax1.semilogy(fwd_dates, fwd_trend, color="#ff9900", lw=1.8, label="Trend")
    ax1.semilogy(fwd_dates, fwd_trend * p40_ratio, color=COLORS["s5"],
                 lw=1.0, ls="--", alpha=0.7, label=f"P40 ({p40_ratio:.0%} of trend)")
    # Shade below-trend
    in_region = False
    for i in range(n):
        if fwd_below[i] and not in_region:
            region_start = i
            in_region = True
        elif not fwd_below[i] and in_region:
            ax1.axvspan(dates_fwd[region_start], dates_fwd[i-1], alpha=0.08, color="green")
            in_region = False
    if in_region:
        ax1.axvspan(dates_fwd[region_start], dates_fwd[-1], alpha=0.08, color="green")
    ax1.set_ylabel("BTC Price (USD, log)", fontsize=11)
    ax1.set_title("Bitcoin Price with Trendline and P40 Band", fontsize=13, fontweight="bold")
    ax1.legend(loc="upper left", fontsize=9)
    ax1.yaxis.set_major_formatter(
        ticker.FuncFormatter(lambda v, _: f"${v:,.0f}" if v >= 1 else f"${v:.2f}"))
    ax1.grid(True, which="major", ls="--", alpha=0.3)

    # Panel 2: Cumulative BTC (chronological, growing from right)
    ax2 = axes[1]
    for key, arr in [("s1", s1_btc_fwd), ("s2", s2_btc_fwd),
                      ("s3", s3_btc_fwd), ("s5", s5_btc_fwd)]:
        mask = arr > 0
        if np.any(mask):
            ax2.plot(fwd_dates[mask], arr[mask], lw=1.8,
                     label=labels[key], color=COLORS[key])
    ax2.set_ylabel("Cumulative BTC", fontsize=11)
    ax2.set_title("BTC Accumulated (backwards from most recent day, same ${:,.0f} budget)".format(BUDGET),
                  fontsize=13, fontweight="bold")
    ax2.legend(loc="upper left", fontsize=9)
    ax2.grid(True, which="major", ls="--", alpha=0.3)

    # Panel 3: Cumulative USD spent (chronological)
    ax3 = axes[2]
    for key, arr in [("s1", s1_spent_fwd), ("s2", s2_spent_fwd),
                      ("s3", s3_spent_fwd), ("s5", s5_spent_fwd)]:
        mask = arr > 0
        if np.any(mask):
            ax3.plot(fwd_dates[mask], arr[mask], lw=1.8,
                     label=labels[key], color=COLORS[key])
    ax3.axhline(BUDGET, color="grey", ls="--", lw=1, alpha=0.5, label=f"Budget cap (${BUDGET:,.0f})")
    ax3.set_ylabel("Cumulative USD Spent", fontsize=11)
    ax3.set_title("Budget Consumption (how far back each strategy reaches)",
                  fontsize=13, fontweight="bold")
    ax3.legend(loc="upper left", fontsize=9)
    ax3.yaxis.set_major_formatter(ticker.FuncFormatter(lambda v, _: f"${v:,.0f}"))
    ax3.grid(True, which="major", ls="--", alpha=0.3)

    # Panel 4: BTC portfolio value over time
    ax4 = axes[3]
    for key, btc_arr in [("s1", s1_btc_fwd), ("s2", s2_btc_fwd),
                          ("s3", s3_btc_fwd), ("s5", s5_btc_fwd)]:
        val = btc_arr * fwd_price
        mask = val > 0
        if np.any(mask):
            ax4.semilogy(fwd_dates[mask], val[mask], lw=1.8,
                         label=labels[key], color=COLORS[key])
    ax4.set_ylabel("Portfolio Value (USD, log)", fontsize=11)
    ax4.set_xlabel("Date", fontsize=11)
    ax4.set_title("Portfolio Value Over Time", fontsize=13, fontweight="bold")
    ax4.legend(loc="upper left", fontsize=9)
    ax4.yaxis.set_major_formatter(
        ticker.FuncFormatter(lambda v, _: f"${v:,.0f}" if v >= 1 else f"${v:.2f}"))
    ax4.grid(True, which="major", ls="--", alpha=0.3)
    ax4.xaxis.set_major_locator(mdates.YearLocator())
    ax4.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))

    plt.tight_layout()
    chart_path = f"{OUT_DIR}/dca_strategy_comparison.png"
    fig.savefig(chart_path, dpi=180)
    print(f"  Chart saved → {chart_path}")
    plt.close()


if __name__ == "__main__":
    simulate()
