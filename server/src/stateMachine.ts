export type Direction = "outbound" | "inbound";
export type Tier = "low" | "medium" | "high";
export type ReviewerRole = "ops_manager" | "compliance_manager";
export type ReviewAction = "approve" | "escalate" | "reject";

export interface Outcome {
  state: string;
  reviewerRole: ReviewerRole | null;
}

export function initialState(direction: Direction): string {
  return direction === "outbound" ? "submitted" : "received";
}

// Low tier auto-clears; broadcasting is instantaneous for this POC (see spec Technical approach).
export function outcomeAfterScreening(tier: Tier): Outcome {
  if (tier === "low") {
    return { state: "settled", reviewerRole: null };
  }
  return { state: "reviewing", reviewerRole: tier === "medium" ? "ops_manager" : "compliance_manager" };
}

// Ops managers can approve or escalate; only a compliance manager can reject (spec Escalation tiers).
export function allowedActionsForRole(role: ReviewerRole): ReviewAction[] {
  return role === "ops_manager" ? ["approve", "escalate"] : ["approve", "reject"];
}

export function outcomeAfterReview(direction: Direction, role: ReviewerRole, action: ReviewAction): Outcome {
  if (!allowedActionsForRole(role).includes(action)) {
    throw new Error(`Action '${action}' is not allowed for role '${role}'`);
  }
  if (action === "approve") {
    return { state: "settled", reviewerRole: null };
  }
  if (action === "escalate") {
    return { state: "reviewing", reviewerRole: "compliance_manager" };
  }
  return { state: direction === "outbound" ? "rejected" : "kick_back", reviewerRole: null };
}

// Four-eyes only applies to outbound, which has a human submitter — inbound
// deposits are system-detected, so there's no one to conflict with (spec
// Escalation tiers).
export function isFourEyesViolation(direction: Direction, submittedBy: string | null, actorName: string): boolean {
  return direction === "outbound" && submittedBy === actorName;
}
