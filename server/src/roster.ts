export const ROSTER_NAMES = ["Alice", "Bob", "Carol", "Dave"] as const;
export const ROSTER_ROLES = ["ops", "ops_manager", "compliance_manager"] as const;

export type RosterName = (typeof ROSTER_NAMES)[number];
export type RosterRole = (typeof ROSTER_ROLES)[number];
