import { randomUUID } from "node:crypto";
import { pool } from "./db.js";
import { mockScore, tierForScore } from "./scoring.js";
import { checkAddress } from "./chainalysisClient.js";
import type { Tier } from "./stateMachine.js";
import type { ChainKey } from "./chains.js";

export interface ScreeningResult {
  tier: Tier;
  sanctionsHit: boolean;
  mockScoreValue: number;
  chainalysisMode: "live" | "stub";
  chainalysisRaw: unknown;
  cacheHit: boolean;
  requestId: string;
}

export interface ScreenOptions {
  forceTier?: Tier;
  forceSanctionsHit?: boolean;
}

// Single shared screening path for both outbound and inbound (spec Technical
// approach: "a single shared module ... so the two flows cannot drift").
//
// Cached per (address, chain) — the same address can have different history/
// risk on different chains, so a screen on one chain must never reuse a
// cached result from another.
//
// The cache is checked regardless of forceTier/forceSanctionsHit: forcing only
// controls what gets computed on a cache MISS (i.e. the first time an address
// is screened on this chain, or after its 24h entry expires). A repeat screen
// of the same address+chain — forced or not — reuses that entry, so "same
// address twice" reliably demonstrates a cache hit instead of silently
// bypassing the cache whenever a force option happens to be set.
export async function screenAddress(address: string, chain: ChainKey, opts: ScreenOptions = {}): Promise<ScreeningResult> {
  const requestId = randomUUID();

  const cached = await pool.query(
    `SELECT sanctions_hit, mock_score, chainalysis_raw, chainalysis_mode
     FROM address_cache WHERE address = $1 AND chain = $2 AND expires_at > now()`,
    [address, chain],
  );
  if (cached.rowCount) {
    const row = cached.rows[0];
    const tier: Tier = row.sanctions_hit ? "high" : tierForScore(row.mock_score);
    return {
      tier,
      sanctionsHit: row.sanctions_hit,
      mockScoreValue: row.mock_score,
      chainalysisMode: row.chainalysis_mode,
      chainalysisRaw: row.chainalysis_raw,
      cacheHit: true,
      requestId,
    };
  }

  const score = mockScore(address, opts.forceTier);
  const chainalysisResult = await checkAddress(address, chain, opts.forceSanctionsHit);
  // Sanctions hit overrides tier to High regardless of the mock score (spec Risk scoring).
  const tier: Tier = chainalysisResult.sanctionsHit ? "high" : tierForScore(score);

  await pool.query(
    `INSERT INTO address_cache (address, chain, sanctions_hit, mock_score, chainalysis_raw, chainalysis_mode, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + interval '24 hours')
     ON CONFLICT (address, chain) DO UPDATE SET
       sanctions_hit = EXCLUDED.sanctions_hit,
       mock_score = EXCLUDED.mock_score,
       chainalysis_raw = EXCLUDED.chainalysis_raw,
       chainalysis_mode = EXCLUDED.chainalysis_mode,
       expires_at = EXCLUDED.expires_at`,
    [address, chain, chainalysisResult.sanctionsHit, score, chainalysisResult.raw, chainalysisResult.mode],
  );

  return {
    tier,
    sanctionsHit: chainalysisResult.sanctionsHit,
    mockScoreValue: score,
    chainalysisMode: chainalysisResult.mode,
    chainalysisRaw: chainalysisResult.raw,
    cacheHit: false,
    requestId,
  };
}
