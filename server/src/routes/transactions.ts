import { Router } from "express";
import { pool } from "../db.js";
import { applyReviewAction } from "../transactions.js";
import { mockRiskFactors } from "../scoring.js";

export const transactionsRouter = Router();

transactionsRouter.get("/", async (_req, res) => {
  const result = await pool.query(`
    SELECT
      t.id, t.direction, t.address, t.staging_address, t.asset, t.chain,
      t.state, t.reviewer_role, t.submitted_by, t.created_at, t.updated_at,
      sr.tier, sr.sanctions_hit, sr.mock_score, sr.chainalysis_mode, sr.cache_hit,
      esc.actor_name AS escalated_by,
      last_action.actor_name AS last_action_actor,
      last_action.reviewer_role AS last_action_role,
      last_action.action AS last_action,
      last_action.created_at AS last_action_at
    FROM transactions t
    LEFT JOIN LATERAL (
      SELECT tier, sanctions_hit, mock_score, chainalysis_mode, cache_hit
      FROM screening_results sr
      WHERE sr.transaction_id = t.id
      ORDER BY sr.created_at DESC
      LIMIT 1
    ) sr ON true
    LEFT JOIN LATERAL (
      -- A transaction can only be escalated once (escalate is only valid from
      -- ops_manager, and it always moves to compliance_manager), so there's at
      -- most one row here.
      SELECT actor_name
      FROM review_actions ra
      WHERE ra.transaction_id = t.id AND ra.action = 'escalate'
      LIMIT 1
    ) esc ON true
    LEFT JOIN LATERAL (
      -- Whoever made the most recent call — for a terminal state (settled via
      -- review, rejected, kick_back) this is the final decision and decider.
      SELECT actor_name, reviewer_role, action, created_at
      FROM review_actions ra
      WHERE ra.transaction_id = t.id
      ORDER BY ra.created_at DESC
      LIMIT 1
    ) last_action ON true
    ORDER BY t.created_at DESC
  `);
  res.json(result.rows);
});

transactionsRouter.get("/:id", async (req, res) => {
  const txRes = await pool.query(`SELECT * FROM transactions WHERE id = $1`, [req.params.id]);
  if (!txRes.rowCount) {
    return res.status(404).json({ error: "Transaction not found" });
  }
  const screeningRes = await pool.query(
    `SELECT * FROM screening_results WHERE transaction_id = $1 ORDER BY created_at DESC`,
    [req.params.id],
  );
  const reviewRes = await pool.query(
    `SELECT * FROM review_actions WHERE transaction_id = $1 ORDER BY created_at ASC`,
    [req.params.id],
  );
  res.json({
    transaction: txRes.rows[0],
    screeningResults: screeningRes.rows,
    reviewActions: reviewRes.rows,
    riskFactors: mockRiskFactors(txRes.rows[0].address),
  });
});

transactionsRouter.post("/:id/review", async (req, res) => {
  try {
    const { actorName, role, action } = req.body ?? {};
    if (!actorName || !role || !action) {
      return res.status(400).json({ error: "actorName, role, and action are required" });
    }
    await applyReviewAction(req.params.id, actorName, role, action);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
  }
});
