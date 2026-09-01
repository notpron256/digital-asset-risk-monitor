import { useState } from "react";
import { simulateOutbound, simulateInbound, type SimulateParams } from "../api";
import { useChains } from "../useChains";

interface SimulatePanelProps {
  activeName: string;
  onSimulated: () => void;
}

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

export function SimulatePanel({ activeName, onSimulated }: SimulatePanelProps) {
  const chains = useChains();
  const [chain, setChain] = useState("ethereum");
  const [forceTier, setForceTier] = useState<SimulateParams["forceTier"]>("");
  const [forceSanctionsHit, setForceSanctionsHit] = useState(false);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedAddress = address.trim();
  const addressError =
    trimmedAddress && !ADDRESS_PATTERN.test(trimmedAddress)
      ? "Not a valid address: expected 0x followed by exactly 40 hex characters (got " +
        trimmedAddress.length +
        " characters after trimming). Check for an accidental double-paste."
      : null;

  async function handle(direction: "outbound" | "inbound") {
    if (addressError) return;
    setBusy(true);
    setError(null);
    try {
      const params: SimulateParams = {
        forceTier: forceTier || undefined,
        forceSanctionsHit: forceSanctionsHit || undefined,
        address: trimmedAddress || undefined,
        chain,
      };
      if (direction === "outbound") {
        await simulateOutbound(activeName, params);
      } else {
        await simulateInbound(params);
      }
      onSimulated();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12, marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, marginTop: 0 }}>Simulate</h2>

      <label style={{ fontSize: 12, marginRight: 16 }}>
        Chain:{" "}
        <select value={chain} onChange={(e) => setChain(e.target.value)}>
          {chains.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label style={{ fontSize: 12, marginRight: 16 }}>
        Force tier:{" "}
        <select
          value={forceTier}
          onChange={(e) => setForceTier(e.target.value as SimulateParams["forceTier"])}
        >
          <option value="">Auto</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>

      <label style={{ fontSize: 12, marginRight: 16 }}>
        <input
          type="checkbox"
          checked={forceSanctionsHit}
          onChange={(e) => setForceSanctionsHit(e.target.checked)}
        />{" "}
        Force sanctions hit
      </label>

      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 12 }}>
          Address (optional — leave blank for a random one; type/paste the same address twice to test
          determinism and caching):{" "}
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
        {addressError && <p style={{ color: "#cf222e", fontSize: 12, margin: "4px 0 0" }}>{addressError}</p>}
      </div>

      <div style={{ marginTop: 10 }}>
        <button disabled={busy || Boolean(addressError)} onClick={() => handle("outbound")}>
          Simulate Outbound
        </button>
        <button disabled={busy || Boolean(addressError)} onClick={() => handle("inbound")} style={{ marginLeft: 8 }}>
          Simulate Inbound
        </button>
        {busy && <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>Screening…</span>}
      </div>

      {error && <p style={{ color: "#cf222e", fontSize: 12 }}>{error}</p>}
    </div>
  );
}
