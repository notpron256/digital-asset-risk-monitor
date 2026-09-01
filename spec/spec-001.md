# Spec 001: Pre-Transaction Digital Asset Risk Screening

Author: Sebastian Higgs
Status: Draft
Relates to: [intent-001](../intent/intent-001.md)

## Summary

A policy-engine check sits in front of wallet transaction signing and screens both outbound and inbound flows before funds move. Outbound screens the destination address. Inbound screens the coin provenance and hygiene of the incoming deposit — i.e. the originating/sending address's history — not the staging address itself, since staging addresses are generated internally by our own wallet and are inherently trusted. Screening combines a real, synchronous call to Chainalysis's free sanctions-screening tier with a mock 0–100 risk score standing in for mixer/dark-web/PEP exposure. A sanctions hit is an automatic high-risk override regardless of the mock score. Low-risk transactions clear automatically; medium-risk transactions get a four-eyes ops review with an escalation path to compliance; high-risk transactions are held until a compliance manager makes the final call. The same scoring and escalation logic runs for both flows, though the two state machines differ slightly to reflect that outbound requires broadcasting a transaction we initiate, while inbound resolves to either settling or returning ("kicking back") funds already received.

## Screening flow

### Outbound

1. Ops team member submits a withdrawal request specifying a destination address. Transaction record is created in `submitted`, then moves to `screening`.
2. Chainalysis sanctions API is called synchronously against the destination address, alongside the mock risk-scoring layer.
3. Combined result determines tier (see Risk scoring).
4. **Low** → moves straight to `broadcasting`, is signed and sent, then `settled` once confirmed by the network / received by the recipient address.
5. **Medium** → moves to `reviewing`, assigned to an ops manager (four-eyes: must not be the transaction's submitter). Ops manager approves (→ `broadcasting` → `settled`) or escalates (→ `reviewing`, reassigned to a compliance manager, same approve/reject options as High).
6. **High**, or any sanctions hit → moves to `reviewing`, assigned directly to a compliance manager. Approves → `broadcasting` → `settled`. Rejects → `rejected` (terminal).

### Inbound

1. An incoming deposit to a one-time staging address is detected on-chain. This is not user-initiated: detection creates the transaction record directly in `received`, then moves to `screening`.
2. The originating/sending address is screened for provenance and hygiene: Chainalysis sanctions check plus mock score. The staging address itself is not a subject of screening.
3. **Low** → moves straight to `settled`.
4. **Medium** → moves to `reviewing`, assigned to an ops manager (four-eyes). Approves (→ `settled`) or escalates (→ `reviewing`, reassigned to a compliance manager, same approve/reject options as High).
5. **High**, or any sanctions hit → moves to `reviewing`, assigned directly to a compliance manager. Approves → `settled`. Rejects → `kick_back` (terminal — flags the deposit for manual return; an ops user finds `kick_back` items via search in the wallet and manually instructs a return-to-sender, outside this tool's scope).
6. `settled` means the deposit is screened and cleared *at the staging address* — it does not mean the funds have been consolidated into the main balance. Sweeping the staging address into the main balance is a manual ops task performed outside this tool, and is not tracked as a state in this spec (see Technical approach and Areas of concern #10). Because the sweep destination is our own trusted internal address, it is not re-screened as a second transaction when it eventually happens.

## Risk scoring

- Score range: 0–100, mock-generated for mixer/dark-web/PEP exposure.
- Chainalysis sanctions result is binary (hit / no hit).
- **Override rule**: a sanctions hit forces High tier regardless of the mock score. The mock score is still computed and recorded alongside the sanctions result — together they form the full screening result for the audit record.
- Outbound: the address screened is the destination address.
- Inbound: the address screened is the originating/sending address (the source of the funds), not the staging address that received them.
- If there is no sanctions hit, the tier is determined solely by the mock score against the bands below.

| Tier   | Mock score range | Sanctions hit overrides to |
|--------|-------------------|------------------------------|
| Low    | 0–35              | High |
| Medium | 36–65             | High |
| High   | 66–100            | High |

## Escalation tiers

- **Low**: Auto-clear. No human involved.
  - Outbound → `broadcasting` → `settled`.
  - Inbound → `settled` directly.
- **Medium**: Routed to an ops manager for four-eyes review (reviewer must differ from the transaction's submitter). Ops manager either:
  - Approves → outbound proceeds to `broadcasting`/`settled`; inbound proceeds to `settled`.
  - Escalates → reassigned to a compliance manager within the same `reviewing` state, who then makes the same approve/reject call as High.
- **High** (or any sanctions hit): Assigned directly to a compliance manager. No automatic action, no timeout — a transaction can remain in `reviewing` indefinitely until reviewed.
  - Approves → outbound proceeds to `broadcasting`/`settled`; inbound proceeds to `settled`.
  - Rejects → outbound moves to `rejected`; inbound moves to `kick_back`.

Because `reviewing` is shared by both the ops-manager and compliance-manager steps, implementation needs a sub-field (e.g. `reviewer_role: ops_manager | compliance_manager`) to route each transaction to the correct queue — see Areas of concern.

## State machine

**Outbound**

```
submitted → screening ─┬─(low)────────────────────────→ broadcasting → settled
                        ├─(medium)→ reviewing[ops] ─┬─(approve)──────→ broadcasting → settled
                        │                            └─(escalate)→ reviewing[compliance] ─┬─(approve)→ broadcasting → settled
                        │                                                                  └─(reject)─→ rejected
                        └─(high / sanctions hit)──→ reviewing[compliance] ─┬─(approve)──────→ broadcasting → settled
                                                                            └─(reject)────────→ rejected
```

**Inbound**

```
received → screening ─┬─(low)─────────────────────────→ settled
                       ├─(medium)→ reviewing[ops] ─┬─(approve)───────→ settled
                       │                             └─(escalate)→ reviewing[compliance] ─┬─(approve)→ settled
                       │                                                                   └─(reject)─→ kick_back
                       └─(high / sanctions hit)──→ reviewing[compliance] ─┬─(approve)───────→ settled
                                                                           └─(reject)─────────→ kick_back
```

`finalising` from the intent's original four-state model is dropped: `broadcasting` (outbound only) and `settled` cover the same ground more precisely, and inbound never needed a broadcasting step since clearing a deposit doesn't require us to originate a new signed transaction. `reviewing`, `rejected`, and `kick_back` are new states this spec introduces to give the design a failure/return path and a shared human-review state, replacing the single `rejected` state proposed in the prior draft of this spec.

A transaction cannot move from `screening` to `broadcasting`/`settled` without a completed risk evaluation, and for medium/high tiers, without the required human approval.

## Technical approach

- The screening check is a synchronous call in the transaction-submission path: the transaction cannot be signed (outbound) or cleared (inbound) until a result is returned. A slow or unavailable Chainalysis API blocks the flow for this POC — accepted tradeoff. Production would need a dead-letter queue, retries, and API idempotency; explicitly out of scope here.
- Screening logic (Chainalysis call + mock scorer + tier decision) is a single shared module called from both the outbound and inbound paths, so the two flows cannot drift in behavior.
- Screening results are cached per address for 24 hours, then purged, so a repeat screen within that window reuses the prior sanctions result and mock score rather than re-querying. After 24 hours the cache entry is dropped and the next transaction against that address triggers a fresh screen — accepting that risk status can change day to day. The underlying transaction/deposit is still logged individually even when its screening result comes from cache, so the audit trail always shows which screening result applied to which transaction.
- Mock scoring layer is a pluggable interface so a real chain-analysis provider (Chainalysis KYT, Elliptic, etc.) can later be substituted without changing the screening flow or state machine.
- EVM mainnet only, MetaMask-signed, for this POC.
- Inbound uses one-time staging addresses per deposit so a tainted deposit never commingles with the main balance before screening completes. Consolidating a cleared staging address into the main balance ("sweeping") is a manual ops task performed outside this tool for the POC — not tracked by this tool's state machine, and not re-screened since the destination is a trusted internal address.
- **Architectural principle — this tool does not watch the chain.** The wallet/custody layer is the sole source of truth for on-chain events: it owns address generation, on-chain event monitoring, and signing. This risk-monitor tool never independently polls or watches the chain; it subscribes to wallet-emitted webhooks for deposit detection ("deposit received on staging address X") and outbound settlement confirmation ("outbound tx confirmed"), and reacts to those events. This tool owns scoring, tiering, review-queue assignment, and gating whether a transaction is allowed to proceed. The wallet remains the single source of truth for on-chain state; this tool is the single source of truth for risk/compliance decisions — the two are never both independently monitoring the chain.

## Audit logging

Each screening decision records:

- Raw Chainalysis API response.
- Mock score value (0–100).
- Tier assigned (low / medium / high).
- Reviewer identity — for medium and high tiers only (not applicable to auto-cleared low-tier transactions).
- Decision timestamp.
- Screening-request ID, for traceability of a given screening result back to the specific transaction/deposit it applied to (including when the result was served from cache — see Technical approach).

## Areas of concern

Gaps or contradictions found while writing this spec, resolved or flagged below:

1. ~~No terminal state for a rejected transaction~~ — resolved: `rejected` (outbound) and `kick_back` (inbound) added as terminal states.
2. **`reviewing` conflates two distinct queues.** Ops-manager review and compliance-manager review are both modeled as the same `reviewing` state. Implementation needs a `reviewer_role` (or equivalent) sub-field so each role's queue/dashboard only shows what's assigned to them, and so an escalation from ops to compliance is visible as a transition even though the top-level state name doesn't change.
3. ~~Segregation of duties~~ — resolved: reviewing ops manager must differ from the transaction's submitter, stated explicitly under Escalation tiers.
4. ~~SLA/timeout for review~~ — resolved: no timeout. A transaction can sit in `reviewing` indefinitely.
5. ~~Inbound "submitted" trigger~~ — resolved: inbound starts in `received`, triggered by on-chain deposit detection, not `submitted`.
6. ~~Sweep transaction re-screening~~ — resolved: the sweep to our own trusted internal address is not re-screened.
7. ~~Caching/TTL policy~~ — resolved: 24-hour cache per address, then purged.
8. ~~Sanctions-override audit trail~~ — resolved: mock score and sanctions result are both always recorded as the full screening result.
9. ~~"Kick back" mechanics~~ — resolved: `kick_back` is a prompt, not a completed action — it flags a rejected deposit as awaiting manual return, not that the return has happened. An ops user finds transactions in this state via search/filter in the wallet and manually instructs a return-to-sender for each. The return transaction itself is outside this tool's scope (no automatic trigger, no re-screening — the recipient is the same address the funds originated from).
10. ~~`settled` for inbound may hide a real state transition~~ — resolved: for inbound, `settled` means "screened and cleared into the staging address" only. It does not include consolidation into the main balance. No `sweeping` state is added to the state machine — sweeping remains a manual ops task outside this tool's scope for the POC (see Technical approach).
11. **Cache key scope.** The 24-hour cache is described per-address, but doesn't yet specify whether it's scoped per-direction (an address could plausibly appear as both an outbound destination and an inbound sender) or shared. Recommend scoping the cache by address only, since sanctions/provenance risk is a property of the address, not of which direction it's used in — but flagging as an assumption.

## Open questions

None remaining — all three prior open questions (wallet/risk-monitor responsibility boundary, sweeping state, audit/logging fields) are resolved above.
