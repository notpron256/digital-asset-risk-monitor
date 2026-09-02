import { randomBytes } from "node:crypto";
import { pool } from "./db.js";
import { screenAddress } from "./screening.js";
import { initialState, outcomeAfterScreening, outcomeAfterReview, isFourEyesViolation } from "./stateMachine.js";
import type { Direction, ReviewAction, ReviewerRole, Tier } from "./stateMachine.js";
import { CHAIN_KEYS, isChainKey, type ChainKey } from "./chains.js";

function randomAddress(): string {
  return "0x" + randomBytes(20).toString("hex");
}

const ASSET_FOR_CHAIN: Record<ChainKey, string> = {
  ethereum: "ETH",
  arbitrum: "ETH",
  bsc: "BNB",
};

export interface SimulateOptions {
  forceTier?: Tier;
  forceSanctionsHit?: boolean;
  address?: string;
  chain?: string;
}

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;

function resolveChain(input: string | undefined): ChainKey {
  if (!input) return "ethereum";
  if (!isChainKey(input)) {
    throw new Error(`Invalid chain: '${input}'. Expected one of: ${CHAIN_KEYS.join(", ")}.`);
  }
  return input;
}

// Lets a demo run screen a specific address twice in a row (e.g. to show the
// score/tier/factors are identical, or to exercise the cache) instead of only
// getting a fresh random one each time. Validated so a malformed paste (e.g.
// two addresses run together) fails loudly instead of silently becoming a new
// cache key that looks like an unrelated "fresh" screen.
function resolveAddress(override: string | undefined): string {
  const trimmed = override?.trim().toLowerCase();
  if (!trimmed) return randomAddress();
  if (!ADDRESS_PATTERN.test(trimmed)) {
    throw new Error(`Invalid address: '${override}'. Expected 0x followed by 40 hex characters.`);
  }
  return trimmed;
}

async function insertScreeningResult(
  transactionId: string,
  chain: ChainKey,
  screening: Awaited<ReturnType<typeof screenAddress>>,
) {
  await pool.query(
    `INSERT INTO screening_results
       (transaction_id, chain, chainalysis_raw, chainalysis_mode, sanctions_hit, mock_score, tier, cache_hit, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      transactionId,
      chain,
      screening.chainalysisRaw,
      screening.chainalysisMode,
      screening.sanctionsHit,
      screening.mockScoreValue,
      screening.tier,
      screening.cacheHit,
      screening.requestId,
    ],
  );
}

export async function submitOutbound(submittedBy: string, opts: SimulateOptions = {}): Promise<string> {
  const address = resolveAddress(opts.address);
  const chain = resolveChain(opts.chain);

  const inserted = await pool.query(
    `INSERT INTO transactions (direction, address, asset, state, submitted_by, chain)
     VALUES ('outbound', $1, $2, $3, $4, $5)
     RETURNING id`,
    [address, ASSET_FOR_CHAIN[chain], initialState("outbound"), submittedBy, chain],
  );
  const transactionId: string = inserted.rows[0].id;

  const screening = await screenAddress(address, chain, opts);
  await insertScreeningResult(transactionId, chain, screening);

  const outcome = outcomeAfterScreening(screening.tier);
  await pool.query(`UPDATE transactions SET state = $1, reviewer_role = $2, updated_at = now() WHERE id = $3`, [
    outcome.state,
    outcome.reviewerRole,
    transactionId,
  ]);

  return transactionId;
}

export async function receiveInbound(opts: SimulateOptions = {}): Promise<string> {
  const sourceAddress = resolveAddress(opts.address);
  const stagingAddress = randomAddress();
  const chain = resolveChain(opts.chain);

  const inserted = await pool.query(
    `INSERT INTO transactions (direction, address, staging_address, asset, state, chain)
     VALUES ('inbound', $1, $2, $3, $4, $5)
     RETURNING id`,
    [sourceAddress, stagingAddress, ASSET_FOR_CHAIN[chain], initialState("inbound"), chain],
  );
  const transactionId: string = inserted.rows[0].id;

  // Inbound screens the source/sending address, not the staging address (spec Risk scoring).
  const screening = await screenAddress(sourceAddress, chain, opts);
  await insertScreeningResult(transactionId, chain, screening);

  const outcome = outcomeAfterScreening(screening.tier);
  await pool.query(`UPDATE transactions SET state = $1, reviewer_role = $2, updated_at = now() WHERE id = $3`, [
    outcome.state,
    outcome.reviewerRole,
    transactionId,
  ]);

  return transactionId;
}

export async function applyReviewAction(
  transactionId: string,
  actorName: string,
  claimedRole: ReviewerRole,
  action: ReviewAction,
): Promise<void> {
  const txRes = await pool.query(
    `SELECT direction, state, reviewer_role, submitted_by FROM transactions WHERE id = $1`,
    [transactionId],
  );
  if (!txRes.rowCount) {
    throw new Error("Transaction not found");
  }
  const tx = txRes.rows[0] as {
    direction: Direction;
    state: string;
    reviewer_role: ReviewerRole | null;
    submitted_by: string | null;
  };

  if (tx.state !== "reviewing" || !tx.reviewer_role) {
    throw new Error(`Transaction is not awaiting review (current state: ${tx.state})`);
  }
  if (tx.reviewer_role !== claimedRole) {
    throw new Error(`Transaction is assigned to '${tx.reviewer_role}', not '${claimedRole}'`);
  }
  if (isFourEyesViolation(tx.direction, tx.submitted_by, actorName)) {
    throw new Error("Reviewer cannot be the same person who submitted the transaction");
  }

  const outcome = outcomeAfterReview(tx.direction, tx.reviewer_role, action);

  await pool.query(`UPDATE transactions SET state = $1, reviewer_role = $2, updated_at = now() WHERE id = $3`, [
    outcome.state,
    outcome.reviewerRole,
    transactionId,
  ]);

  await pool.query(
    `INSERT INTO review_actions (transaction_id, actor_name, reviewer_role, action)
     VALUES ($1, $2, $3, $4)`,
    [transactionId, actorName, tx.reviewer_role, action],
  );
}
