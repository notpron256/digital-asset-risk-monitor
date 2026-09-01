import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  outcomeAfterScreening,
  outcomeAfterReview,
  allowedActionsForRole,
  isFourEyesViolation,
} from "./stateMachine.js";

// --- submitted/received -> screening -> reviewing/settled ---

test("initial state: outbound starts at submitted, inbound at received", () => {
  assert.equal(initialState("outbound"), "submitted");
  assert.equal(initialState("inbound"), "received");
});

test("outcomeAfterScreening: low tier auto-clears straight to settled, no reviewer", () => {
  assert.deepEqual(outcomeAfterScreening("low"), { state: "settled", reviewerRole: null });
});

test("outcomeAfterScreening: medium tier goes to reviewing, assigned ops_manager", () => {
  assert.deepEqual(outcomeAfterScreening("medium"), { state: "reviewing", reviewerRole: "ops_manager" });
});

test("outcomeAfterScreening: high tier goes to reviewing, assigned compliance_manager", () => {
  assert.deepEqual(outcomeAfterScreening("high"), { state: "reviewing", reviewerRole: "compliance_manager" });
});

// --- allowed actions per role ---

test("allowedActionsForRole: ops_manager can approve or escalate, never reject", () => {
  const actions = allowedActionsForRole("ops_manager");
  assert.deepEqual(actions, ["approve", "escalate"]);
  assert.ok(!actions.includes("reject"));
});

test("allowedActionsForRole: compliance_manager can approve or reject, never escalate", () => {
  const actions = allowedActionsForRole("compliance_manager");
  assert.deepEqual(actions, ["approve", "reject"]);
  assert.ok(!actions.includes("escalate"));
});

// --- valid review transitions ---

test("outcomeAfterReview: ops_manager approve -> settled", () => {
  assert.deepEqual(outcomeAfterReview("outbound", "ops_manager", "approve"), {
    state: "settled",
    reviewerRole: null,
  });
});

test("outcomeAfterReview: ops_manager escalate -> reviewing, reassigned to compliance_manager", () => {
  assert.deepEqual(outcomeAfterReview("outbound", "ops_manager", "escalate"), {
    state: "reviewing",
    reviewerRole: "compliance_manager",
  });
});

test("outcomeAfterReview: compliance_manager approve -> settled", () => {
  assert.deepEqual(outcomeAfterReview("outbound", "compliance_manager", "approve"), {
    state: "settled",
    reviewerRole: null,
  });
});

test("outcomeAfterReview: compliance_manager reject -> rejected (outbound) / kick_back (inbound)", () => {
  assert.deepEqual(outcomeAfterReview("outbound", "compliance_manager", "reject"), {
    state: "rejected",
    reviewerRole: null,
  });
  assert.deepEqual(outcomeAfterReview("inbound", "compliance_manager", "reject"), {
    state: "kick_back",
    reviewerRole: null,
  });
});

// --- invalid transitions must be rejected, not silently allowed ---

test("outcomeAfterReview: ops_manager cannot reject (blocking requires compliance authority)", () => {
  assert.throws(() => outcomeAfterReview("outbound", "ops_manager", "reject"));
});

test("outcomeAfterReview: compliance_manager cannot escalate (already the final authority)", () => {
  assert.throws(() => outcomeAfterReview("outbound", "compliance_manager", "escalate"));
});

// --- four-eyes ---

test("four-eyes: reviewer matching the outbound submitter is a violation", () => {
  assert.equal(isFourEyesViolation("outbound", "Alice", "Alice"), true);
});

test("four-eyes: reviewer different from the outbound submitter is not a violation", () => {
  assert.equal(isFourEyesViolation("outbound", "Alice", "Bob"), false);
});

test("four-eyes: never applies to inbound (no human submitter to conflict with)", () => {
  assert.equal(isFourEyesViolation("inbound", null, "Alice"), false);
});
