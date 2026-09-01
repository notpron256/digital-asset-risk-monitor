const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface Roster {
  names: string[];
  roles: string[];
}

export async function fetchRoster(): Promise<Roster> {
  const res = await fetch(`${BASE_URL}/api/roster`);
  if (!res.ok) throw new Error(`Failed to load roster: ${res.status}`);
  return res.json();
}

export interface ChainOption {
  key: string;
  label: string;
}

export async function fetchChains(): Promise<ChainOption[]> {
  const res = await fetch(`${BASE_URL}/api/chains`);
  if (!res.ok) throw new Error(`Failed to load chains: ${res.status}`);
  const data = await res.json();
  return data.chains;
}

export interface TransactionSummary {
  id: string;
  direction: "outbound" | "inbound";
  address: string;
  staging_address: string | null;
  amount: string;
  asset: string;
  chain: string;
  state: string;
  reviewer_role: "ops_manager" | "compliance_manager" | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
  tier: "low" | "medium" | "high" | null;
  sanctions_hit: boolean | null;
  mock_score: number | null;
  chainalysis_mode: "live" | "stub" | null;
  cache_hit: boolean | null;
  escalated_by: string | null;
  last_action_actor: string | null;
  last_action_role: "ops_manager" | "compliance_manager" | null;
  last_action: "approve" | "escalate" | "reject" | null;
  last_action_at: string | null;
}

export async function fetchTransactions(): Promise<TransactionSummary[]> {
  const res = await fetch(`${BASE_URL}/api/transactions`);
  if (!res.ok) throw new Error(`Failed to load transactions: ${res.status}`);
  return res.json();
}

export interface TransactionRow {
  id: string;
  direction: "outbound" | "inbound";
  address: string;
  staging_address: string | null;
  amount: string;
  asset: string;
  chain: string;
  state: string;
  reviewer_role: "ops_manager" | "compliance_manager" | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScreeningResultRow {
  id: string;
  chain: string;
  chainalysis_raw: unknown;
  chainalysis_mode: "live" | "stub";
  sanctions_hit: boolean;
  mock_score: number;
  tier: "low" | "medium" | "high";
  cache_hit: boolean;
  request_id: string;
  created_at: string;
}

export interface ReviewActionRow {
  id: string;
  actor_name: string;
  reviewer_role: "ops_manager" | "compliance_manager";
  action: "approve" | "escalate" | "reject";
  created_at: string;
}

export interface TransactionDetailResponse {
  transaction: TransactionRow;
  screeningResults: ScreeningResultRow[];
  reviewActions: ReviewActionRow[];
  riskFactors: string[];
}

export async function fetchTransactionDetail(id: string): Promise<TransactionDetailResponse> {
  const res = await fetch(`${BASE_URL}/api/transactions/${id}`);
  if (!res.ok) throw new Error(`Failed to load transaction: ${res.status}`);
  return res.json();
}

export interface SimulateParams {
  forceTier?: "low" | "medium" | "high" | "";
  forceSanctionsHit?: boolean;
  address?: string;
  amount?: string;
  chain?: string;
}

export interface CreateResult {
  id: string;
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data;
}

export function simulateOutbound(submittedBy: string, params: SimulateParams): Promise<CreateResult> {
  return post("/api/mock/outbound", { submittedBy, ...params });
}

export function simulateInbound(params: SimulateParams): Promise<CreateResult> {
  return post("/api/mock/inbound", params);
}

export function reviewTransaction(
  id: string,
  actorName: string,
  role: string,
  action: "approve" | "escalate" | "reject",
) {
  return post(`/api/transactions/${id}/review`, { actorName, role, action });
}
