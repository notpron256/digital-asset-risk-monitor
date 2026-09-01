import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { SimulatePanel } from "./components/SimulatePanel";
import { ManualEntryPanel } from "./components/ManualEntryPanel";
import { TransactionDetail } from "./components/TransactionDetail";
import { fetchTransactions, type TransactionSummary } from "./api";

function App() {
  const [activeName, setActiveName] = useState("Alice");
  const [activeRole, setActiveRole] = useState("ops");
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchTransactions()
      .then(setTransactions)
      .catch((err) => setError(String(err instanceof Error ? err.message : err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleScreened(transactionId: string) {
    refresh();
    setSelectedId(transactionId);
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <Sidebar
        activeName={activeName}
        activeRole={activeRole}
        onChangeName={setActiveName}
        onChangeRole={setActiveRole}
      />
      <div style={{ flex: 1, padding: 24 }}>
        <SimulatePanel activeName={activeName} onSimulated={refresh} />
        <ManualEntryPanel activeName={activeName} onScreened={handleScreened} />
        <Dashboard transactions={transactions} loading={loading} error={error} onSelect={setSelectedId} />
        {selectedId && (
          <TransactionDetail
            transactionId={selectedId}
            activeName={activeName}
            activeRole={activeRole}
            onClose={() => setSelectedId(null)}
            onActionComplete={refresh}
          />
        )}
      </div>
    </div>
  );
}

export default App;
