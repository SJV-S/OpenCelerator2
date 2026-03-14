# Power Law Fitting: Why the Origin Matters

## The Problem

When fitting a power law to Bitcoin price data on the SCC monthly chart, the scaling exponent came out around b=3.03 — far from the reference value of ~5.2-5.8. The exponent also shifted dramatically depending on which date range was selected for fitting. A good fit shouldn't be that unstable.

## The Wrong Assumption

The intuition was: if the power law is a good fit (R^2 ~0.91), then the scaling exponent should be roughly the same regardless of where x=0 is anchored. Fitting from 2013 onward should give a similar exponent whether x is measured from the genesis block (2009) or from the chart's startDate (2012).

This assumption is wrong. It holds for exponentials, but not for power laws.

## Why Exponentials Are Translation-Invariant But Power Laws Are Not

**Exponential** — shifting the origin just changes the constant:

```
e^(k(t + offset)) = e^(k * offset) * e^(kt)
```

The growth rate k is preserved. You can anchor x=0 anywhere and get the same rate.

**Power law** — the offset cannot be factored out:

```
(t + offset)^b  !=  constant * t^b
```

`log10(t + offset)` is not a linear function of `log10(t)`. So fitting `log10(y)` vs `log10(t)` with the wrong zero-point means fitting a straight line to something that isn't straight in your coordinate system. The slope you recover depends on which section of the curve you sample — explaining both the wrong exponent and its instability across date ranges.

## The Fix

The SCC's `powerLawFit()` was using raw chart x-positions (month offsets from startDate) as the x-values. For a Monthly chart starting Jan 2012, April 2013 was x=15. The reference material measures from the genesis block (Jan 3, 2009), where April 2013 is d=1551 days.

Same data, same y-values, but x=15 vs x=1551. The large additive offset inside the log is what distorts the slope.

The regression doesn't need data at the origin — it just needs the x-values measured from it. The Python reference script has no data between 2009 and 2013 either; it just computes `d = (date - genesis).days` for each data point.

After changing `powerLawFit()` to convert chart x-positions to days-since-genesis before taking log10, the exponent moved from b=3.03 to b=5.39 — consistent with the reference.

## Key Takeaway

A power law's exponent is only meaningful relative to its origin (the singularity). Measuring from the wrong zero-point doesn't just add a constant error — it produces a qualitatively different, range-dependent slope. The origin must be correct at fitting time; there is no after-the-fact correction.
