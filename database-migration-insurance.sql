-- ============================================================================
-- Insurance policies table (if not already created)
-- Run this in Supabase SQL editor
-- ============================================================================

-- Only run if table doesn't exist
CREATE TABLE IF NOT EXISTS insurance_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  reference_number TEXT UNIQUE,
  policy_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  policy_number TEXT,
  sum_insured DECIMAL(14,2),
  premium DECIMAL(12,2),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insurance_subdivision ON insurance_policies(subdivision_id);
