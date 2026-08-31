# Intent 001: Pre-Transaction Digital Asset Risk Screening

Author: Sebastian Higgs
Status: Draft

## Problem

Digital asset addresses can become tainted — appearing on sanctions lists, linked to politically exposed persons, or having received funds traceable to dark web markets, money laundering, or mixing services. This creates compliance risk (facilitating money laundering) and regulatory risk (a deficient AML program for the digital asset business). Checks need to happen BEFORE a transaction, not after — post-hoc detection is too late for a strict regulator.

Two transaction paths need screening:

- **Outbound**: is the destination address clean before we send?
- **Inbound**: is an incoming deposit clean before it joins our balance — likely via one-time staging addresses so tainted coins don't poison the rest of the balance?

## Proposed outcome

A pre-transaction risk screening tool that checks both outbound destination addresses and inbound deposit addresses, using a real Chainalysis free-tier sanctions screening API call plus a custom mock risk-scoring layer for mixer/dark-web/PEP exposure (since those require paid enterprise tooling we won't use for this POC).

Low-risk transactions clear automatically; high-risk transactions are flagged and routed to compliance for manual sign-off/escalation before proceeding.

## Affected users and systems

- Ops team members processing withdrawal requests (outbound flow).
- Compliance managers who review and approve/reject escalated high-risk transactions.
- Sits as a policy-engine check in front of wallet transaction signing — alongside access controls and permissions, not replacing them.

## Design principles

- Screen before broadcast, never after.
- Automated clearance for low risk, human escalation for high risk — humans review flagged exceptions, not every transaction.
- Real signal (Chainalysis sanctions API) combined with an extensible mock scoring layer designed so a real chain-analysis provider (Chainalysis KYT, Elliptic, etc.) could be swapped in later without redesigning the flow.

## Constraints

- EVM mainnet with MetaMask, funded with a small personal test budget the author has explicitly earmarked as fully at-risk — not production customer funds, not a production system.
- Transaction values kept minimal specifically because this is a real-money POC, not a simulation.
- EVM chains only for this POC.
- Use Chainalysis's free sanctions screening API tier only (no paid KYT).
- Recordkeeping approach designed with FinCEN/BSA (US) and FCA crypto AML (UK) principles in mind as a design reference — not a claim of actual regulatory compliance, which would require real legal review.

## Open questions

- Should chain-analysis API calls be synchronous (block the transaction until the check returns) or async/queued given potential API latency?
- Does this stay EVM-only or is multi-chain support worth scoping later?
- What exact score threshold separates "auto-clear" from "escalate to compliance" — needs a concrete number before Design stage.
