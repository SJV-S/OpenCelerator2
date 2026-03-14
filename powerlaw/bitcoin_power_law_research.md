# Bitcoin Power Law — Research & Assumptions

## What is the Bitcoin Power Law?

The Bitcoin Power Law is a mathematical model describing Bitcoin's long-term price as a power law function of time. When price is plotted against time on a log-log scale (both axes logarithmic), the history forms an approximately straight line — the signature of a power law relationship.

The model was first identified by **Giovanni Santostasi** (physicist, posted on BitcoinTalk in 2014) and independently developed into a corridor model by **Harold Christopher Burger** in 2019. Other notable contributors include **Porkopolis Economics** and **BGeometrics**.

Santostasi describes the mechanism as an infinite recursive feedback loop where price, hash rate, and active addresses are interconnected through power law scaling — consistent with Metcalfe's Law applied to network growth.

## The Formula

The core equation is a linear regression in log₁₀-log₁₀ space:

```
log₁₀(Price) = a + b × log₁₀(d)
```

Which is equivalent to:

```
Price = 10^a × d^b
```

Where:
- `d` = number of days since the **genesis block** (January 3, 2009 — Bitcoin's Block 0)
- `b` = the power law exponent (slope in log-log space)
- `a` = the intercept

## Our Fit (from btc-usd-max(1).csv)

Using 155 monthly data points from April 2013 to February 2026:

| Parameter | Value |
|---|---|
| Intercept (a) | -14.8193 |
| Exponent (b) | 5.2224 |
| RMSE (log₁₀) | 0.2719 |
| R² | 0.9108 |

This means price scales roughly as time^5.2, and the model explains ~91% of variance in log-log space.

### Reference coefficients from other sources

| Source | Intercept (a) | Exponent (b) | R² |
|---|---|---|---|
| Harold Christopher Burger (2019) | -17.016 | 5.845 | 0.931 |
| BGeometrics / Santostasi | -16.995 | 5.82 | — |
| bitcoinpower.law | -16.493 | 5.688 | — |
| **Our fit (2013–2026 monthly)** | **-14.819** | **5.222** | **0.911** |

Our exponent is lower than Burger's because our dataset starts in April 2013 (missing the early low-price data points from 2009–2012 which steepen the slope). The other sources include data from Bitcoin's first trades in 2010 onward.

## How the Bands Are Selected

We use **RMSE-based bands** — the most statistically grounded approach.

1. Fit the power law regression in log₁₀-log₁₀ space.
2. Compute the residual for each data point: `residual = log₁₀(actual_price) - log₁₀(model_price)`.
3. Calculate the RMSE (root-mean-square error) of those residuals. This is effectively the standard deviation (σ) of how far prices scatter from the trend in log space. Our RMSE = 0.2719.
4. Shift the trend line up and down by multiples of the RMSE:
   - **±1σ band**: captures ~68% of observations — the "fair value" corridor
   - **±2σ band**: captures ~95% of observations — prices outside this are historically rare (blow-off tops or capitulation bottoms)

Because this operates in log space, the bands are multiplicative, not additive. An RMSE of 0.272 in log₁₀ translates to a ~1.87× multiplier (10^0.272 ≈ 1.87). So +1σ ≈ trend × 1.87, and −1σ ≈ trend ÷ 1.87. For ±2σ the multiplier is ~3.5×.

### Alternative band methods (not used)

| Method | Description | Used by |
|---|---|---|
| **Fixed multipliers** | Fair value = trend × 0.71, floor = trend × 0.42 | BGeometrics, bitcoinfairprice.com |
| **Parallel log-log lines** | Same slope, different intercepts fit to cycle peaks/troughs | Harold Christopher Burger |
| **Percentile bands** | 2.5th/97.5th and 16.5th/83.5th percentiles of residuals | Porkopolis Economics |
| **Day-offset method** | Shift the days parameter by fixed year increments | Cryptonerds (TradingView) |
| **Separate regressions** | Fit independent lines to peaks vs troughs (different slopes) | Pbanks |

## Assumptions & Limitations

1. **Power law continues to hold.** The model assumes the historical relationship persists. There is no guarantee — regulatory shifts, technological disruption, or macro events could break the pattern.

2. **Data starts April 2013.** The CSV does not include 2009–2012 data. Early data points (very low prices, very few days since genesis) would steepen the regression slope. This means our exponent (5.22) is conservative relative to fits that include the full history (~5.8).

3. **Monthly resampling.** Daily data is collapsed to month-end closes to reduce noise and autocorrelation. This gives 155 data points for the regression.

4. **OLS regression in log-log space.** Ordinary least squares treats all months equally. It does not weight recent data more heavily, nor does it account for heteroscedasticity or serial correlation in residuals.

5. **Symmetric bands.** The ±σ bands assume residuals are roughly symmetric in log space. In practice, the distribution is slightly right-skewed (bull market overshoots are larger than bear market undershoots). Percentile-based bands would capture this asymmetry but add complexity.

6. **No cycle-aware modelling.** The model is a single trend line — it does not explicitly model the ~4-year halving cycle. The bands capture cycle swings statistically, but the projection does not predict when the next peak or trough will occur.

7. **Projection is naive extrapolation.** The 12-month forward projection simply extends the fitted power law. It shows where the trend and bands will be, not where price will be.

## Sources

- Giovanni Santostasi — [The Bitcoin Power Law Theory (Medium)](https://giovannisantostasi.medium.com/the-bitcoin-power-law-theory-962dfaf99ee9)
- Harold Christopher Burger — [Bitcoin's Natural Long-Term Power-Law Corridor of Growth](https://hcburger.com/blog/powerlaw/)
- Harold Christopher Burger — [Power Law Corridor (Medium)](https://medium.com/quantodian-publications/bitcoins-natural-long-term-power-law-corridor-of-growth-649d0e9b3c94)
- Porkopolis Economics — [The Chart](https://www.porkopolis.io/thechart/)
- BGeometrics — [BTC Power Law Model](https://charts.bgeometrics.com/power_law.html)
- [bitcoinpower.law](https://bitcoinpower.law/)
- [Bitcoin Fair Price Calculator](https://bitcoinfairprice.com/)
- Pbanks — [The Bitcoin Power Law Model](https://pbanks.net/blog/the-bitcoin-power-law-model.html)
- Samara AG — [What is the Bitcoin Power Law Theory?](https://www.samara-ag.com/market-insights/bitcoin-power-law)
