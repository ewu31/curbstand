-- Task 4 storage contract for the backend owner.
-- The application reads and writes through FulfillmentRepository and
-- CheckInTokenStore. Apply these columns in whatever engine Task 1 chooses.
-- This script is PostgreSQL-shaped. Do not store API keys, passwords, raw
-- payment instruments, or copies of QR tokens inside events.

ALTER TABLE group_buy_participants
  ADD COLUMN IF NOT EXISTS completion_method TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_in_token_hash TEXT;

-- Expected existing columns used by Task 4:
-- deposit_amount NUMERIC(10, 2)
-- deposit_status TEXT CHECK (deposit_status IN ('pending', 'confirmed_manual', 'refunded_manual', 'forfeited_manual'))
-- completion_status TEXT CHECK (completion_status IN ('pending', 'completed'))

CREATE TABLE IF NOT EXISTS check_in_tokens (
  participant_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_benchmarks (
  id TEXT PRIMARY KEY,
  produce_type TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'seattle-puget-sound',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  unit TEXT NOT NULL DEFAULT 'lb',
  retail_low NUMERIC(10, 2) NOT NULL,
  retail_high NUMERIC(10, 2) NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('gemini', 'demo_sample')),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  response_json JSONB NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (retail_low > 0),
  CHECK (retail_high >= retail_low),
  CHECK (currency = 'USD'),
  CHECK (region = 'seattle-puget-sound')
);

CREATE INDEX IF NOT EXISTS price_benchmarks_lookup
  ON price_benchmarks (produce_type, region, retrieved_at DESC);

CREATE TABLE IF NOT EXISTS distribution_center_baselines (
  produce_type TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'seattle-puget-sound',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  baseline_per_lb NUMERIC(10, 2) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (produce_type, region),
  CHECK (baseline_per_lb >= 0),
  CHECK (currency = 'USD')
);

-- events.payload must stay inside the allowlist in src/events.ts.
-- Never copy token, email, password, API key, or card fields into payload.
