#!/usr/bin/env python3
"""
Bitcoin Power Law — Monthly Double-Log Chart (2013–2027)
With 12-month forward projection and projected values table.

Core model:  log10(Price) = a + b * log10(days_since_genesis)
Genesis block: January 3, 2009
Bands: ±1σ and ±2σ of RMSE residuals in log10 space.
"""

import datetime
import csv
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker

GENESIS = datetime.date(2009, 1, 3)
CSV_PATH = "/home/owl/Temp/currency conversions/source/btc-usd-max(1).csv"


def load_monthly_prices():
    """Load daily CSV data and resample to month-end closes."""
    dates, prices = [], []
    with open(CSV_PATH, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dt = datetime.date.fromisoformat(row["snapped_at"][:10])
            price = float(row["price"])
            dates.append(dt)
            prices.append(price)

    monthly = {}
    for d, p in zip(dates, prices):
        monthly[(d.year, d.month)] = (d, p)

    monthly_sorted = sorted(monthly.values())
    return [x[0] for x in monthly_sorted], np.array([x[1] for x in monthly_sorted])


def fit_power_law(dates, prices):
    """OLS in log10-log10 space."""
    days = np.array([(d - GENESIS).days for d in dates], dtype=float)
    log_d = np.log10(days)
    log_p = np.log10(prices)
    b, a = np.polyfit(log_d, log_p, 1)
    residuals = log_p - (a + b * log_d)
    rmse = np.sqrt(np.mean(residuals ** 2))
    r_sq = 1 - np.sum(residuals**2) / np.sum((log_p - np.mean(log_p))**2)
    return a, b, rmse, r_sq


def main():
    dates, prices = load_monthly_prices()
    print(f"{len(dates)} monthly points  ({dates[0]} → {dates[-1]})")

    a, b, rmse, r_sq = fit_power_law(dates, prices)
    print(f"log₁₀(P) = {a:.4f} + {b:.4f} · log₁₀(d)")
    print(f"RMSE = {rmse:.4f}   R² = {r_sq:.4f}")

    # ── Build projection dates (12 months forward from last data) ─────
    last_date = dates[-1]
    proj_dates = []
    for m_offset in range(1, 13):
        yr = last_date.year + (last_date.month + m_offset - 1) // 12
        mo = (last_date.month + m_offset - 1) % 12 + 1
        # Use 1st of each month for clean labels
        proj_dates.append(datetime.date(yr, mo, 1))

    # ── Compute model values for historical + projection ──────────────
    all_plot_dates = dates + proj_dates
    all_days = np.array([(d - GENESIS).days for d in all_plot_dates], dtype=float)
    all_log_d = np.log10(all_days)
    all_model_log_p = a + b * all_log_d
    all_model_price = 10 ** all_model_log_p
    all_upper_2s = 10 ** (all_model_log_p + 2 * rmse)
    all_upper_1s = 10 ** (all_model_log_p + 1 * rmse)
    all_lower_1s = 10 ** (all_model_log_p - 1 * rmse)
    all_lower_2s = 10 ** (all_model_log_p - 2 * rmse)

    n_hist = len(dates)
    hist_days = all_days[:n_hist]
    proj_days = all_days[n_hist:]

    # Historical model arrays
    hist_model = all_model_price[:n_hist]
    hist_u2 = all_upper_2s[:n_hist]
    hist_u1 = all_upper_1s[:n_hist]
    hist_l1 = all_lower_1s[:n_hist]
    hist_l2 = all_lower_2s[:n_hist]

    # Projection model arrays
    proj_model = all_model_price[n_hist:]
    proj_u2 = all_upper_2s[n_hist:]
    proj_u1 = all_upper_1s[n_hist:]
    proj_l1 = all_lower_1s[n_hist:]
    proj_l2 = all_lower_2s[n_hist:]

    # ── Print projection table ────────────────────────────────────────
    print()
    print("=" * 90)
    print(f"{'Date':>12}  {'−2σ':>10}  {'−1σ':>10}  {'Trend':>10}  {'+1σ':>10}  {'+2σ':>10}")
    print("-" * 90)

    # Current (last data point)
    d0 = (dates[-1] - GENESIS).days
    ld0 = np.log10(d0)
    ml0 = a + b * ld0
    print(f"{str(dates[-1]):>12}  "
          f"${10**(ml0 - 2*rmse):>9,.0f}  "
          f"${10**(ml0 - 1*rmse):>9,.0f}  "
          f"${10**ml0:>9,.0f}  "
          f"${10**(ml0 + 1*rmse):>9,.0f}  "
          f"${10**(ml0 + 2*rmse):>9,.0f}  ← latest data")

    for pd in proj_dates:
        d = (pd - GENESIS).days
        ld = np.log10(d)
        ml = a + b * ld
        print(f"{str(pd):>12}  "
              f"${10**(ml - 2*rmse):>9,.0f}  "
              f"${10**(ml - 1*rmse):>9,.0f}  "
              f"${10**ml:>9,.0f}  "
              f"${10**(ml + 1*rmse):>9,.0f}  "
              f"${10**(ml + 2*rmse):>9,.0f}")

    print("=" * 90)
    print()

    # ── Plot ──────────────────────────────────────────────────────────
    fig, ax = plt.subplots(figsize=(14, 8))

    # Historical bands (solid fill)
    ax.fill_between(hist_days, hist_l2, hist_u2, alpha=0.10, color="#ff9900",
                     label="±2σ band (~95%)")
    ax.fill_between(hist_days, hist_l1, hist_u1, alpha=0.20, color="#ff9900",
                     label="±1σ band (~68%)")

    # Projection bands (dashed fill connecting from last hist point)
    proj_days_ext = np.concatenate([[hist_days[-1]], proj_days])
    proj_u2_ext = np.concatenate([[hist_u2[-1]], proj_u2])
    proj_u1_ext = np.concatenate([[hist_u1[-1]], proj_u1])
    proj_l1_ext = np.concatenate([[hist_l1[-1]], proj_l1])
    proj_l2_ext = np.concatenate([[hist_l2[-1]], proj_l2])
    proj_model_ext = np.concatenate([[hist_model[-1]], proj_model])

    ax.fill_between(proj_days_ext, proj_l2_ext, proj_u2_ext,
                     alpha=0.07, color="#4488ff")
    ax.fill_between(proj_days_ext, proj_l1_ext, proj_u1_ext,
                     alpha=0.14, color="#4488ff")

    # Historical trend line
    ax.plot(hist_days, hist_model, color="#ff9900", lw=2.2,
            label=f"Power law  (exponent={b:.2f},  R²={r_sq:.3f})")

    # Projected trend line (dashed)
    ax.plot(proj_days_ext, proj_model_ext, color="#4488ff", lw=2.2,
            ls="--", label="12-month projection")
    ax.plot(proj_days_ext, proj_u2_ext, color="#4488ff", lw=0.8, ls=":")
    ax.plot(proj_days_ext, proj_l2_ext, color="#4488ff", lw=0.8, ls=":")
    ax.plot(proj_days_ext, proj_u1_ext, color="#4488ff", lw=0.8, ls=":")
    ax.plot(proj_days_ext, proj_l1_ext, color="#4488ff", lw=0.8, ls=":")

    # Monthly closes — coloured by deviation from model
    hist_log_d = np.log10(hist_days)
    hist_model_log_p = a + b * hist_log_d
    ratio = np.log10(prices) - hist_model_log_p
    norm = plt.Normalize(-2 * rmse, 2 * rmse)
    cmap = plt.cm.RdYlGn_r
    ax.scatter(hist_days, prices, c=cmap(norm(ratio)), s=30, zorder=5,
               edgecolors="k", linewidths=0.3, label="Monthly close")

    # Vertical line marking projection start
    ax.axvline(hist_days[-1], color="#4488ff", lw=1.0, ls="-.", alpha=0.5)
    ax.text(hist_days[-1], ax.get_ylim()[0] if ax.get_ylim()[0] > 0 else 10,
            "  now", color="#4488ff", fontsize=8, va="bottom")

    # Double-log axes
    ax.set_xscale("log")
    ax.set_yscale("log")

    # X-axis: year labels
    for yr in range(2013, 2028):
        d = (datetime.date(yr, 1, 1) - GENESIS).days
        ax.axvline(d, color="grey", lw=0.3, alpha=0.3)
    year_ticks = [(datetime.date(yr, 1, 1) - GENESIS).days
                  for yr in range(2013, 2028)]
    ax.set_xticks(year_ticks)
    ax.set_xticklabels([str(yr) for yr in range(2013, 2028)], fontsize=10)
    ax.minorticks_off()

    # Y-axis: dollar formatting
    ax.yaxis.set_major_formatter(
        ticker.FuncFormatter(lambda v, _: f"${v:,.0f}" if v >= 1 else f"${v:.2f}"))
    ax.tick_params(axis="y", labelsize=10)

    ax.grid(True, which="major", ls="--", alpha=0.35)

    ax.set_xlabel("Year  (log-scaled days since genesis block)", fontsize=11)
    ax.set_ylabel("BTC / USD  (log scale)", fontsize=11)
    ax.set_title("Bitcoin Power Law — Monthly Double-Log Chart  (2013 – 2027)\n"
                 "with 12-month projection",
                 fontsize=14, fontweight="bold", pad=12)
    ax.legend(loc="upper left", fontsize=9, framealpha=0.9)
    ax.set_xlim(hist_days[0] * 0.95, proj_days[-1] * 1.03)

    # Equation annotation
    ax.text(0.99, 0.02,
            f"log₁₀(P) = {a:.3f} + {b:.3f} · log₁₀(d)\n"
            f"RMSE = {rmse:.3f}  |  R² = {r_sq:.3f}\n"
            f"Genesis: {GENESIS}  |  Data: CoinGecko CSV",
            transform=ax.transAxes, fontsize=8, va="bottom", ha="right",
            bbox=dict(boxstyle="round,pad=0.4", fc="white", alpha=0.85))

    plt.tight_layout()
    out = "/home/owl/Temp/currency conversions/source/bitcoin_power_law.png"
    fig.savefig(out, dpi=180)
    print(f"Saved → {out}")
    plt.close()


if __name__ == "__main__":
    main()
