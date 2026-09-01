import { createHash } from "node:crypto";
import type { Tier } from "./stateMachine.js";

// Representative scores used when a demo run forces a tier rather than letting
// the address hash determine it.
const TIER_REPRESENTATIVE_SCORE: Record<Tier, number> = {
  low: 20,
  medium: 50,
  high: 85,
};

export function tierForScore(score: number): Tier {
  if (score <= 35) return "low";
  if (score <= 65) return "medium";
  return "high";
}

// Deterministic: the same address always produces the same score, so repeat
// screens (and the address cache) behave predictably.
export function mockScore(address: string, forceTier?: Tier): number {
  if (forceTier) return TIER_REPRESENTATIVE_SCORE[forceTier];
  const hash = createHash("sha256").update(address.toLowerCase()).digest();
  return hash[0] % 101;
}

// Purely cosmetic, simulated evidence to give a reviewer something to look at
// alongside the score — not derived from any real chain analysis. Deterministic
// per address (independent hash domain from mockScore) so the same address
// always shows the same factors.
const RISK_FACTOR_POOL = [
  "elevated hop-distance from a flagged address",
  "recent mixer-adjacent activity",
  "cluster overlap with a known high-risk exchange",
  "irregular transaction timing pattern",
  "low wallet age relative to transaction volume",
  "prior exposure to a darknet-market-linked cluster",
  "counterparty concentration with unhosted wallets",
  "rapid fan-out to multiple new addresses",
] as const;

export function mockRiskFactors(address: string): string[] {
  const hash = createHash("sha256").update(`${address.toLowerCase()}:factors`).digest();
  const count = 2 + (hash[0] % 3); // 2-4
  const indices = new Set<number>();
  for (let i = 1; indices.size < count && i < hash.length; i++) {
    indices.add(hash[i] % RISK_FACTOR_POOL.length);
  }
  return Array.from(indices).map((idx) => RISK_FACTOR_POOL[idx]);
}
