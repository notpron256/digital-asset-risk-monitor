# Review Policy

A short checklist for reviewing any change to this project before trusting it — written for a solo founder reviewing AI-generated work, not a team code-review process.

## How this gets used

- After any significant change, a self-review against this file runs before the change is reported as done — the verdict is shown alongside the change itself, not replaced by "done."
- You can run the same checklist yourself, on any change, whether or not a self-review was already attached to it.

Run the five checks below in order. Every finding gets classified:

- **Blocking** — must be resolved before this change is trusted. Don't treat the change as complete while a Blocking finding is open.
- **Note** — worth knowing, not blocking. Something to keep in mind, revisit later, or just have on record.

## 1. Scope

Does the change do exactly what was asked, and nothing more?

- Was anything touched, renamed, refactored, or added that wasn't part of the request?
- If scope genuinely needed to expand (a fix required touching a neighboring file, a feature implied a schema change, etc.), was that flagged and approved *before* the extra work — not presented afterward as something that just happened?

**Blocking**: scope expanded without being flagged and approved first.
**Note**: scope expansion was flagged and approved before/during the work — legitimate, just worth restating for the record.

## 2. AGENTS.md discipline

Check the change against each norm already documented in `AGENTS.md`'s Project norms section:

- **External dependencies** — any new contract address, RPC endpoint, or third-party service relied on? Was it independently verified (block explorer, a real test call) rather than trusted from docs or search results alone?
- **Shared Postgres data** — was any test/throwaway data written to the real database without asking first? If created, was cleanup explicit and specific (which rows, which tables) — not just asserted?
- **Root cause before fixing** — for any bug fix, was the root cause explained first, including whether it's a data/logic bug or a display/presentation bug, before the fix was written?
- **Scope discipline** — cross-check against section 1; this norm and that check should agree.
- **Deferred-scope boundaries** — did the change silently implement any of the POC's intentionally-deferred items (real authentication, wallet chain-watching, cryptographic oracle proof verification, automated sweeping, or anything added to that list later) without flagging it as an intentional expansion beyond POC scope?

**Blocking**: any norm was violated outright.
**Note**: a norm's applicability was genuinely borderline, or it was followed but not explicitly called out.

## 3. Blast radius

Did the change touch any of the system's highest-consequence parts:

- `stateMachine.ts` or its transition logic, however it ends up expressed?
- `reviewer_role` assignment or escalation logic, or the four-eyes check?
- The audit trail — `screening_results` or `review_actions` (schema, or how they're written/read)?

If yes to any of these: was it actually required by the task, and was it called out explicitly — not just visible if someone reads the diff closely?

**Blocking**: one of these areas changed without being required by the task, or changed without being explicitly flagged.
**Note**: one of these areas changed, was required, and was clearly called out.

## 4. Tests

- Does `cd server && npm test` still pass (all green, `fail: 0`)?
- If the change touches logic already covered by `scoring.test.ts` or `stateMachine.test.ts`, do those tests still meaningfully exercise the new behavior, or is there now a gap?
- If the change adds new logic in scope for these tests (tier routing, four-eyes, state transitions), was a test written for it?

**Blocking**: `npm test` fails, or changed/new logic in a tested area has no coverage at all.
**Note**: tests pass but coverage of the new behavior is thinner than it could be.

## 5. Documentation

- Problem, outcome, or design principles changed → does `intent.md` need updating?
- Screening flow, state machine, risk scoring, escalation tiers, technical approach, or known limitations changed → does `spec.md` need updating?
- Setup, environment variables, or how to use the app changed → does `README.md` need updating?
- A new project-specific norm was established, or an old one invalidated → does `AGENTS.md` need updating?

**Blocking**: a doc is now factually *wrong* as a result of the change, and wasn't fixed or explicitly flagged as needing a fix.
**Note**: a doc could be more complete but isn't actively wrong.

## Verdict format

```
## Self-review: <short description of the change>

1. Scope — <clean | N finding(s)>
2. AGENTS.md discipline — <clean | N finding(s)>
3. Blast radius — <clean | N finding(s)>
4. Tests — npm test: <PASS | FAIL> (<pass>/<total>) — <clean | N finding(s)>
5. Documentation — <clean | N finding(s)>

Blocking: <list each, or "none">
Notes: <list each, or "none">

Overall: <✅ Clean | 🛑 Blocking findings — not trusted until resolved>
```
