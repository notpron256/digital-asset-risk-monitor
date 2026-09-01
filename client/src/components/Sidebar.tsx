import { useEffect, useState } from "react";
import { fetchRoster } from "../api";

const ROLE_LABELS: Record<string, string> = {
  ops: "Ops",
  ops_manager: "Ops Manager",
  compliance_manager: "Compliance Manager",
};

interface SidebarProps {
  activeName: string;
  activeRole: string;
  onChangeName: (name: string) => void;
  onChangeRole: (role: string) => void;
}

export function Sidebar({ activeName, activeRole, onChangeName, onChangeRole }: SidebarProps) {
  const [names, setNames] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoster()
      .then((roster) => {
        setNames(roster.names);
        setRoles(roster.roles);
      })
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <aside style={{ width: 220, padding: 16, borderRight: "1px solid #ddd" }}>
      <h2 style={{ fontSize: 16 }}>Acting as</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <label style={{ display: "block", marginTop: 12, fontSize: 12, color: "#555" }}>Name</label>
      <select value={activeName} onChange={(e) => onChangeName(e.target.value)} style={{ width: "100%" }}>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <label style={{ display: "block", marginTop: 12, fontSize: 12, color: "#555" }}>Role</label>
      <select value={activeRole} onChange={(e) => onChangeRole(e.target.value)} style={{ width: "100%" }}>
        {roles.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role] ?? role}
          </option>
        ))}
      </select>
    </aside>
  );
}
