-- ============================================================================
-- LEVY BATCHES & LEVY NOTICE ITEMS
-- Run this migration in Supabase SQL editor
-- ============================================================================

-- Batch status type
CREATE TYPE levy_batch_status AS ENUM ('draft', 'sent', 'partially_sent');

-- Levy batches — groups levy notices into a generation batch
CREATE TABLE levy_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES budgets(id),
  financial_year TEXT NOT NULL,
  fund_type fund_type NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_label TEXT NOT NULL, -- e.g. "Q1 2025-2026"
  due_date DATE NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  levy_count INTEGER NOT NULL DEFAULT 0,
  status levy_batch_status NOT NULL DEFAULT 'draft',
  generated_by UUID NOT NULL REFERENCES profiles(id),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_levy_batches_subdivision ON levy_batches(subdivision_id);

-- Add batch_id to levy_notices
ALTER TABLE levy_notices ADD COLUMN batch_id UUID REFERENCES levy_batches(id);
ALTER TABLE levy_notices ADD COLUMN pdf_url TEXT;
CREATE INDEX idx_levy_notices_batch ON levy_notices(batch_id);

-- Levy notice items — individual line items per levy notice
CREATE TABLE levy_notice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  levy_notice_id UUID NOT NULL REFERENCES levy_notices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_adjustment BOOLEAN NOT NULL DEFAULT false, -- true for custom per-lot additions
  budget_item_id UUID REFERENCES budget_items(id), -- null for adjustments
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_levy_notice_items_levy ON levy_notice_items(levy_notice_id);

-- Sequence for batch reference numbers
CREATE SEQUENCE msm_levy_batch_seq START 1;
