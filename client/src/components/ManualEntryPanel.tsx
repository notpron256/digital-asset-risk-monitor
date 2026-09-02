import { useState } from "react";
import { simulateOutbound, simulateInbound } from "../api";
import { useChains } from "../useChains";

interface ManualEntryPanelProps {
  activeName: string;
  onScreened: (transactionId: string) => void;
}

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

export function ManualEntryPanel({ activeName, onScreened }: ManualEntryPanelProps) {
  const chains = useChains();
  const [chain, setChain] = useState("ethereum");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedAddress = address.trim();
  const addressError =
    trimmedAddress && !ADDRESS_PATTERN.test(trimmedAddress)
      ? "Not a valid address: expected 0x followed by exactly 40 hex characters."
      : null;
  const canSubmit = Boolean(trimmedAddress) && !addressError && !busy;

  async function handle(direction: "outbound" | "inbound") {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const params = { address: trimmedAddress, chain };
      const result =
        direction === "outbound" ? await simulateOutbound(activeName, params) : await simulateInbound(params);
      setAddress("");
      onScreened(result.id);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: "1px solid #d4a72c", borderRadius: 6, padding: 12, marginBottom: 16, background: "#fffbea" }}>
      <h2 style={{ fontSize: 14, marginTop: 0 }}>Screen a real transaction</h2>
      <p style={{ fontSize: 12, color: "#666", margin: "0 0 8px" }}>
        Enter a real address you're considering sending to (or a deposit you've observed) to get an actual
        screening decision before acting in MetaMask yourself. This tool never connects to a wallet, signs, or
        broadcasts anything — you read the result here and act on it manually.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <label style={{ fontSize: 12 }}>
          Chain:{" "}
          <select value={chain} onChange={(e) => setChain(e.target.value)}>
            {chains.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          Address:{" "}
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            style={{
              width: 340,
              fontFamily: "monospace",
              fontSize: 12,
              borderColor: addressError ? "#cf222e" : undefined,
            }}
          />
        </label>
      </div>

      {addressError && <p style={{ color: "#cf222e", fontSize: 12, margin: "0 0 4px" }}>{addressError}</p>}

      <div>
        <button disabled={!canSubmit} onClick={() => handle("outbound")}>
          Screen Outbound
        </button>
        <button disabled={!canSubmit} onClick={() => handle("inbound")} style={{ marginLeft: 8 }}>
          Screen Inbound
        </button>
        {busy && <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>Screening…</span>}
      </div>

      {error && <p style={{ color: "#cf222e", fontSize: 12, marginTop: 8 }}>{error}</p>}
    </div>
  );
}
