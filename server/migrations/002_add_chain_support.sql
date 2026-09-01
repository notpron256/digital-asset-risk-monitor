-- Adds chain support (Ethereum, Arbitrum, BNB Smart Chain). address_cache is
-- scoped per (address, chain), not just address, since the same address can
-- have different history/risk on different chains.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS chain TEXT NOT NULL DEFAULT 'ethereum';
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_chain_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_chain_check CHECK (chain IN ('ethereum', 'arbitrum', 'bsc'));

ALTER TABLE screening_results ADD COLUMN IF NOT EXISTS chain TEXT NOT NULL DEFAULT 'ethereum';
ALTER TABLE screening_results DROP CONSTRAINT IF EXISTS screening_results_chain_check;
ALTER TABLE screening_results ADD CONSTRAINT screening_results_chain_check CHECK (chain IN ('ethereum', 'arbitrum', 'bsc'));

ALTER TABLE address_cache ADD COLUMN IF NOT EXISTS chain TEXT NOT NULL DEFAULT 'ethereum';
ALTER TABLE address_cache DROP CONSTRAINT IF EXISTS address_cache_chain_check;
ALTER TABLE address_cache ADD CONSTRAINT address_cache_chain_check CHECK (chain IN ('ethereum', 'arbitrum', 'bsc'));

ALTER TABLE address_cache DROP CONSTRAINT IF EXISTS address_cache_pkey;
ALTER TABLE address_cache ADD PRIMARY KEY (address, chain);
