export interface AssignmentInfo {
  state: string;
  reviewerRole: string | null;
  escalatedBy: string | null;
  lastActionActor: string | null;
  lastActionRole: string | null;
  lastAction: "approve" | "escalate" | "reject" | null;
  lastActionAt: string | null;
}

function roleLabel(role: string): string {
  return role === "ops_manager" ? "Ops Manager" : "Compliance Manager";
}

// A transaction with reviewer_role "compliance_manager" can arrive there two
// ways: direct routing (High tier or a sanctions hit) or escalation from an
// ops manager (Medium tier). Both leave the same reviewer_role — this makes
// the distinction visible without changing the state machine.
//
// Once a transaction leaves `reviewing` (settled/rejected/kick_back),
// reviewer_role goes back to null — so the final decision is read from the
// most recent review_actions row instead, which is where the audit trail
// already records who decided and when.
export function assignmentLabel(info: AssignmentInfo): string {
  if (info.reviewerRole) {
    if (info.reviewerRole === "ops_manager") return "With Ops Manager";
    if (info.escalatedBy) return `With Compliance Manager (escalated by ${info.escalatedBy}, Ops Manager)`;
    return "With Compliance Manager (High risk)";
  }

  if (info.lastActionActor && info.lastAction && info.lastActionRole) {
    const verb = info.lastAction === "approve" ? "Approved" : info.lastAction === "reject" ? "Rejected" : "Escalated";
    const time = info.lastActionAt ? ` · ${new Date(info.lastActionAt).toLocaleTimeString()}` : "";
    return `${verb} by ${info.lastActionActor} (${roleLabel(info.lastActionRole)})${time}`;
  }

  if (info.state === "settled") return "Auto-cleared (Low risk)";
  return "-";
}
