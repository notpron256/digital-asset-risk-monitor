# Production Monitoring (Design Artifact)

This document describes the production monitoring this system would need **if it were actually deployed for real**. Nothing here is wired up — there's no alerting, no dashboards, no monitoring code in this repo. This is a conceptual design artifact (Module 6 of the SDLC process this project follows), written so the shape of "how would we know something's wrong" is thought through before it's ever needed, not invented under pressure during a real incident.

Each signal below has: what it measures, a **just log it** threshold (routine, no action), and a **needs a human now** threshold (page someone / open an incident).

## 1. Server errors / uptime

**Measures**: HTTP 5xx rate from the Express backend, and basic liveness (`GET /api/health` responding at all).

- **Just log it**: isolated 5xx responses (a single transient DB hiccup, one timed-out RPC call surfacing as a 500 instead of the intended stub fallback). Background noise in any real system.
- **Needs a human now**: `/api/health` fails to respond for more than ~2–5 consecutive minutes (service is down), or 5xx rate exceeds a few percent of requests over a short rolling window (e.g. >5% over 5 minutes), or the process is crash-looping (repeated restarts in a short window).

## 2. Malformed or rejected requests

**Measures**: requests failing input validation — invalid address format, invalid chain, unrecognized routes, missing required fields (the same `400` responses `resolveAddress`/`resolveChain` and friends already produce). Primarily a **security** signal (probing/fuzzing/scanning for a way in), secondarily a **UX** signal (a real user or a broken frontend build hitting validation walls).

- **Just log it**: occasional isolated `400`s — a plausible typo from a real person, expected background rate.
- **Needs a human now**: a burst of `400`s from a single source in a short window (classic scan/fuzz pattern — dozens of malformed requests in under a minute), **or** a sudden sustained rise in the overall `400` rate across all traffic (suggests a shipped frontend bug is now systematically sending malformed requests — real users are being blocked, not attackers).

## 3. Oracle data freshness

**Measures**: how long since the Chainalysis on-chain sanctions oracle's address list was last updated — already flagged as a known limitation in `spec.md` (Areas of concern #12: ~160 days stale at time of writing, no confirmed update cadence). Tracked by watching for on-chain writes to the oracle contract (e.g. its own update events, if it emits any, or transactions from Chainalysis's known admin address).

- **Just log it**: staleness within the range already observed and documented (roughly the ~160-day baseline, or gradually creeping past it) — log the value each check for trend visibility. This signal degrading slowly is expected, not urgent, given this is a free tier with no SLA to begin with.
- **Needs a human now**: staleness crosses a threshold clearly beyond the documented baseline — e.g. no on-chain update in over 12 months — suggesting the free oracle has likely been abandoned entirely, which materially undermines the tool's core value proposition and should trigger a real conversation about moving to a commercial provider (Chainalysis KYT, Elliptic, etc., per `spec.md`'s own stated production path). Not a page-someone-at-3am event — a "put this on the next planning agenda, seriously" event.

## 4. Dependency health (oracle contract + each RPC provider)

**Measures**: for each configured chain, whether the oracle contract itself still responds correctly to `isSanctioned()` (reachable, doesn't revert, returns a boolean), and whether each of the primary + two cross-check RPC providers is reachable and returning consistent answers — using the same multi-provider consensus data already computed and stored per screening (`consensus`, `providersQueried`, `providersSucceeded` in `screening_results`).

- **Just log it**: a single provider occasionally timing out or erroring while the others still answer — the cross-check mechanism is explicitly designed to tolerate this (see `spec.md` Technical approach's trust mechanism); log it for trend visibility, no action needed as long as `providersSucceeded >= 2`.
- **Needs a human now**: **all** providers for a given chain fail simultaneously (that chain has silently fallen back to stub mode — every screening on it is now unverified, and this can happen quietly since a stub result still returns a valid-looking response), **or** `consensus: "disagreement"` starts appearing repeatedly for the same chain (providers giving conflicting answers is a designed anomaly signal — spec.md's own fail-safe already treats a single disagreement as a hit, but *repeated* disagreement means something is actually wrong with a provider, not just a one-off), **or** a sustained failure rate across all three chains' primary RPCs at once (suggests a broader config problem, e.g. env vars wiped by a bad deploy).

## 5. Tier distribution drift

**Measures**: the proportion of screened transactions landing in each risk tier (Low/Medium/High) over a rolling window (e.g. the last 100 screenings, or the last 24 hours).

- **Just log it**: rolling tier percentages logged continuously regardless of alerting, to build a real historical baseline over time.
- **Needs a human now**: **more than 33% of transactions in the rolling window land in High tier.**

  **This threshold is illustrative, not empirically grounded — do not treat 33% as a validated production number.** This POC's mock provenance score is a deterministic hash of the address, distributed roughly uniformly across 0–100. Given the tier bands (Low 0–35, Medium 36–65, High 66–100), a uniform distribution naturally puts **~35% of addresses in High by pure chance**, with no anomaly occurring at all. So a 33% threshold on *this* data is close to the natural baseline, not a meaningful drift signal — it would fire constantly on random mock traffic and tell you nothing.

  A real production deployment, screening genuine transactions with a real risk-scoring provider, would see a distribution **heavily skewed toward Low** (most real transactions are not high-risk) — so the right threshold has to be derived from that deployment's own **actually observed** baseline, not assumed, and would almost certainly need to be **much lower than 33%** (a few percent above observed baseline, not an absolute one-third-of-traffic bar) to catch a genuine anomaly (a scoring bug, a real attack, a data-source failure) before it's obvious from the review backlog alone.

## Example: signal 5 trips — the intent.md that would be auto-opened

The scenario below is written as a live incident kickoff, not a hypothetical — this is what the on-call process would produce the moment the "needs a human now" threshold in signal 5 actually fires.

```markdown
# Intent 002: Tier Distribution Drift Incident

Author: on-call (auto-filed by monitoring)
Status: Draft — Open Incident

## Problem

At 03:14 UTC, the tier-distribution-drift monitor (see MAINTAIN.md, signal 5)
tripped its alert threshold: over the trailing 100 screened transactions,
41% were classified High tier, against the documented 33% alert bar. This is
a live, currently-open anomaly requiring investigation, not a scheduled
review. Every High-tier transaction from this window is sitting in the
compliance manager review queue, and the volume is already visibly above
what compliance normally clears in this timeframe.

Two live explanations, not yet distinguished:
(a) the scoring/tier-routing logic has a bug causing systematic
over-classification into High tier, or
(b) there has been a genuine shift in the risk profile of incoming
transactions (a coordinated attempt to route flagged funds through the
system, or a legitimate but unusual batch of high-risk-scoring addresses).

## Proposed outcome

Determine which of (a) or (b) is actually happening, and resolve
accordingly. If (a): identify and fix the scoring/routing bug, confirm the
distribution returns to baseline, and treat the alert as having done its
job correctly. If (b): confirm with compliance whether the elevated
High-tier volume reflects real risk that should proceed through review as
normal, or a false-positive pattern that means the *scoring inputs* (not
this alert's threshold) need correction.

## Affected users and systems

- Compliance managers, facing an unexpected review-queue volume spike.
- Ops managers, if part of the drift originated from Medium-tier
  transactions being escalated rather than routed to High directly —
  worth checking whether escalation rate also moved, not just direct
  High-tier routing.
- The scoring and screening pipeline (`scoring.ts`, `chainalysisClient.ts`)
  and the tier-distribution monitor itself: if root cause turns out to be
  that this deployment's real baseline is different from what the alert
  threshold assumed, the threshold needs correcting as part of closing
  this incident, not left to fire on the same false premise again.

## Design principles

- Investigate before acting. Do not silently clear or bulk-approve the
  backlog to relieve queue pressure before root cause is known — that
  defeats the purpose of the alert existing at all.
- Distinguish signal from noise first. MAINTAIN.md already documents that
  the 33% threshold was calibrated against this POC's own mock uniform
  scoring, not real-world data — so the *first* investigative step is
  confirming whether this deployment is still running mock/deterministic
  scoring or a real provider, since that changes how alarming 41% actually
  is.
- Whatever is found must be fed back into MAINTAIN.md: either the
  threshold gets recalibrated against real observed data, or this incident
  gets documented as an expected false-positive under still-mock scoring
  (and the fact that mock scoring is still live in what's supposed to be a
  production deployment becomes its own, separate finding worth flagging).

## Constraints

- No changes to `stateMachine.ts` or `scoring.ts` before root cause is
  confirmed — diagnosis before fix, per this project's own norm in
  AGENTS.md ("when a bug is reported, explain the root cause before fixing
  it").
- Any High-tier transactions genuinely reflecting real risk must still go
  through the normal compliance-manager review process — do not fast-track
  or bypass review to clear the backlog faster than the existing
  four-eyes/escalation design allows.

## Open questions

- Is this deployment still running the mock, deterministic hash-based
  scorer, or has it since been replaced with a real risk-scoring provider?
  This single fact determines whether 41% is expected noise or a real
  anomaly.
- What is the exact window and sample size behind the reported 41% — is
  this a stable reading over the last hour, or a one-time spike from a
  small batch that's already aged out of the rolling window?
- Are the High-tier transactions concentrated among a small number of
  addresses or submitters (suggests a specific actor or a bug affecting
  particular inputs), or spread evenly across otherwise-unrelated
  transactions (suggests a systemic scoring change)?
- Was there a deploy or code change to `scoring.ts`, `chainalysisClient.ts`,
  or the tier-band constants immediately before the drift began? Correlate
  timestamps.
- Regardless of root cause, should MAINTAIN.md's 33% threshold be
  recalibrated now, given this incident is the first real empirical data
  point this deployment has produced about its own baseline?
```
