import { useEffect, useRef, useState } from "react";
import { fetchTransactionDetail, reviewTransaction, type TransactionDetailResponse } from "../api";
import { assignmentLabel } from "../assignment";

interface TransactionDetailProps {
  transactionId: string;
  activeName: string;
  activeRole: string;
  onClose: () => void;
  onActionComplete: () => void;
}

const ACTIONS_FOR_ROLE: Record<string, ("approve" | "escalate" | "reject")[]> = {
  ops_manager: ["approve", "escalate"],
  compliance_manager: ["approve", "reject"],
};

const CHAIN_LABELS: Record<string, string> = {
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  bsc: "BNB Smart Chain",
};

// Each chain has its own block explorer — a link built against etherscan.io
// for an Arbitrum or BSC address would just 404.
const EXPLORER_BASE: Record<string, string> = {
  ethereum: "https://etherscan.io",
  arbitrum: "https://arbiscan.io",
  bsc: "https://bscscan.com",
};

export function TransactionDetail({
  transactionId,
  activeName,
  activeRole,
  onClose,
  onActionComplete,
}: TransactionDetailProps) {
  const [data, setData] = useState<TransactionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
  // Guards against out-of-order responses: if the user switches to a different
  // transaction (or re-triggers a load) before an earlier fetch resolves, that
  // earlier response is discarded instead of overwriting newer data.
  const latestRequestedIdRef = useRef<string | null>(null);

  function load(id: string) {
    latestRequestedIdRef.current = id;
    setError(null);
    fetchTransactionDetail(id)
      .then((result) => {
        if (latestRequestedIdRef.current === id) setData(result);
      })
      .catch((err) => {
        if (latestRequestedIdRef.current === id) {
          setError(String(err instanceof Error ? err.message : err));
        }
      });
  }

  useEffect(() => {
    setData(null);
    load(transactionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);

  async function handleAction(action: "approve" | "escalate" | "reject") {
    setSubmittingAction(action);
    setActionError(null);
    try {
      await reviewTransaction(transactionId, activeName, activeRole, action);
      load(transactionId);
      onActionComplete();
    } catch (err) {
      setActionError(String(err instanceof Error ? err.message : err));
    } finally {
      setSubmittingAction(null);
    }
  }

  if (error) {
    return (
      <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 16, marginTop: 16 }}>
        <p style={{ color: "#cf222e" }}>{error}</p>
        <button onClick={onClose}>Close</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 16, marginTop: 16 }}>
        <p>Loading…</p>
      </div>
    );
  }

  const { transaction, screeningResults, reviewActions, riskFactors } = data;
  const latestScreening = screeningResults[0] ?? null;
  const escalation = reviewActions.find((a) => a.action === "escalate") ?? null;
  const lastAction = reviewActions[reviewActions.length - 1] ?? null;
  // Four-eyes only applies to outbound, which has a human submitter (spec Escalation tiers).
  const isFourEyesViolation = transaction.direction === "outbound" && transaction.submitted_by === activeName;

  // Only present for a genuine on-chain oracle call (mode "live") with the
  // current multi-provider raw shape — a forced/stub result, or a live result
  // screened before the cross-check feature existed, won't have `providers`
  // and should degrade to just showing the raw JSON above, not crash.
  const rawRecord =
    latestScreening?.chainalysis_mode === "live" ? (latestScreening.chainalysis_raw as Record<string, unknown>) : null;
  const liveOracleInfo =
    rawRecord && Array.isArray(rawRecord.providers)
      ? (rawRecord as unknown as {
          oracleContract: string;
          queriedAddress: string;
          consensus: "agreement" | "disagreement" | "insufficient";
          providersQueried: number;
          providersSucceeded: number;
          providers: { origin: string; role: "primary" | "cross-check"; ok: boolean; isSanctioned?: boolean }[];
        })
      : null;

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 16, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Transaction detail</h2>
        <button onClick={onClose}>Close</button>
      </div>

      <table style={{ fontSize: 13, marginBottom: 16 }}>
        <tbody>
          <tr>
            <td style={{ color: "#666", paddingRight: 12 }}>Direction</td>
            <td>{transaction.direction}</td>
          </tr>
          <tr>
            <td style={{ color: "#666", paddingRight: 12 }}>Chain</td>
            <td>{CHAIN_LABELS[transaction.chain] ?? transaction.chain}</td>
          </tr>
          <tr>
            <td style={{ color: "#666", paddingRight: 12 }}>Address</td>
            <td style={{ fontFamily: "monospace" }}>{transaction.address}</td>
          </tr>
          <tr>
            <td style={{ color: "#666", paddingRight: 12 }}>Amount</td>
            <td>
              {transaction.amount} {transaction.asset}
            </td>
          </tr>
          <tr>
            <td style={{ color: "#666", paddingRight: 12 }}>State</td>
            <td style={{ fontWeight: 600 }}>{transaction.state}</td>
          </tr>
          <tr>
            <td style={{ color: "#666", paddingRight: 12 }}>Tier</td>
            <td>{latestScreening?.tier ?? "-"}</td>
          </tr>
          <tr>
            <td style={{ color: "#666", paddingRight: 12 }}>Current assignment</td>
            <td style={{ fontWeight: 600 }}>
              {assignmentLabel({
                state: transaction.state,
                reviewerRole: transaction.reviewer_role,
                escalatedBy: escalation?.actor_name ?? null,
                lastActionActor: lastAction?.actor_name ?? null,
                lastActionRole: lastAction?.reviewer_role ?? null,
                lastAction: lastAction?.action ?? null,
                lastActionAt: lastAction?.created_at ?? null,
              })}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 12, marginBottom: 16, background: "#fafafa" }}>
        <h3 style={{ fontSize: 13, marginTop: 0, marginBottom: 8 }}>Screening evidence</h3>

        <p style={{ fontSize: 12, color: "#666", margin: "0 0 8px" }}>
          {latestScreening
            ? latestScreening.cache_hit
              ? "Cache hit — this result was reused from a screening of this address within the last 24h, not recalculated."
              : "Fresh check — this address was screened just now, not reused from cache."
            : "-"}
        </p>

        <p style={{ fontSize: 13, margin: "0 0 8px" }}>
          Mock provenance score: <strong>{latestScreening?.mock_score ?? "-"}</strong> / 100
        </p>

        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 12, color: "#666", margin: "0 0 4px" }}>
            Simulated factors (mock, not derived from real chain analysis):
          </p>
          {riskFactors.length === 0 ? (
            <p style={{ fontSize: 13, margin: 0 }}>None</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {riskFactors.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p style={{ fontSize: 12, color: "#666", margin: "0 0 4px" }}>
            Chainalysis sanctions check:{" "}
            <strong>{latestScreening ? latestScreening.chainalysis_mode.toUpperCase() : "-"}</strong>
            {latestScreening && ` · ${latestScreening.sanctions_hit ? "HIT" : "no hit"}`}
          </p>
          {latestScreening && (
            <details>
              <summary
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "#0969da",
                  display: "inline-block",
                  padding: "4px 10px",
                  border: "1px solid #b6d4fe",
                  borderRadius: 999,
                  background: "#eff6ff",
                }}
              >
                ▸ View raw response
              </summary>
              <pre
                style={{
                  fontSize: 11,
                  background: "#fff",
                  border: "1px solid #ddd",
                  borderRadius: 4,
                  padding: 8,
                  marginTop: 6,
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(latestScreening.chainalysis_raw, null, 2)}
              </pre>
            </details>
          )}
          {liveOracleInfo && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 12, margin: "0 0 4px" }}>
                Cross-checked against <strong>{liveOracleInfo.providersQueried}</strong> independent RPC
                providers ({liveOracleInfo.providersSucceeded} responded):{" "}
                <strong
                  style={{
                    color:
                      liveOracleInfo.consensus === "agreement"
                        ? "#1a7f37"
                        : liveOracleInfo.consensus === "disagreement"
                          ? "#cf222e"
                          : "#9a6700",
                  }}
                >
                  {liveOracleInfo.consensus === "agreement"
                    ? "all agreed"
                    : liveOracleInfo.consensus === "disagreement"
                      ? "DISAGREED — treated as a hit for safety"
                      : "only one responded — cross-check inconclusive"}
                </strong>
              </p>
              <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 11, color: "#666" }}>
                {liveOracleInfo.providers.map((p) => (
                  <li key={p.origin}>
                    {p.origin} ({p.role}): {p.ok ? (p.isSanctioned ? "sanctioned" : "clean") : "no response"}
                  </li>
                ))}
              </ul>
              <p
                style={{
                  fontSize: 11,
                  color: "#9a6700",
                  background: "#fff8c5",
                  border: "1px solid #d4a72c",
                  borderRadius: 4,
                  padding: "6px 8px",
                  margin: "0 0 8px",
                }}
              >
                ⚠ Even with agreement, this isn't cryptographic proof — a plain RPC response isn't signed, so
                this is a "multiple independent sources agree" check, not a guarantee. This was also a read-only
                call (<code>eth_call</code>), never broadcast or mined, so there's no transaction or block entry
                to look up on any explorer for it.
              </p>
              <p style={{ fontSize: 11, color: "#666", margin: "0 0 8px" }}>
                To reproduce it yourself: open the oracle contract's Read tab below and call{" "}
                <code>isSanctioned</code> with this address. A matching result corroborates this screening; it
                won't necessarily match if the oracle's list has changed since (see the freshness limitation
                noted in spec.md).
              </p>
              <p style={{ fontSize: 12, margin: 0 }}>
                <a
                  href={`${EXPLORER_BASE[transaction.chain] ?? EXPLORER_BASE.ethereum}/address/${liveOracleInfo.oracleContract}#readContract`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Oracle contract on {CHAIN_LABELS[transaction.chain] ?? transaction.chain} (Read tab) ↗
                </a>
                {" · "}
                <a
                  href={`${EXPLORER_BASE[transaction.chain] ?? EXPLORER_BASE.ethereum}/address/${liveOracleInfo.queriedAddress}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Queried address ↗
                </a>
              </p>
            </div>
          )}
        </div>
      </div>

      {transaction.state === "reviewing" && transaction.reviewer_role === activeRole && (
        <div style={{ marginBottom: 16 }}>
          {(ACTIONS_FOR_ROLE[activeRole] ?? []).map((action) => (
            <button
              key={action}
              disabled={Boolean(submittingAction) || isFourEyesViolation}
              onClick={() => handleAction(action)}
              style={{ marginRight: 8, textTransform: "capitalize" }}
            >
              {action}
            </button>
          ))}
          {isFourEyesViolation && (
            <p style={{ color: "#9a6700", fontSize: 12, margin: "6px 0 0" }}>
              You can't review a transaction you submitted — {activeName} submitted this transaction (four-eyes
              rule).
            </p>
          )}
          {submittingAction && <span style={{ fontSize: 12, color: "#666" }}>Submitting…</span>}
          {actionError && <p style={{ color: "#cf222e", fontSize: 12 }}>{actionError}</p>}
        </div>
      )}

      <h3 style={{ fontSize: 14 }}>Review history</h3>
      {reviewActions.length === 0 ? (
        <p style={{ color: "#666", fontSize: 13 }}>No review actions yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: "6px 8px" }}>Actor</th>
              <th style={{ padding: "6px 8px" }}>Role at time</th>
              <th style={{ padding: "6px 8px" }}>Action</th>
              <th style={{ padding: "6px 8px" }}>When</th>
            </tr>
          </thead>
          <tbody>
            {reviewActions.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "6px 8px" }}>{a.actor_name}</td>
                <td style={{ padding: "6px 8px" }}>{a.reviewer_role}</td>
                <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{a.action}</td>
                <td style={{ padding: "6px 8px" }}>{new Date(a.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
