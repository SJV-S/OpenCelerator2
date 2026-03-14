# Deep Research Prompt: Bitcoin-Backed Lending — Verification & Runner-Up Analysis

## Context

I'm a Swedish private individual evaluating Bitcoin-backed loans. I've already done extensive analysis comparing platforms and have narrowed my top candidate to **Firefish** (firefish.io), with **Nebeus** and **Nexo's Zero-Interest Credit (ZiC)** as potential runner-ups. I need you to verify claims I've collected, fill in gaps, and do deep dives on the runner-ups.

## My priorities (in order)

1. **Liquidation mechanics transparency** — I need to know exactly how each platform calculates LTV, what price feed they use, how often they check, and whether a brief intraday wick can trigger liquidation vs. a sustained drop. "Sole discretion" language is a dealbreaker.
2. **Custody model** — non-custodial multisig is ideal. No rehypothecation is a hard requirement. I lived through 2022 and watched Celsius/BlockFi depositors get wiped.
3. **Grace/cure period** — time to react to a margin call matters. Platforms with zero grace period and opaque monitoring are dangerous.
4. **Regulatory status** — MiCA registration or equivalent EU regulation. Offshore entities with no regulatory oversight (Marshall Islands, etc.) are out.
5. **EUR-denominated loans** — I'm in Sweden, I don't want USD currency conversion risk on top of BTC volatility.
6. **Open source / auditability** — can I verify the code that secures my collateral?
7. **Actual user experiences** — not marketing, not official claims. Reddit, forums, Trustpilot, Twitter/X, real people who have used the lending product.

Do NOT lecture me on the risks of borrowing against Bitcoin. I understand them thoroughly. Just give me facts.

---

## Part 1: Verify Firefish Claims

I've been told the following about Firefish. Verify each independently:

### Regulatory
- [ ] **MiCA registration**: Firefish claims to be listed in the ESMA Interim MiCA Register as a CASP, operating through Firefish Europe s.r.o. (Slovakia). **Check the ESMA register directly.** Is the registration live and active, or still pending? What is the exact registration status and date?
- [ ] **LEI**: Claimed LEI 9845004E55FCFA069549 for Firefish Europe s.r.o., registered with Slovak Ministry of Justice. Verify on GLEIF or Bloomberg LEI.

### Liquidation mechanics
- [ ] **95% LTV liquidation threshold** — is this confirmed in their terms of service or legal agreements, not just marketing pages?
- [ ] **9-exchange weighted price index** — which 9 exchanges? Is this documented anywhere official? How exactly is the weighting done?
- [ ] **5-minute price refresh** — is this the monitoring interval for liquidation checks, or just a display refresh? What does the actual terms of service say about how frequently LTV is evaluated?
- [ ] **Margin call stages at 73%, 79%, 86%** — confirmed in TOS?
- [ ] **Is there any grace period or cure period** between hitting a margin call level and liquidation? Or is it purely price-driven with no time component?

### Custody & security
- [ ] **3-of-3 multisig** — one source said 3-of-3, another said 2-of-3. Which is it? Who holds the keys? What exactly is the key distribution?
- [ ] **Ackee Blockchain audit** — is the audit report publicly available anywhere? If not, has anyone (journalists, reviewers) seen it or summarized findings?
- [ ] **Open source protocol** — verify the GitHub repo (github.com/Firefish-io/firefish-protocol) is real, active, and contains the actual multisig/escrow logic, not just utilities.
- [ ] **Disaster recovery** — what happens if Firefish disappears mid-loan? Can the borrower reclaim collateral without Firefish's cooperation? How exactly? Is this documented in the protocol or TOS?
- [ ] **Oracle centralization** — Firefish operates both the Price Oracle and Payment Oracle. What exactly can a dishonest oracle do? What is the worst-case scenario? Are there any technical safeguards against oracle misbehavior?

### Track record
- [ ] **$130M+ loan volume** — is this independently verified anywhere, or purely self-reported?
- [ ] **Zero price-based liquidations** — same question. Any independent confirmation?
- [ ] **Braiins $400K loan** — did this actually happen? Is there a public source beyond the Braiins blog post?
- [ ] **Martin Matejka's Stratosphere Capital** — this company entered liquidation in Aug 2025. Why? Was it related to Firefish in any way?

### Practical
- [ ] **What are actual current borrowing rates?** The range is "5-15%" but what are borrowers paying in practice right now? Check the platform if possible.
- [ ] **What EUR loan sizes are currently available?** Is there enough lender liquidity for a loan of, say, €20,000-50,000?
- [ ] **How fast is funding?** The Braiins case claims 1 day. What do regular users report?
- [ ] **Any insurance on escrowed collateral?**
- [ ] **What happens at loan maturity if I can't repay?** Is there a grace period? What are the penalties?
- [ ] **Can I repay early without penalty?**

---

## Part 2: Deep Dive — Nebeus

Nebeus (nebeus.com) is a potential runner-up because they reportedly offer a **3-10 day cure period** after margin call, which is the most generous in the industry. But their price feed is opaque.

Research thoroughly:

### Company
- Who owns and operates Nebeus? Legal entity, jurisdiction, founders, team backgrounds.
- Regulatory status — they claim Bank of Spain registration. Verify. Any MiCA registration?
- Funding history — VC backing? Revenue model?
- How long have they been operating the lending product specifically?
- Any security incidents, complaints, or regulatory actions?

### Terms of service (read the actual TOS, not marketing pages)
- What are the exact liquidation mechanics? How is LTV calculated? What price feed?
- **The 3-10 day cure period** — is this actually in the TOS, or is it marketing? What are the exact conditions? Can they override it? Is it 3 days or 10 days and what determines which?
- What is the exact liquidation threshold?
- Is the cure period guaranteed contractually, or is it "at Nebeus's discretion"?
- What happens during the cure period — does interest keep accruing? Can they liquidate early if price drops further?

### Custody
- BitGo custody with $250M Lloyd's insurance — verify this is current. Does the insurance cover borrower collateral specifically?
- "Internal rehypothecation" — what exactly does this mean? Where does the collateral go? What are the contractual protections?

### User experience
- Trustpilot reviews, Reddit discussions, forum posts. What do actual lending users say?
- Any reports of unexpected liquidations, disputes, or inability to withdraw?
- Is the platform actively maintained and responsive?

### Sweden availability
- Confirm explicitly that Swedish residents can use the lending product as private individuals.
- EUR loans available via SEPA?

---

## Part 3: Deep Dive — Nexo Zero-Interest Credit (ZiC)

Nexo launched Zero-Interest Credit in January 2026. 0% APR and reportedly no liquidation during the fixed term. This sounds too good to be true. I need to understand the catch.

Research thoroughly:

### How ZiC actually works
- What are the "Minimum Repayment Price" and "Maximum Repayment Price" set at origination? How are they calculated?
- What happens at maturity if BTC is below the Minimum Repayment Price? Do I lose all collateral? Part of it?
- What happens if BTC is above the Maximum Repayment Price? Is my upside capped?
- What is the actual term length? Can I choose?
- Is the collateral locked for the full term with no early exit?
- What LTV do they use for ZiC? Is it still 50%?

### The real cost
- If 0% APR and no liquidation, how does Nexo make money on this product? What is the implicit cost to the borrower?
- Is this essentially an options structure (collar) packaged as a loan? If so, what is the embedded option cost?
- Compare: if I borrowed at 13% APR from Firefish but kept full upside exposure, vs. 0% from Nexo ZiC but with capped upside — which is actually cheaper in various BTC price scenarios?

### Terms of service
- Read the actual ZiC terms/agreement. What does the fine print say?
- Can Nexo change the terms during the loan?
- What happens if Nexo goes insolvent during the term? The collateral is custodial and rehypothecated — is ZiC collateral treated differently?

### Rehypothecation concern
- Nexo rehypothecates. For ZiC specifically, where does the collateral go? Is it ring-fenced?
- Nexo has faced regulatory issues in the past (Bulgaria investigation, US state actions). Current regulatory status in the EU?

### Sweden availability
- Confirm ZiC is available to Swedish residents as private individuals.
- What currency is the loan disbursed in?

### User experience
- Has anyone actually used ZiC yet (launched Jan 2026)? Any early reports?
- General Nexo lending experience from Swedish/EU users?

---

## Part 4: Are There Other Candidates I'm Missing?

Based on my requirements (Swedish individual, EUR loans, no rehypothecation strongly preferred, transparent liquidation mechanics, regulated), are there any platforms I haven't considered? Specifically:

- **Debifi** (launched by Hodl Hodl's CEO) — uses 3-of-4 multisig with Casa and Blockstream as key holders. Is it available to Swedish individuals or institutions only? What are the terms?
- **Verifi21** — reportedly launched Q1 2025 for European customers. Bitcoin-only, no rehypothecation. Any actual terms available?
- **Sygnum/MultiSYG** — Swiss bank, launching H1 2026. Available to individuals?
- Any other EU-regulated, non-custodial or no-rehypothecation Bitcoin-backed lending platform that serves Swedish individuals?

---

## Output format

For each platform, give me:
1. **Verified facts** — what you confirmed independently with sources
2. **Unverified claims** — what the platform says but you couldn't independently confirm
3. **Red flags** — anything concerning
4. **Open questions** — what I should ask the platform directly before committing funds

Do not pad the output. If you can't verify something, say so. If something looks bad, say so. I want facts, not reassurance.
