# Bitcoin-Backed Lending: Final Candidates for a Swedish Private Individual

**Date:** 2026-02-28

---

## 1. Final Three Candidates

After evaluating 11 platforms against hard requirements (no rehypothecation, transparent liquidation mechanics, available to Swedish individuals, EUR-compatible loans), three candidates remain.

### Head-to-head

| | Firefish | Debifi | Xapo Bank |
|---|---|---|---|
| **Based** | Czech Republic / Slovakia | Undisclosed (VC-backed) | Gibraltar |
| **Regulation** | MiCA CASP claimed (Slovakia). ESMA register listing not independently confirmed. LEI verified. | None. P2P marketplace facilitator. | **Gibraltar banking license** |
| **Custody** | 3-of-3 multisig. Firefish holds 2 keys (Price Oracle + Payment Oracle). Borrower key is ephemeral — discarded after setup. Pre-signed transactions lock destinations. Timelock recovery 1 month after maturity. | **3-of-4 multisig.** Keys: borrower, lender, Debifi, AnchorWatch (independent). Borrower retains key throughout. Each loan gets dedicated escrow address. | Fully custodial. BTC in vault. No client keys. |
| **Rehypothecation** | **No** | **No** | **No** |
| **Starting LTV** | 50% | 50% | 20--40% |
| **Liquidation LTV** | **95%** | 90% | 80% |
| **Buffer** | **45 pp** | 40 pp | 40--60 pp |
| **APR** | 6--13% (P2P marketplace) | 9--14% (P2P marketplace) | 8--12% (tracks Fed rate) |
| **Grace period** | **None.** "Even for a couple of seconds." | 24h at maturity for non-repayment | None explicit |
| **Price feed** | "CoinGecko or any other price index" — broad legal discretion. FAQ claims 9 exchanges. Actual monitoring frequency undisclosed (5-min is display only). | Oracle-based. Not detailed. | Not disclosed |
| **Loan currency** | EUR, CZK, CHF, PLN, USDC | EUR, USD | EUR (assumed — Gibraltar bank) |
| **Disbursement** | P2P: lender sends SEPA directly to borrower's IBAN. 1--3 working days. USDC option for instant (~15 min). | Not detailed | Bank transfer |
| **Min / max loan** | €800 / no stated cap | $10,000 / $700,000 | Unknown / unknown |
| **Term** | 3, 6, 12, or 18 months. Bullet repayment. | Varies. Interest-only during term, principal at maturity. | 30, 90, 180, or 365 days |
| **Origination fee** | 1.5% (deducted from collateral) | 1--2% | **Zero** |
| **Liquidation fee** | 5% | Not disclosed | **Zero** |
| **Early repayment** | Allowed, but **full interest for entire term still owed** | **No penalty** | **No penalty** |
| **Audit** | Ackee Blockchain (report not public, Firefish not on Ackee's client list) | **CertiK** (3 independent audits) | N/A (regulated bank) |
| **Open source** | Protocol on GitHub (Rust, 34 stars, 9 commits). Backend/frontend closed. | Escrow extractor tool open source | No |
| **Independent ranking** | — | **Zone21 #2 safest globally** (13-factor model) | — |
| **Trustpilot** | 4.8/5 (139 reviews, zero 1-star) | Too new for reviews | Limited data |
| **Track record** | ~2 years. $130M+ volume (self-reported). Zero liquidations claimed. Braiins $400K loan confirmed (Braiins is 15% investor). | New platform. Backed by Ten31, Epoch VC, Plan B Fund, Fulgur Ventures. Advisors: Willy Woo, Preston Pysh. | Established bank. |
| **Membership fee** | None | None | **$1,000/year** |
| **Sweden** | Confirmed. On supported country list. | Not on restricted list. KYC required. | Confirmed |

### What each is best and worst at

| | Best at | Worst at |
|---|---|---|
| **Firefish** | Highest liquidation threshold (95%). EUR via SEPA. Lowest min loan (€800). Best user reviews. | Oracle centralization (holds 2/3 keys). Zero grace period. Price feed has broad legal discretion. Early repayment still owes full interest. Unverified MiCA status. Unverifiable audit. |
| **Debifi** | Strongest custody (3-of-4 with independent AnchorWatch key). Borrower retains key. CertiK audited. No early repayment penalty. | No regulation at all. Price feed and monitoring details sparse. New platform with limited track record. $10K minimum may be high for smaller loans. |
| **Xapo Bank** | Only regulated bank on the list (Gibraltar). Zero fees across the board. No early repayment penalty. Conservative LTV limits risk. | Fully custodial (no client keys). Lowest starting LTV (20--40%) means least capital efficiency. $1,000/year membership. Price feed and monitoring undisclosed. |

---

## 2. What a BTC Price Drop Means on Each Platform

Starting from 50% LTV (Firefish and Debifi) or 20% LTV (Xapo conservative) and 40% LTV (Xapo aggressive):

### From 50% starting LTV (Firefish, Debifi)

| BTC drop from entry | LTV | Firefish | Debifi |
|---|---|---|---|
| -20% | 62.5% | Safe | Safe |
| -28.6% | 70.0% | Below first warning (73%) | Below first warning (75%) |
| -37.5% | 80.0% | Below second warning (79%) | Below second warning (80%) |
| -46.7% | 86.0% | At third warning (86%) | Past third warning (85%) |
| -47.4% | 90.0% | Below liquidation | **Liquidated** |
| -50.0% | 95.0% | **Liquidated** | Already liquidated |

Firefish survives 2.6 percentage points of additional BTC decline beyond Debifi's liquidation point.

### From 20% starting LTV (Xapo conservative)

| BTC drop from entry | LTV | Xapo |
|---|---|---|
| -37.5% | 32.0% | Safe |
| -50.0% | 40.0% | Safe |
| -60.0% | 50.0% | Safe |
| -68.8% | 64.1% | Approaching margin call (65%) |
| -75.0% | 80.0% | **Liquidated** |

At 20% starting LTV, BTC must drop **75%** before liquidation. This is extreme safety but very low capital efficiency — you borrow only $13,782 per BTC at $68,908.

### From 40% starting LTV (Xapo aggressive)

| BTC drop from entry | LTV | Xapo |
|---|---|---|
| -28.6% | 56.0% | Safe |
| -37.5% | 64.0% | Approaching margin call (65%) |
| -50.0% | 80.0% | **Liquidated** |

At 40% starting LTV, BTC must drop **50%** before liquidation — comparable safety to Firefish/Debifi despite the lower liquidation threshold, because you start with a lower LTV.

---

## 3. The Real Trade-offs

### Custody safety vs. liquidation buffer

Firefish has the highest liquidation threshold (95%) but Firefish controls 2 of 3 keys and the borrower's key is discarded after setup. If Firefish's oracles malfunction or act dishonestly, there is no borrower key to contest with in real time. Pre-signed transactions limit the damage (funds can only go to borrower or lender addresses), and a timelock allows recovery 1 month after maturity.

Debifi has a lower threshold (90%) but the borrower retains a key throughout the loan, and AnchorWatch provides an independent 4th key. No combination of two parties can steal your collateral. This is architecturally the safest model.

Xapo is fully custodial — you trust the bank entirely. But it is the only option backed by a banking license with regulatory oversight.

### Regulation vs. custody architecture

| | Regulated | Non-custodial |
|---|---|---|
| **Firefish** | Claimed (unverified) | Partially (ephemeral borrower key) |
| **Debifi** | No | **Yes** (borrower retains key) |
| **Xapo** | **Yes** (banking license) | No |

No platform offers both strong regulation and strong non-custodial custody. This is the core trade-off.

### Capital efficiency

At $68,908 BTC (last data point):

| Platform | Starting LTV | You borrow | You post as collateral | Liquidation price |
|---|---|---|---|---|
| **Firefish** | 50% | $34,454 | 1 BTC | $36,268 (-47.4%) |
| **Debifi** | 50% | $34,454 | 1 BTC | $38,282 (-44.4%) |
| **Xapo 40%** | 40% | $27,563 | 1 BTC | $34,454 (-50.0%) |
| **Xapo 20%** | 20% | $13,782 | 1 BTC | $17,227 (-75.0%) |

Firefish and Debifi give you the most liquidity per BTC. Xapo at 40% gives less but with a deeper liquidation buffer in absolute price terms. Xapo at 20% is extremely safe but you're barely unlocking any value.

### Cost of a 12-month loan on $30,000

| Platform | APR (mid-range) | Origination | Interest | Total cost | Early repayment |
|---|---|---|---|---|---|
| **Firefish** | 9.5% | $450 (1.5%) | $2,850 | **$3,300** | Full interest owed regardless |
| **Debifi** | 11.5% | $450 (1.5%) | $3,450 | **$3,900** | No penalty |
| **Xapo** | 10% | $0 | $3,000 | **$3,000** + $1,000 membership = **$4,000** first year | No penalty |

Firefish is cheapest if you hold to maturity. But if you repay early, Firefish still charges full interest — making Debifi or Xapo cheaper for shorter holds.

---

## 4. Platforms Considered and Eliminated

### Eliminated — hard disqualifiers

| Platform | Primary disqualifier | Secondary issues |
|---|---|---|
| **Ledn** | **Unavailable in Sweden** since April 2025 (no MiCA). | Fully custodial, USD-only, undisclosed price feed, collateral sent to unnamed 3rd party, undisclosed FTX/Alameda exposure, TOS not publicly readable. |
| **Nebeus** | **Disqualified.** Cure period claims contradicted by TOS. Confirmed rehypothecation (omnibus wallet, collateral lent to other clients). | Bank of Spain registration covers exchange only, not lending. BitGo insurance doesn't cover customer losses from Nebeus insolvency. Price feed completely opaque. |
| **Hodl Hodl** | **Effectively abandoned.** 3,294 monthly visits. CEO building competing product (Debifi). | Marshall Islands entity. 2021 security incident (brute-forceable keys). Closed-source core code. Dissolved UK entity. 25,000 USDT max loan. |
| **Celsius** | Defunct (bankruptcy Jun 2022) | Rehypothecated deposits. Depositors recovered ~60-70%. |
| **BlockFi** | Defunct (bankruptcy Nov 2022) | Rehypothecated deposits. FTX/Alameda exposure. |
| **CoinLoan** | Defunct | — |
| **Salt Lending** | US-only | — |
| **Strike** | US-only | — |
| **Unchained** | US-only | — |

### Eliminated — fails hard requirements

| Platform | Why eliminated |
|---|---|
| **Nexo (standard)** | **Rehypothecates.** Uses deposited crypto for own trading/business. Custodial. MiCA grandfathering expires mid-2026. Past issues: $45M SEC settlement, Bulgaria investigation. |
| **Nexo ZiC** | **Not a loan — it's a zero-cost options collar.** All BTC upside above a cap goes to Nexo. Forfeited upside can be 10-20x more expensive than paying 13% APR. Collateral locked for full term, no early exit. USDC/USDT disbursement only. Rehypothecation applies, no evidence of ring-fencing. |
| **Binance** | **Rehypothecates.** Collateral goes into pooled omnibus wallets via Simple Earn. ~65% starting LTV with 90% liquidation = only 25 pp buffer. Variable hourly rates. |
| **CoinRabbit** | Unregulated. "Liquidity partner" price feed. ~19% APR. No KYC (may seem convenient but signals regulatory risk). |

### Considered but not pursued further

| Platform | Status | Why not pursued |
|---|---|---|
| **Sygnum / MultiSYG** | Swiss bank, launching H1 2026 | Not yet available. May be institutional only. Worth monitoring. |
| **Verifi21** | Reportedly launched Q1 2025 for European customers | Insufficient public information to evaluate. Worth monitoring. |

---

## 5. Open Questions to Resolve Before Committing

### Ask Firefish

1. Is MiCA CASP authorization live and active on the ESMA register? What is the exact registration status?
2. What is the actual monitoring frequency for liquidation LTV checks (not display refresh)?
3. The legal docs say "CoinGecko or any other price index" — which index is actually used in production?
4. Can a Revolut/Wise EUR IBAN be used to receive loan disbursement and send repayment?
5. The Ackee Blockchain audit — can the report be shared with prospective borrowers?
6. If I repay early at month 6 of a 12-month loan, I owe full 12 months of interest — confirmed?
7. What happens if the Price Oracle or Payment Oracle goes offline mid-loan?

### Ask Debifi

1. What specific price feed/oracle is used for LTV monitoring?
2. What is the monitoring frequency for liquidation checks?
3. Is there a grace/cure period for price-based margin calls during the loan term (not just at maturity)?
4. How is the 90% liquidation threshold enforced — instantaneous or sustained?
5. Can Swedish individuals use the platform as of today? Any restrictions?
6. What are the actual current rates on the marketplace for a €20,000--50,000 EUR loan?
7. Is AnchorWatch's insurance policy active and does it cover borrower collateral specifically?

### Ask Xapo Bank

1. What price feed is used for LTV calculation?
2. What is the monitoring frequency?
3. Is there any grace period between margin call (65% LTV) and liquidation (80% LTV)?
4. Starting LTV range is 20-40% — can the borrower choose, or does Xapo determine it?
5. Loans denominated in EUR confirmed?
6. What happens at loan maturity — auto-renewal or forced repayment?
7. Can the $1,000/year membership fee be waived or is it required for all borrowers?

---

## 6. Decision Framework

If your primary concern is **custody safety** (minimising the chance of losing collateral to platform failure):
> **Debifi.** 3-of-4 multisig with independent AnchorWatch key. You retain a key. CertiK audited. No single party can move your BTC.

If your primary concern is **surviving a deep BTC drawdown** (maximising the price drop before liquidation):
> **Firefish.** 95% LTV liquidation. BTC can drop 47.4% from entry before liquidation at 50% starting LTV. No other platform comes close.

If your primary concern is **regulatory protection and simplicity** (trusting a licensed institution):
> **Xapo Bank.** Gibraltar banking license. Zero fees. Conservative LTV. You trust the bank, not a multisig. But lower capital efficiency and $1,000/year membership.

If you want **both custody safety and a high liquidation buffer**, the two goals partially conflict — Firefish has the buffer but weaker custody; Debifi has the custody but a lower buffer. No platform offers both best-in-class custody and best-in-class liquidation protection.

---

*Analysis based on platform documentation, terms of service, deep research, user reviews, and third-party assessments as of February 2026. All terms should be verified directly with each platform before committing funds. MiCA compliance deadlines (mid-2026) may change the availability landscape.*
