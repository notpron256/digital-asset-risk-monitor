import type { TransactionSummary } from "../api";
import { assignmentLabel } from "../assignment";

interface DashboardProps {
  transactions: TransactionSummary[];
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
}

const CHAIN_LABELS: Record<string, string> = {
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  bsc: "BNB Chain",
};

const STATE_COLORS: Record<string, string> = {
  settled: "#1a7f37",
  reviewing: "#9a6700",
  rejected: "#cf222e",
  kick_back: "#cf222e",
  screening: "#57606a",
  submitted: "#57606a",
  received: "#57606a",
};

function sanctionsLabel(tx: TransactionSummary): string {
  if (!tx.chainalysis_mode) return "-";
  const mode = tx.chainalysis_mode.toUpperCase();
  const hit = tx.sanctions_hit ? "HIT" : "no hit";
  const cache = tx.cache_hit ? "cache" : "fresh";
  return `${mode} · ${hit} · ${cache}`;
}

export function Dashboard({ transactions, loading, error, onSelect }: DashboardProps) {
  return (
    <div>
      <h1 style={{ fontSize: 20 }}>Transactions</h1>
      {error && <p style={{ color: "#cf222e" }}>{error}</p>}
      {loading && <p>Loading…</p>}
      {!loading && transactions.length === 0 && <p style={{ color: "#666" }}>No transactions yet.</p>}
      {transactions.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: "6px 8px" }}>ID</th>
              <th style={{ padding: "6px 8px" }}>Direction</th>
              <th style={{ padding: "6px 8px" }}>Chain</th>
              <th style={{ padding: "6px 8px" }}>Address</th>
              <th style={{ padding: "6px 8px" }}>Tier</th>
              <th style={{ padding: "6px 8px" }}>Sanctions</th>
              <th style={{ padding: "6px 8px" }}>State</th>
              <th style={{ padding: "6px 8px" }}>Reviewer</th>
              <th style={{ padding: "6px 8px" }}>Submitted by</th>
              <th style={{ padding: "6px 8px" }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr
                key={tx.id}
                onClick={() => onSelect(tx.id)}
                style={{ borderBottom: "1px solid #eee", cursor: "pointer" }}
              >
                <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 12 }} title={tx.id}>
                  {tx.id.slice(0, 8)}…
                </td>
                <td style={{ padding: "6px 8px" }}>{tx.direction}</td>
                <td style={{ padding: "6px 8px" }}>{CHAIN_LABELS[tx.chain] ?? tx.chain}</td>
                <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 12 }}>
                  {tx.address.slice(0, 10)}…
                </td>
                <td style={{ padding: "6px 8px" }}>{tx.tier ?? "-"}</td>
                <td style={{ padding: "6px 8px" }}>{sanctionsLabel(tx)}</td>
                <td style={{ padding: "6px 8px", color: STATE_COLORS[tx.state] ?? "#000", fontWeight: 600 }}>
                  {tx.state}
                </td>
                <td style={{ padding: "6px 8px" }}>
                  {assignmentLabel({
                    state: tx.state,
                    reviewerRole: tx.reviewer_role,
                    escalatedBy: tx.escalated_by,
                    lastActionActor: tx.last_action_actor,
                    lastActionRole: tx.last_action_role,
                    lastAction: tx.last_action,
                    lastActionAt: tx.last_action_at,
                  })}
                </td>
                <td style={{ padding: "6px 8px" }}>{tx.submitted_by ?? "-"}</td>
                <td style={{ padding: "6px 8px" }}>{new Date(tx.created_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
