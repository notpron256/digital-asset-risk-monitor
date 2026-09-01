CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  address TEXT NOT NULL,
  staging_address TEXT,
  amount NUMERIC NOT NULL,
  asset TEXT NOT NULL DEFAULT 'ETH',
  state TEXT NOT NULL,
  reviewer_role TEXT CHECK (reviewer_role IN ('ops_manager', 'compliance_manager')),
  submitted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS screening_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  chainalysis_raw JSONB,
  chainalysis_mode TEXT NOT NULL CHECK (chainalysis_mode IN ('live', 'stub')),
  sanctions_hit BOOLEAN NOT NULL,
  mock_score INTEGER NOT NULL CHECK (mock_score BETWEEN 0 AND 100),
  tier TEXT NOT NULL CHECK (tier IN ('low', 'medium', 'high')),
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  request_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  actor_name TEXT NOT NULL,
  reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('ops_manager', 'compliance_manager')),
  action TEXT NOT NULL CHECK (action IN ('approve', 'escalate', 'reject')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS address_cache (
  address TEXT PRIMARY KEY,
  sanctions_hit BOOLEAN NOT NULL,
  mock_score INTEGER NOT NULL,
  chainalysis_raw JSONB,
  chainalysis_mode TEXT NOT NULL CHECK (chainalysis_mode IN ('live', 'stub')),
  expires_at TIMESTAMPTZ NOT NULL
);
