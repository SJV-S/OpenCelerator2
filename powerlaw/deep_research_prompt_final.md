# Deep Research Prompt: Final Verification — Firefish, Debifi, Xapo Bank

## Who I am

Swedish private individual evaluating Bitcoin-backed loans. I've spent weeks researching 11+ platforms and narrowed to three finalists. I now need every claim independently verified, every open question answered, and a final rank ordering.

## My hard requirements (in order of priority)

1. **No rehypothecation.** Non-negotiable. I watched Celsius/BlockFi depositors get wiped in 2022.
2. **Transparent liquidation mechanics.** I need to know exactly how LTV is calculated, what price feed is used, how often it's checked, and whether a brief wick can trigger liquidation.
3. **Custody model.** Non-custodial multisig is ideal. If custodial, the platform must not rehypothecate and must be regulated.
4. **Grace/cure period.** Time to react to margin calls matters. Zero grace with opaque monitoring is dangerous.
5. **EUR-compatible loans.** I'm in Sweden. I can receive EUR via Revolut/Wise and convert to SEK cheaply. USD-only is acceptable if everything else is strong, but EUR is preferred.
6. **Available to Swedish private individuals.** Must be confirmed, not assumed.
7. **Regulatory status.** MiCA or equivalent EU regulation preferred. Offshore with no oversight is a negative.
8. **Open source / auditability.** Can I verify the code that secures my collateral?
9. **Real user experiences.** Not marketing. Reddit, Trustpilot, forums, Twitter/X.

Do NOT lecture me on the risks of borrowing against Bitcoin. Just give me facts.

---

## Part 1: Verify Firefish Claims

We believe the following about Firefish (firefish.io). Verify each independently. If something is wrong, say so.

### Regulatory status
- [ ] Claims MiCA CASP authorization through Firefish Europe s.r.o. (Slovakia), via the National Bank of Slovakia (NBS). **Check the ESMA Interim MiCA Register directly.** Is Firefish listed? Is the registration active, pending, or not present? A 2026 GLI chapter stated no NBS authorizations had been issued as of its writing — is that still the case?
- [ ] LEI 9845004E55FCFA069549 for Firefish Europe s.r.o. — verified on Bloomberg. Confirm on GLEIF that it is active and associated with the correct entity.
- [ ] Firefish Labs s.r.o. (Czech Republic, reg. Jun 2022) is the development entity. Firefish Europe s.r.o. (Slovakia, reg. Dec 2023) is the operating entity. Confirm both exist in their respective company registries.

### Liquidation mechanics
- [ ] **95% LTV liquidation threshold.** Confirmed in their FAQ. Verify this is also in the actual loan agreement / terms of service, not just marketing.
- [ ] **No grace period.** FAQ states: "If the Bitcoin price hits the liquidation price, even for only a couple of seconds, it is considered as a liquidation event." Verify this exact language exists. Is there any contradicting language elsewhere in the TOS?
- [ ] **Margin call stages at 73%, 79%, 86%.** Confirmed as informational email notifications only, with no contractual force. Verify.
- [ ] **Price feed:** Legal docs say "CoinGecko BTC Price in USD" or "any other price index" — giving broad discretion. The FAQ claims a 9-exchange weighted index. **Which is the binding legal definition?** Can Firefish switch price feeds at will?
- [ ] **5-minute refresh is display only.** The actual oracle monitoring frequency for liquidation checks is undisclosed. Can you find any documentation, interview, or technical spec that states the real monitoring interval?
- [ ] **What are the 9 exchanges?** Has Firefish ever named them publicly (blog, podcast, interview)?

### Custody & security
- [ ] **3-of-3 multisig.** Firefish holds 2 keys (Price Oracle + Payment Oracle). Borrower's key is ephemeral — generated at setup, used to pre-sign all closing transactions, then permanently discarded. Verify this from the protocol documentation or GitHub source code.
- [ ] **Pre-signed transactions lock destinations** to borrower or lender addresses only. A compromised Firefish cannot redirect to its own wallet. Verify from protocol docs or code.
- [ ] **Timelock disaster recovery:** Borrower can reclaim collateral 1 month after maturity without oracle cooperation. Verify from protocol docs or code. What is the exact timelock duration? Is it configurable?
- [ ] **Ackee Blockchain audit:** The report is not public. Firefish is not on Ackee's public client list. Ackee specializes in Ethereum/Solana — unusual for a Bitcoin Rust project. Can you find any evidence that this audit actually happened? Any reference from Ackee themselves?
- [ ] **GitHub repo** (github.com/Firefish-io/firefish-protocol): Reported as Rust, 34 stars, 9 commits. Check current state. Is this actively maintained? Does it contain the actual multisig/escrow logic or just utilities? Are deterministic builds actually working?
- [ ] **No rehypothecation.** Verify this is stated in the TOS/loan agreement, not just marketing.

### Track record & financials
- [ ] **$130M+ loan volume, ~27,000 users, zero price-based liquidations.** All self-reported. Any independent verification anywhere?
- [ ] **Braiins $400K loan.** Confirmed via Braiins blog post. But Braiins is a 15% equity investor ($1M for 15% stake in $1.8M seed round, April 2025). Verify these numbers.
- [ ] **Martin Matejka's Stratosphere Capital** entered liquidation Aug 2025. Why? Any connection to Firefish?
- [ ] **Igor Neumann** — 20 years at Reuters/Thomson Reuters/Refinitiv/LSEG. Verify on LinkedIn or other public sources.
- [ ] **Zero security incidents** — no hacks, breaches, or loss of funds ever reported. Can you find any contrary evidence?

### Practical questions (answer these, don't just verify)
- [ ] **What are actual current borrowing rates?** The range is 6-13%. What are borrowers paying right now? Check the platform or recent user reports.
- [ ] **What EUR loan sizes are available?** Is there enough lender liquidity for €20,000-50,000?
- [ ] **Can a Revolut or Wise EUR IBAN be used** to receive the loan disbursement and send repayment? Any user reports of this working or failing?
- [ ] **Early repayment: full interest for entire term still owed.** Verify this is in the TOS. Is there any way around it (e.g., negotiation, partial repayment structure)?
- [ ] **1.5% origination fee** deducted from collateral. Plus **5% liquidation fee.** Verify both.
- [ ] **Insurance on escrowed collateral?** Any coverage at all?
- [ ] **What happens at maturity if I can't repay?** Exact process, timeline, penalties.
- [ ] **What happens if Firefish goes bankrupt mid-loan?** Beyond the timelock, what is the legal situation? Does the borrower have a legal claim on the collateral, or only a cryptographic one?

---

## Part 2: Verify Debifi Claims

We believe the following about Debifi. Verify each independently.

### Company & regulation
- [ ] Built by **Max Keidun** (Hodl Hodl founder). Verify.
- [ ] Backed by **Ten31, Epoch VC, Plan B Fund, Fulgur Ventures.** Advisors include **Willy Woo** and **Preston Pysh.** Verify each.
- [ ] **No regulation.** P2P marketplace facilitator, not a regulated lender. Loans are private agreements between borrower and lender. Verify this is their stated legal position.
- [ ] **Registered entity undisclosed.** Can you find the actual legal entity, jurisdiction, and registration? This is a gap.

### Custody & security
- [ ] **3-of-4 multisig.** Keys held by borrower, lender, Debifi, and **AnchorWatch** (independent 4th party). Verify from official documentation.
- [ ] **AnchorWatch** — what exactly is this entity? Is it an insurance company? A custodian? What is their regulatory status? Is their insurance policy active and does it specifically cover borrower collateral in Debifi loans?
- [ ] **Each loan gets a dedicated escrow address** — no pooling. Verify.
- [ ] **Open-source escrow extractor tool.** Find it. Verify it exists and works.
- [ ] **No single party can move funds.** Verify the exact signing requirements. Can any combination of 2 parties move funds? Or does it require 3-of-4?
- [ ] **No rehypothecation.** Verify this is stated in documentation/TOS, not just inferred from the multisig model.
- [ ] **CertiK audit** — verify. Is the audit report public? What did it cover? Three independent audits claimed — who were the other two?
- [ ] **Zone21 ranked Debifi #2 safest globally** using a 13-factor risk model. Find this ranking. What was #1? What factors were used? How credible is Zone21 (they are the Nunchuk research team)?

### Loan terms
- [ ] **50% starting LTV** (2:1 collateral ratio). Verify.
- [ ] **90% LTV forced liquidation.** Verify from TOS/documentation.
- [ ] **Margin calls at 75% → 80% → 85%.** Verify.
- [ ] **24-hour grace period at maturity** for non-repayment. Verify. Is there any grace period for price-based liquidation during the term?
- [ ] **9-14% APR** (lender-set via P2P marketplace). What are actual current rates?
- [ ] **1-2% origination fee.** Verify.
- [ ] **Interest-only payments during term, principal at maturity.** Verify. What happens if you miss an interest payment?
- [ ] **Early repayment with no penalty.** Verify from TOS.
- [ ] **EUR loans confirmed.** Verify. How is disbursement made — SEPA? Wire? What about repayment?
- [ ] **$10,000-$700,000 loan range.** Verify. Is the $10K minimum firm?
- [ ] **Price feed:** Oracle-based. Can you find ANY detail on what oracle, what exchanges, what methodology?
- [ ] **Monitoring frequency** for liquidation checks. Can you find any information at all?

### Sweden availability
- [ ] **Sweden not on restricted list.** Verify by checking their documentation or contacting them.
- [ ] **KYC/KYB required.** What documents does a Swedish individual need?

### User experience
- [ ] **Too new for Trustpilot reviews.** Confirm. Search for any user experiences anywhere — Reddit, Twitter/X, Bitcoin forums, podcasts, blog posts. Has anyone actually used Debifi for a loan and reported on it?
- [ ] **How long has Debifi been operational?** When did they start processing loans?

---

## Part 3: Verify Xapo Bank Claims

We believe the following about Xapo Bank. Verify each independently.

### Company & regulation
- [ ] **Gibraltar-based, banking license.** Verify the license. What entity holds it? What type of banking license? When was it granted?
- [ ] Who owns Xapo Bank? What is the corporate structure?
- [ ] **Founded by Wences Casares** (or is that only the original Xapo custody business that was sold to Coinbase)? Who runs Xapo Bank now?
- [ ] Financial standing — any public information on solvency, assets under management, profitability?

### Loan terms
- [ ] **Starting LTV: 20-40%.** Verify. Can the borrower choose their LTV within this range, or does Xapo assign it?
- [ ] **Liquidation at 80% LTV.** Verify from TOS.
- [ ] **Margin call at 65% LTV.** Verify from TOS.
- [ ] **APR: 8-12%, tracks Fed rate, updated daily.** Verify. What is the current rate?
- [ ] **Zero fees** — no origination, no closure, no margin call fee, no liquidation fee, no early repayment penalty. Verify each from TOS.
- [ ] **Loan terms: 30, 90, 180, or 365 days.** Verify.
- [ ] **$1,000/year membership fee.** Verify. Is this required for all borrowers? Can it be waived? Is there a minimum balance requirement?
- [ ] **Loans denominated in EUR?** Or USD? Or both? Verify from documentation.

### Custody & rehypothecation
- [ ] **No rehypothecation.** BTC stays in vault untouched. Verify from TOS — not marketing. Is there any language allowing Xapo to use, pledge, or transfer collateral?
- [ ] **Fully custodial.** No client keys. Verify. What custodian do they use? In-house or third-party?
- [ ] **Only enough collateral sold to cover loan + interest** during liquidation (partial liquidation, not full). Verify.

### Liquidation mechanics
- [ ] **Price feed:** Not disclosed. Can you find any information on what price feed Xapo uses for LTV calculation?
- [ ] **Monitoring frequency:** Not disclosed. Can you find any information?
- [ ] **Grace period:** None explicit. Is there any language in the TOS about cure periods, notification periods, or time between margin call and liquidation?
- [ ] **How fast does liquidation execute?** Any data or user reports?

### Sweden availability
- [ ] **Sweden confirmed.** Verify from their documentation or country list.
- [ ] **Can Swedish private individuals open an account?** Any restrictions (e.g., minimum balance, invitation-only)?

### User experience
- [ ] **Trustpilot reviews** — limited data reported. Check current state. How many reviews? What rating? What do borrowers specifically say about the lending product?
- [ ] Search Reddit, Twitter/X, forums for any user experiences with Xapo Bank's Bitcoin-backed loans.
- [ ] **Any complaints about liquidation, unexpected fees, withdrawal issues, or account closures?**

---

## Part 4: Comparative Analysis & Ranking

After verifying everything above, provide:

### 1. Corrected comparison table
Update the head-to-head table from our analysis with any corrections from your verification. Flag anything we got wrong.

### 2. Risk assessment for each platform

For each of the three, assess:
- **Platform failure risk:** What happens to my collateral if the platform goes bankrupt mid-loan? Rate: low / medium / high.
- **Unjust liquidation risk:** Could I be liquidated due to a price feed error, a flash wick, or opaque monitoring? Rate: low / medium / high.
- **Regulatory risk:** Could the platform lose the ability to serve Swedish residents before my loan matures (e.g., MiCA deadline July 2026)? Rate: low / medium / high.
- **Liquidity risk:** Is there enough activity on the platform to get matched with a lender for €20,000-50,000? Rate: low / medium / high.
- **Operational risk:** Is the team competent, funded, and focused? Could the platform be abandoned mid-loan? Rate: low / medium / high.

### 3. Final rank ordering

Rank the three platforms for a Swedish private individual borrowing €20,000-50,000 against Bitcoin, weighing the priorities listed at the top of this document. Explain your ranking. If any platform should be eliminated based on your findings, say so and explain why.

### 4. Are we missing anyone?

Based on everything you now know about my requirements, is there a platform we haven't considered that serves Swedish individuals with EUR-compatible loans, no rehypothecation, and transparent liquidation mechanics? Specifically check:
- **Sygnum / MultiSYG** — Swiss bank, reportedly launching BTC-backed lending H1 2026. Available to individuals? Current status?
- **Verifi21** — reportedly launched Q1 2025 for European customers. Bitcoin-only, no rehypothecation. Any actual terms or user reports?
- Any other platform that has launched or become available since early 2026?

---

## Output format

For each platform, give me:
1. **Verified facts** — what you confirmed independently with sources
2. **Corrections** — anything we got wrong in our analysis
3. **Unverified claims** — what the platform says but you couldn't independently confirm
4. **Red flags** — anything concerning that we may have missed
5. **Answers to open questions** — from the lists above

Then the comparative ranking.

Do not pad the output. If you can't verify something, say so. If something looks bad, say so. I want facts, not reassurance.
