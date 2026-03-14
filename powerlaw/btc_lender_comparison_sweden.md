# Bitcoin-Backed Loan Providers: Terms Comparison for Swedish Residents

**Date:** 2026-02-28

Only platforms that are confirmed or likely available to Swedish residents and currently operational are included. BlockFi, Celsius, and CoinLoan are defunct. Salt Lending, Strike, and Unchained are US-only. **Ledn suspended all new loan originations for Swedish residents as of April 2025** (no MiCA authorization, no timeline given). Ledn is included below for reference only — it is not a viable option.

---

## 1. Head-to-Head Comparison

### Core terms

| Platform | Starting LTV | APR | Loan term | Liquidation LTV | Buffer (start → liquidation) |
|---|--:|---|---|--:|--:|
| **Firefish** | 50% | 6--13% (marketplace) | 3--18 months | **95%** | **45 pp** |
| **Debifi** | 50% | 9--14% (marketplace) | Varies | **90%** | **40 pp** |
| **Nexo** | 50% | 10.9--18.9% (tier-based) | Open-ended | **83.3%** | **33.3 pp** |
| **Nexo ZiC** | 50% | **0%** (options collar) | Fixed term | **No liquidation during term** | **N/A** |
| **Hodl Hodl** | 30--70% | P2P (varies) | 1--12 months | **90%** | **20--60 pp** |
| **Binance** | ~65% | Variable (hourly) | Flexible | **90%** | **25 pp** |
| **Nebeus** | — | — | — | — | **DISQUALIFIED** |
| **CoinRabbit** | 50--90% | ~19% annualized | Unlimited | **~95%** | **5--45 pp** |
| **Xapo Bank** | 20--40% | 8--12% | 30--365 days | **80%** | **40--60 pp** |
| **Ledn** | 50% | 12.9% | 12 months | **80%** | **30 pp** — **UNAVAILABLE IN SWEDEN** |

"Buffer" = how many percentage points LTV can rise before liquidation. Larger is safer.

### The numbers that matter most: liquidation mechanics

| Platform | Grace period | Price feed | Monitoring frequency | Rehypothecation |
|---|---|---|---|---|
| **Firefish** | **None** ("even for a couple of seconds") | "CoinGecko or any other" (broad discretion) | Display: 5 min. Actual: undisclosed | **No** (multisig, but Firefish holds 2/3 keys) |
| **Debifi** | **24h at maturity** | Oracle-based (not detailed) | Not disclosed | **No** (3-of-4 multisig, independent 4th key) |
| **Nexo** | None explicit (auto-repays from savings) | **Chainlink oracle** | Continuous | **Yes** |
| **Nexo ZiC** | **N/A — no liquidation during term** | N/A | N/A | **Yes** (no ring-fencing evidence) |
| **Hodl Hodl** | 24h for non-repayment at term end | Kraken, Binance, Bitfinex | Not disclosed | **No** (multisig escrow) |
| **Binance** | None | Multi-exchange price index | Not disclosed | **Yes** |
| **Nebeus** | — | — | — | **DISQUALIFIED** |
| **CoinRabbit** | **24 hours** | Liquidity partner | **Every second** | No (claimed) |
| **Xapo Bank** | None explicit | Not disclosed | Not disclosed | **No** |
| **Ledn** | **None** | Not disclosed ("sole discretion") | Not disclosed (S&P hints at EOD) | No rehypothecation, but fully custodial + unnamed 3rd party — **UNAVAILABLE IN SWEDEN** |

---

## 2. Platform-by-Platform Detail

### Firefish — strongest liquidation protection, but oracle risk

- **Based:** Czech Republic (dev) / Slovakia (operating entity, Firefish Europe s.r.o.)
- **Regulation:** Claims MiCA CASP authorization via NBS (Slovakia). Listed LEI verified. **However: ESMA register listing not independently confirmed; a 2026 GLI chapter stated no NBS authorizations had been issued as of its writing.** Verify directly before committing funds.
- **Loans in:** EUR, CZK, CHF, PLN, USDC. Sweden explicitly on supported country list. SEPA confirmed.
- **Borrowers:** Both private individuals and companies. Min loan €800. KYC with valid ID.
- **LTV:** 50% start
- **Rate:** 6--13% p.a. in practice (P2P marketplace), plus **1.5% origination fee** deducted from collateral. Rates are fixed for the loan term once agreed.
- **Margin calls:** 73% → 79% → 86% (three email notifications — **informational only, no contractual force**)
- **Liquidation:** 95% LTV — the highest threshold of any platform reviewed. **No grace period.** FAQ explicitly states: "If the Bitcoin price hits the liquidation price, even for only a couple of seconds, it is considered as a liquidation event."
- **Price feed:** Legal docs define it as **"CoinGecko BTC Price in USD" or "any other price index"** — giving Firefish broad discretion. The FAQ claims 9 exchanges, but the legal language does not lock this down. The 5-minute refresh is **display only** — the actual oracle monitoring frequency is undisclosed.
- **Custody:** 3-of-3 multisig. **But Firefish holds 2 of 3 keys** (Price Oracle + Payment Oracle). The borrower's key is ephemeral — generated during setup, used to pre-sign all closing transactions, then permanently discarded. After setup, only Firefish can finalize any transaction. Pre-signed transactions lock fund destinations (borrower or lender addresses only — a compromised Firefish cannot redirect to its own wallet). Disaster recovery: borrower can reclaim collateral **1 month after maturity** without oracle cooperation via timelock. No rehypothecation.
- **Early repayment:** Allowed, but **full interest for the entire loan term is still owed.** No interest savings from early repayment.
- **Fees:** 1.5% origination (deducted from collateral). 5% liquidation fee. Min loan €800.
- **Term:** 3, 6, 12, or 18 months. Bullet repayment.
- **Audit:** Claims Ackee Blockchain review, but **report is not public**, Firefish is not on Ackee's public client list, and Ackee specializes in Ethereum/Solana — an unusual engagement for a Bitcoin Rust project.
- **Track record:** $130M+ volume, zero liquidations, 27K users — **all self-reported, no independent verification.** Braiins $400K loan confirmed but Braiins is a 15% equity investor.
- **Open source:** Protocol on GitHub (Rust, 34 stars, but only 9 commits — thin for production code). Deterministic builds supported.

### Debifi — strongest custody architecture

- **Based:** Built by Max Keidun (Hodl Hodl founder). Registered entity undisclosed but backed by Ten31, Epoch VC, Plan B Fund, Fulgur Ventures. Advisors include Willy Woo and Preston Pysh.
- **Regulation:** **None.** P2P marketplace facilitator, not a regulated lender. No MiCA registration. Loans are private agreements between borrower and lender.
- **Loans in:** EUR confirmed. USD. $10,000--$700,000 range.
- **Borrowers:** Individuals and institutions. Sweden not on restricted list. KYC/KYB required.
- **LTV:** 50% start (2:1 collateral ratio)
- **Rate:** 9--14% APR (lender-set via P2P marketplace). 1--2% origination fee.
- **Margin calls:** 75% → 80% → 85% LTV (progressive warnings)
- **Liquidation:** **90% LTV** forced liquidation. **24-hour grace period at maturity** for non-repayment.
- **Price feed:** Not disclosed in detail. Oracle-based.
- **Custody:** **3-of-4 multisig** — keys held by borrower, lender, Debifi, and **AnchorWatch** (independent 4th party). Each loan gets a dedicated escrow address — no pooling. Open-source escrow extractor tool exists. **No rehypothecation.** This is architecturally the strongest custody model of any platform researched.
- **Early repayment:** No penalties. Interest-only payments during term, principal at maturity.
- **Audit:** Three independent security audits completed, including **CertiK**.
- **Ranking:** Zone21 (Nunchuk research team) ranked Debifi **#2 safest Bitcoin-backed lending platform globally** using a 13-factor risk model.
- **Weakness:** No EU regulatory coverage. The regulatory gap is meaningful but less dangerous than rehypothecation exposure.

### Nexo — established, but rehypothecates

- **Based:** Cayman Islands (holding), EU-regulated entities
- **Sweden:** Explicitly listed as available
- **LTV:** 50% start
- **Rate:** 18.9% base. Drops with NEXO token holdings: 17.9% (1%+ tokens), 13.9% (5%+), 10.9% (10%+). Below 20% LTV: as low as 2.9%.
- **Margin calls:** 70% → 71.4% → 74.1% → 76.9% (four warnings)
- **Liquidation:** 83.3% LTV — auto-repayment from collateral
- **Price feed:** Chainlink oracle, continuous monitoring
- **Custody:** Ledger Vault / Fireblocks. **Rehypothecation practiced** — Nexo uses deposited crypto for its own trading and business activities.
- **Grace period:** None explicit. System auto-repays by selling collateral.
- **Fees:** None (no origination, no admin, no prepayment). **But:** if you repay within 45 days, 18.9% APR applies regardless of tier.
- **Term:** Open-ended credit line (no fixed maturity).
- **Zero-Interest Credit (ZiC):** Launched Jan 2026. 0% APR, fixed term, **no liquidation during the term**. But this is a **zero-cost options collar**, not a free loan. A Minimum Repayment Price (put) and Maximum Repayment Price (call) are set at origination. **All BTC upside above the cap goes to Nexo.** In a bull market, the forfeited upside can be 10--20x more expensive than paying 13% APR at a traditional lender. Collateral locked for the full term — no early exit. Disbursement in USDC/USDT only, not EUR — requires conversion. Rehypothecation applies platform-wide; no evidence ZiC collateral is ring-fenced. Nexo operates under MiCA grandfathering (not full authorization) expiring mid-2026. Past issues: $45M SEC settlement (Jan 2023), Bulgaria investigation (dropped Dec 2023).

### Hodl Hodl — non-custodial P2P

- **Based:** Global, no specific jurisdiction. KYC-free.
- **LTV:** 30--70% (stablecoin loans), 80% (L-BTC/WBTC loans)
- **Rate:** Set by individual lenders (P2P marketplace)
- **Margin calls:** 75% → 80% → 85% → 88% (progressive)
- **Liquidation:** 90% LTV
- **Price feed:** Kraken, Binance, Bitfinex (named exchanges)
- **Custody:** Non-custodial. Bitcoin held in **2-of-3 multisig escrow**. No rehypothecation.
- **Grace period:** 24 hours for non-repayment at term end. No explicit grace for price-based liquidation.
- **Fees:** 1% origination (1--5 months) or 1.5% (6--12 months). 5% liquidation fee.
- **Term:** 1--12 months.
- **Max loan:** 25,000 USDT/USDC equivalent.

### Nebeus — DISQUALIFIED

Deep research revealed multiple disqualifying problems:

- **Cure period claims are contradictory.** The FAQ says "3 to 10 days" but the TOS says "at least 3 days" — and elsewhere states Nebeus can liquidate "at any time" if collateral value is "insufficient." The cure period is not contractually guaranteed.
- **Confirmed rehypothecation.** The TOS explicitly states: "Nebeus can use cryptoassets deposited by clients to provide lending products to other clients" and "will hold the Cryptoassets in an omnibus wallet." Your collateral is pooled and lent out.
- **Bank of Spain registration is for exchange services only** — not lending. The lending product operates without specific regulatory authorization.
- **BitGo insurance ($250M Lloyd's policy)** covers BitGo's own losses from internal theft/hack, not customer collateral losses from Nebeus's business operations. If Nebeus goes insolvent, the insurance is irrelevant.
- **Price feed remains completely opaque.** No exchange names, no methodology, no monitoring frequency disclosed.

Previously listed as a runner-up candidate. Now eliminated from consideration.

### Xapo Bank — conservative but opaque

- **Based:** Gibraltar, banking license
- **LTV:** 20--40% (very conservative)
- **Rate:** 8--12% APR, tracks Fed rate, updated daily
- **Margin call:** 65% LTV
- **Liquidation:** 80% LTV. Only enough collateral sold to cover loan + interest.
- **Custody:** Non-rehypothecated. BTC stays in vault untouched.
- **Grace period:** None explicit.
- **Fees:** **Zero** — no arrangement, closure, margin call, or liquidation fees. No early repayment penalty.
- **Term:** 30, 90, 180, or 365 days.
- **Membership:** $1,000/year to use the platform.
- **Concern:** Price feed and monitoring frequency not disclosed.

### Binance — liquid but rehypothecates

- **Based:** Various entities. Binance Nordics AB registered in Sweden. MiCA-licensed.
- **LTV:** ~65% start for BTC
- **Rate:** Variable, calculated hourly. Fluctuates by market.
- **Margin call:** 85% LTV
- **Liquidation:** 90% LTV. 2% liquidation fee on borrowed amount.
- **Price feed:** Multi-exchange price index (Binance's standard methodology)
- **Custody:** Collateral goes into pooled omnibus wallets via Simple Earn. **Rehypothecation practiced.**
- **Grace period:** None between margin call and liquidation. 24-hour grace after fixed loan expiry (with 3x interest penalty).
- **Auto top-up:** Yes — auto-transfers from spot wallet.
- **Term:** Flexible (open-ended) or fixed.

### Ledn — UNAVAILABLE IN SWEDEN (reference only)

**Ledn suspended all new loan originations for Swedish residents as of April 1, 2025.** Existing loans can run to maturity but cannot be renewed or refinanced. Ledn states it is pursuing MiCA CASP authorization but provides no timeline.

Even setting geography aside, Ledn fails on multiple hard requirements:

- **Fully custodial.** Operated by 21 Technologies Inc. (Cayman Islands). BitGo holds all three keys — no client multisig, no client key control. From Ledn's own docs: "clients must transfer control of the bitcoin collateral to Ledn" and "with Ledn's Custodied loans, there are no multisig wallets."
- **USD-denominated only.** Loans are denominated in USD. EUR disbursement is available but the loan obligation and LTV calculation are in USD, creating unavoidable FX risk for a Swedish borrower.
- **Collateral transferred to unnamed third party.** Custodied Loan collateral is "re-posted" to an undisclosed "institutional USD funding partner" (described as a "regulated bank or credit fund"). Ledn will not identify this entity. Claimed to be "legally ring-fenced" — never tested in insolvency.
- **Undisclosed FTX/Alameda exposure.** Ledn had exposure to Alameda Research and assets on FTX during the 2022 collapse. The size was never publicly disclosed.
- **TOS not publicly readable.** The USD Loan Agreement renders via JavaScript behind the platform and cannot be reviewed before account creation.
- **Price feed undisclosed.** S&P described it only as an "algorithmic liquidation engine." No exchange names, no methodology.
- **No grace period.** Liquidation at 80% LTV is automatic and irreversible. S&P confirmed actual liquidation execution at up to 81.4% LTV (slippage). In the Feb 2026 crash, approximately one-quarter of loans in the ABS pool were liquidated.
- **Interest capitalization at renewal.** S&P flagged Ledn's practice of capitalizing unpaid interest into renewed loans as a conflict of interest.

**What Ledn does well:** $10B+ lifetime originations, 7,493 liquidations with zero principal losses, BBB- rated ABS (S&P), survived 2022 while Celsius/BlockFi/Voyager failed, never halted withdrawals, semi-annual Proof of Reserves attestations, SOC 2 Type 2 certified, Trustpilot 4.3/5 (1,042 reviews). It is a well-run CeFi lender — but "well-run CeFi" is not what a borrower seeking non-custodial, EUR-denominated loans with transparent liquidation mechanics should be looking at.

See `ledn_btc_loan_assessment.md` for quantitative path risk analysis (useful as a reference framework for any 50% LTV / 80% liquidation loan structure).

---

## 3. Transparency Ranking

How much does each platform disclose about the mechanics that determine whether you get liquidated?

| Rank | Platform | Price feed | Monitoring freq. | Grace period | Liquidation rules | Overall |
|--:|---|---|---|---|---|---|
| 1 | **Nexo** | Chainlink oracle | Continuous | — | 83.3%, auto-repay | **Most transparent** |
| 2 | **Firefish** | "CoinGecko or any other" (FAQ says 9 exchanges) | Display: 5 min. Actual: undisclosed | **None** | 95% LTV, clear threshold | Good threshold, weak feed disclosure |
| 3 | **Debifi** | Oracle-based | Not disclosed | 24h at maturity | 90% LTV | Decent |
| 4 | **Hodl Hodl** | 3 named exchanges | Not stated | 24h at term end | 90% LTV | Decent |
| 5 | **CoinRabbit** | "Liquidity partner" | Every second | 24h | ~95% LTV | Decent |
| 6 | **Binance** | Multi-exchange index | Not stated | None | 90% LTV | Partial |
| 7 | **Xapo Bank** | Not disclosed | Not stated | None stated | 80% LTV | Poor |
| 8 | **Ledn** | "Sole discretion" | "EOD trigger" (S&P) | None | 80% LTV | **Least transparent** |

Nebeus removed — disqualified (see Section 2).

---

## 4. What a -28.6% and -37.5% Drop Means on Each Platform

Using the same drop levels from the Ledn analysis (margin call at -28.6%, liquidation at -37.5% from entry), here is where each platform would stand if you started at 50% LTV:

| Platform | LTV after -28.6% drop | LTV after -37.5% drop | Status |
|---|--:|--:|---|
| **Firefish** | 70.0% | 80.0% | Below first margin call (73%), well below liquidation (95%) |
| **Debifi** | 70.0% | 80.0% | Below first warning (75%), below liquidation (90%) |
| **Nexo** | 70.0% | 80.0% | At first warning (70%), below liquidation (83.3%) |
| **Hodl Hodl** | 70.0% | 80.0% | Below first warning (75%), below liquidation (90%) |
| **Binance** | 70.0%* | 80.0%* | Below margin call (85%), below liquidation (90%) |
| **Xapo** | N/A | N/A | Starting LTV is 20--40%, so equivalent drops produce lower LTVs |
| **Ledn** | 70.0% | 80.0% | **At margin call. At liquidation.** (unavailable in Sweden) |

*Binance starts at ~65% LTV, so these drops would push it to ~91% and ~104% — already liquidated.

The same BTC price decline that triggers **liquidation** on Ledn would only produce a **first-stage margin call warning** on Firefish and Debifi.

---

## 5. Key Takeaways

**Firefish remains the top candidate** for a Swedish borrower, but with important caveats revealed by deep research:
- EUR loans via SEPA (no currency conversion risk). Min €800. Individuals welcome.
- 95% liquidation threshold — the highest of any platform reviewed. The same crash that liquidates you on Ledn (80% LTV) leaves you 15 percentage points below liquidation on Firefish.
- No rehypothecation. Collateral in multisig with timelock disaster recovery.
- **But:** Firefish holds 2 of 3 multisig keys (both oracles). The borrower's key is ephemeral — discarded after setup. Pre-signed transactions limit what Firefish can do with the funds, but trust in the oracles is required.
- **But:** Price feed is legally defined as "CoinGecko or any other price index" — broad discretion, not the locked-down 9-exchange index that marketing suggests. Monitoring frequency for liquidation checks is undisclosed (5-min is display only).
- **But:** No grace period. FAQ explicitly states liquidation triggers "even for a couple of seconds." Combined with the opaque monitoring frequency, this is a real risk.
- **But:** Early repayment requires paying full interest for the entire term. No savings from paying early.
- **But:** MiCA registration claimed but not independently confirmed on the ESMA register.

**Debifi is the strongest runner-up** and arguably the safest custody model of any platform:
- 3-of-4 multisig with AnchorWatch as an independent 4th key holder. No single party (including Debifi) can move collateral alone.
- EUR loans confirmed. $10K--$700K range.
- CertiK-audited. Zone21 ranked it #2 safest globally.
- 90% liquidation threshold — lower than Firefish's 95% but still generous.
- **Weakness:** No EU regulatory coverage (P2P marketplace model). Price feed and monitoring details sparse.

**Nexo ZiC is not a free loan** — it's a zero-cost options collar. You give up all BTC upside above a cap in exchange for 0% APR and no liquidation during the term. In a bull market, the forfeited upside can be 10--20x more expensive than paying 13% APR at a traditional lender. Rehypothecation applies. Disbursement in USDC/USDT only, not EUR.

**Nebeus is disqualified.** Cure period claims are contradictory (TOS allows liquidation "at any time"). Confirmed rehypothecation with omnibus wallet pooling. Bank of Spain registration covers exchange services only, not lending. Insurance does not cover customer collateral.

**Ledn is unavailable** to Swedish residents for new loans since April 2025 (no MiCA). Even if it reopened, it fails on custody (fully custodial, BitGo holds all keys, collateral transferred to unnamed third party), currency (USD-only, FX risk), and transparency (undisclosed price feed, TOS not publicly readable, undisclosed FTX/Alameda exposure). Strong operational track record ($10B+ originations, survived 2022, BBB- ABS) but structurally incompatible with non-custodial requirements.

---

## 6. Rehypothecation Risk: What Happens to Your Collateral

Rehypothecation means the lender takes your deposited BTC and uses it for its own purposes — lending it out, trading with it, or pledging it to counterparties. If the lender goes insolvent, your collateral is part of the bankruptcy estate. You become an unsecured creditor standing in line with everyone else. This is what happened to Celsius and BlockFi depositors in 2022.

### Custody models ranked by safety

| Tier | Platform | Model | What it means |
|---|---|---|---|
| **Strongest** | **Debifi** | 3-of-4 multisig with independent 4th key (AnchorWatch) | Each loan gets a dedicated escrow address. Four keys: borrower, lender, Debifi, AnchorWatch. No single party can move funds. Even if Debifi and the lender colluded, the borrower + AnchorWatch can block them. Open-source escrow extractor tool available. |
| **Strong** | **Firefish** | 3-of-3 multisig, but Firefish holds 2 keys | BTC sits in multisig. However, Firefish controls both the Price Oracle and Payment Oracle keys. The borrower's key is ephemeral (used to pre-sign transactions, then discarded). Pre-signed transactions lock destinations to borrower/lender addresses only — Firefish cannot redirect to its own wallet. Timelock allows borrower to reclaim 1 month after maturity without Firefish. Better than custodial, but trust in the oracles is required. |
| **Strong** | **Hodl Hodl** | 2-of-3 multisig escrow | Standard non-custodial model. But closed-source core code means you cannot verify the implementation. The 2021 incident showed the key derivation had a flaw. |
| **Good** | **Xapo Bank** | Custodial, explicit no-rehypothecation | BTC stays in their vault untouched. Gibraltar banking license provides regulatory oversight. But it is custodial — you are trusting their word and their regulator, not a multisig. |
| **Middle** | **Ledn (custodied)** | Segregated, no rehypothecation, but re-postable | Ledn does not lend out your BTC. However, they can re-post it to a "trusted institutional USD funding partner" (bank or credit fund). The collateral is supposed to be legally ring-fenced from that partner's assets, even in the partner's bankruptcy. This is a contractual and legal protection, not a cryptographic one. |
| **Weakest** | **Nexo**, **Binance**, **Nebeus** | Full / internal rehypothecation | Your BTC becomes their working capital. They lend it out, trade with it, pledge it to their own counterparties. Your claim on it is contractual, not cryptographic. In a solvency crisis, you are an unsecured creditor. Nebeus TOS explicitly confirms omnibus wallet pooling and relending to other clients. |

### What "multisig" actually means — and why the details matter

The term "non-custodial multisig" is used loosely in crypto marketing. The devil is in the key distribution:

**Debifi (3-of-4):** Keys held by borrower, lender, Debifi, and AnchorWatch (independent insurance-backed custodian). This is the strongest architecture — no two colluding parties can steal funds. The borrower retains a key throughout the loan and can participate in recovery.

**Firefish (3-of-3, but Firefish holds 2 keys):** The borrower generates a key at setup, uses it to pre-sign all possible closing transactions (repayment, liquidation, default), and then the key is **permanently discarded**. After setup, only Firefish's two oracle keys can finalize transactions. The pre-signed transactions lock fund destinations to borrower or lender addresses — Firefish cannot redirect to its own wallet. A timelock allows the borrower to reclaim collateral 1 month after maturity without oracle cooperation. This is better than pure custody (Firefish cannot steal), but the borrower has no active key during the loan.

**Hodl Hodl (2-of-3):** Standard model where borrower, lender, and Hodl Hodl each hold one key. In theory the strongest for borrower control, but the 2021 incident revealed that weak password-based key derivation could allow brute-forcing of user keys — and the core code is closed source, so the current implementation cannot be verified.

Every custodial model (Nexo, Binance, Ledn, Nebeus, Xapo) means you hand your BTC to the platform and trust their legal agreements, regulatory status, and operational integrity. In a solvency crisis, you are a creditor, not a key holder.

### The 2022 precedent

| Platform | What happened | Depositor recovery |
|---|---|---|
| **Celsius** | Rehypothecated customer deposits into DeFi, stETH, and mining. Filed bankruptcy Jun 2022. | Depositors recovered ~60-70% after 18 months in bankruptcy proceedings. |
| **BlockFi** | Rehypothecated deposits. Exposed to FTX/Alameda. Filed bankruptcy Nov 2022. | Depositors recovered partial amounts. Process took over a year. |
| **Voyager** | Commingled and rehypothecated customer funds. Filed bankruptcy Jul 2022. | Depositors recovered ~35-73% depending on asset class. |

In all three cases, customers who thought they had "deposited" crypto discovered they were unsecured creditors. The platforms had lent out, traded, or pledged their deposits and could not return them.

### How this interacts with liquidation risk

Rehypothecation creates a second layer of risk on top of price-based liquidation:

1. **Price risk (liquidation):** BTC drops, your LTV breaches the threshold, collateral is sold. You lose your BTC but the loan is settled. This is the risk modelled in the Ledn report.

2. **Counterparty risk (insolvency):** The platform fails regardless of BTC price. Your collateral is locked in bankruptcy proceedings. You may lose both your BTC *and* still owe the loan depending on the legal structure.

With a non-custodial multisig model, counterparty risk is eliminated. You only face price risk. With a full rehypothecation model, you face both simultaneously.

### Bottom line

If you are borrowing against a significant portion of your BTC holdings, the custody model is arguably more important than the interest rate. A 5% APR difference is irrelevant if the platform goes under and takes your collateral with it. The 2022 collapses happened during a bear market — exactly the same conditions under which you would be borrowing.

---

## 7. Platform Trust Review: Firefish and Hodl Hodl

These two platforms offer non-custodial multisig custody — the strongest model for protecting collateral. But the custody architecture is only one axis. The platform behind it still needs to be trustworthy, solvent, and competent.

### Firefish

| Dimension | Assessment |
|---|---|
| **Legal entity** | Firefish Labs s.r.o. (Czech Republic, reg. Jun 2022) + Firefish Europe s.r.o. (Slovakia, reg. Dec 2023, operating entity) |
| **Founders** | **Martin Matejka** — ex-CEZ (Central Europe's largest energy company), led power trading. **Igor Neumann** — 20 years at Reuters/Thomson Reuters/Refinitiv/LSEG, most recently Customer Success Director. Both non-anonymous, active on LinkedIn, regularly appear on podcasts. |
| **Regulation** | Claims MiCA registration via ESMA Interim Register (Slovakia). LEI verified on Bloomberg (9845004E55FCFA069549). However, one interview referenced the license as "pending" — **verify directly on the ESMA register before committing funds.** |
| **Funding** | $1.8M seed round (Apr 2025). Lead investors: **Braiins** (~$1M for 15% stake) and **Miton C** (Prague VC). Braiins is the world's oldest Bitcoin mining pool — they also borrowed $400K through the platform themselves. |
| **Borrower eligibility** | **Both private individuals and companies.** Min loan €800. KYC requires a valid ID — no corporate entity needed. |
| **Track record** | ~2 years of full production. $130M+ in notional loan value (self-reported). ~27,000 users. ~1,000-2,000 BTC in escrowed collateral. **Zero price-based liquidations** claimed. Near-zero default rate (~0.0002). |
| **Security incidents** | **None.** No hacks, breaches, or loss of funds reported from any source. |
| **Open source** | Protocol open-sourced on GitHub ([Firefish-io/firefish-protocol](https://github.com/Firefish-io/firefish-protocol)) in Jun 2025. Rust, deterministic builds. 36 stars, 6 forks. The multisig implementation is auditable. Full platform backend/frontend is not open source. |
| **Security audit** | Audited by **Ackee Blockchain** (reputable Czech firm). However, the audit report is **not publicly available** — users cannot independently verify what was found. |
| **User reviews** | **Trustpilot: 4.8/5 (139 reviews).** 94% five-star. Positive: speed, transparency, responsive support. Negative: notification speed for sniping offers, English-only contracts, some KYC delays. Zero one-star reviews. |
| **Media / community** | Covered by Bitcoin Magazine (recommended provider), Stephan Livera Podcast, Blocktrainer (major German Bitcoin educator), Relai (Swiss Bitcoin company collaboration). Positive reputation in the Bitcoin-only community. |

**Concerns:**

1. **Oracle centralization.** The Price Oracle and Payment Oracle are both operated by Firefish. If these malfunction or act dishonestly, user funds could be at risk. The protocol docs state: "Some level of trust is required in the oracles being honest." This is the single biggest trust assumption on the platform.
2. **Young platform.** ~2 years of full production. Has not been tested by a prolonged, deep bear market while at scale.
3. **Modest funding.** $1.8M is a small war chest. Financial resilience could be tested in adverse conditions.
4. **Self-reported metrics.** The $130M volume and zero-liquidation claims are not independently audited.
5. **Previous company.** Matejka's prior company Stratosphere Capital entered liquidation in Aug 2025. May be innocuous (startups fail), but worth noting.

**What's genuinely strong:**

- Braiins putting $1M in and using the platform for their own $400K loan is skin-in-the-game credibility that marketing cannot buy.
- The protocol is open source and deterministically buildable. You can verify the multisig code.
- The Trustpilot profile (4.8/5, 139 reviews, zero one-star) is unusually clean for a crypto platform.
- Both founders have 15-20 year careers in traditional finance and data services, publicly identifiable and traceable.

---

### Hodl Hodl (Lend)

| Dimension | Assessment |
|---|---|
| **Legal entity** | **Hodlex Ltd, Marshall Islands** (business number 89220). Offshore jurisdiction with zero regulatory oversight and no public company registry. A UK entity (Hodlex Ltd, company 12378186) was incorporated Dec 2019 but **dissolved Jul 2021** during the security incident period. |
| **Founders** | **Max Keidun** — ex-private banker, organizes Baltic Honeybadger conference. **Roman Snitko** — software engineer, cypherpunk. Both non-anonymous and well-known in Bitcoin circles. |
| **Regulation** | **None.** Not regulated anywhere. No KYC required. Their legal argument: non-custodial multisig means they never hold funds, so regulations don't apply. Disputes governed by UK law but enforcing against a Marshall Islands entity would be difficult. |
| **Funding** | Undisclosed seed round (Nov 2018). Known investors: Kingsway Capital, WhalePanda (angel). The undisclosed amount suggests a very small raise. |
| **Track record** | P2P exchange since 2016 (~8 years). Lending launched Oct 2020, **shut down Aug 2021** (security incident), relaunched Sep 2021 as Lend 2.0. Claims 300,000 users and 100,000+ trades, but these are unverifiable. |
| **Current activity** | **Near-zero.** SimilarWeb shows **3,294 monthly visits** to hodlhodl.com — a fraction of what a platform with 300,000 users should have. No lending volume data published anywhere. The lending product appears to be a ghost town. |
| **Security incidents** | **YES — serious incident in Aug 2021.** An audit found two vulnerabilities in the lending platform: (1) weak payment passwords could be brute-forced to derive user private keys, allowing theft of multisig-escrowed funds, and (2) a frontend phishing vulnerability. Hodl Hodl **force-liquidated contracts** with 2 hours notice, shut down lending, and relaunched a month later. They stated "no funds had been stolen" but acknowledged they could not guarantee the vulnerabilities hadn't been exploited. |
| **Open source** | **Core code is NOT open source.** Seven utility libraries are published on GitLab (notification system, currency converter, etc.) but the multisig escrow implementation, the trading platform, and the lending platform are all closed source. Despite 2019 announcements about open-sourcing the exchange code, the core platform remains proprietary. |
| **User reviews** | **Trustpilot: 3.3/5 (24 reviews).** 50% five-star but 17% one-star. Complaints about scammers on the platform, unresponsive support, and captcha annoyance. Very few reviews — the low count itself is a signal. |
| **CEO's focus** | Max Keidun launched **Debifi** as a separate institutional Bitcoin-backed lending platform (3-of-4 multisig with Casa and Blockstream as key holders, loans $10K-$700K+). Debifi directly competes with Lend at Hodl Hodl and appears to be where Keidun's attention has shifted. |
| **Max loan** | **25,000 USDT.** This cap, combined with the near-zero visible activity, confirms this is a micro-lending product with very limited liquidity. |

**Red flags:**

1. **Marshall Islands incorporation** with a dissolved UK entity. Offshore, unregulated, no consumer protection, no recourse.
2. **The 2021 security incident** revealed that the non-custodial multisig design had a fundamental flaw — the whole point of multisig is that no single party can access funds, but weak password-based key derivation broke this guarantee. The forced 2-hour liquidation also demonstrated Hodl Hodl could unilaterally act on "your" multisig.
3. **Core multisig code is closed source.** You cannot verify the implementation that secures your funds. This is the opposite of what you'd expect from a platform whose entire value proposition is trustless, non-custodial security.
4. **The lending product appears abandoned.** 3,294 monthly visits, no volume data, CEO building a competing product. You would be putting collateral into a platform that may not be actively maintained.
5. **Undisclosed funding** and tiny team (estimated <15 people).

**What's genuinely strong:**

- 8 years of operation on the P2P trading side without confirmed fund losses.
- Non-anonymous, well-known founders with real reputation at stake.
- Baltic Honeybadger gives them social capital in the Bitcoin community.
- The architecture (when implemented correctly) is sound in principle.

---

### Side-by-Side Verdict: Top Three Non-Custodial Candidates

| Dimension | Firefish | Debifi | Hodl Hodl (Lend) |
|---|---|---|---|
| Jurisdiction | Czech Republic / Slovakia (EU) | Undisclosed (VC-backed) | Marshall Islands (offshore) |
| Regulation | MiCA (claimed, verify) | None (P2P facilitator) | None |
| Multisig model | 3-of-3 (Firefish holds 2 keys) | **3-of-4 (independent 4th key)** | 2-of-3 |
| Borrower retains key during loan | No (ephemeral, discarded) | **Yes** | Yes |
| Security incidents | None | None | Yes (2021, serious) |
| Core code open source | Yes (protocol) | Escrow extractor tool | No |
| Security audit | Ackee (report not public) | **CertiK** | Not disclosed |
| Independent ranking | — | **Zone21 #2 globally** | — |
| Trustpilot | 4.8/5 (139 reviews) | Too new | 3.3/5 (24 reviews) |
| Platform activity | Active, growing | Active, growing | Near-zero (ghost town) |
| Funding | $1.8M (Braiins, Miton C) | Ten31, Epoch VC, Fulgur | Undisclosed (small) |
| EUR loans | **Yes** (SEPA) | **Yes** | No (USDT/USDC only) |
| Min / max loan | €800 / no cap | $10K / $700K | — / 25,000 USDT |
| Liquidation threshold | **95% LTV** | 90% LTV | 90% LTV |
| Grace period | **None** | 24h at maturity | 24h at term end |
| Price feed | "CoinGecko or any other" | Oracle-based | Kraken/Binance/Bitfinex |
| Early repayment | Full interest still owed | No penalty | Varies |

**Assessment:**

- **Firefish** has the highest liquidation threshold (95%) and EUR loans, but its custody model is weaker than it appears (Firefish holds 2/3 keys, borrower key is ephemeral), the price feed has broad legal discretion, and there is zero grace period. MiCA status is unverified.

- **Debifi** has the strongest custody architecture of any platform researched (3-of-4 multisig with independent AnchorWatch key, CertiK audit, Zone21 #2 ranking). EUR loans confirmed. The 90% liquidation threshold is 5pp lower than Firefish but still generous. Main weakness: no EU regulatory coverage, less transparent on price feed mechanics.

- **Hodl Hodl** is eliminated from serious consideration: ghost town activity, closed-source core code, 2021 security incident, offshore entity, CEO building a competing product (Debifi).

For a Swedish individual prioritising custody safety, Debifi is the strongest choice. For maximising the liquidation buffer, Firefish is the strongest. The two serve different risk priorities — they are complementary candidates, not substitutes.

---

*Terms sourced from official websites, help centers, and terms of service documents as of Feb 2026. Terms change frequently. Verify current conditions directly with each platform before borrowing. MiCA compliance status should be confirmed — platforms without MiCA authorization may lose EU access by July 2026.*
