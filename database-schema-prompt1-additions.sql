-- ============================================================================
-- MSM — PROMPT 1 INCREMENTAL MIGRATION (ledger foundation)
-- ----------------------------------------------------------------------------
-- Apply this against a database that already has the Prompt 0 consolidated
-- schema. It adds:
--   - 4 new enum types + 1 new value on levy_batch_status
--   - 1 new column on bank_transactions
--   - 3 new tables (lot_ledger_entries, lot_ledger_state, reconciliation_matches)
--   - 1 new trigger on lots
--   - 8 ledger functions (walker, recompute, 5 RPCs, trigger fn)
--   - 1 view (v_levy_notice_status)
--   - RLS enables for the 3 new tables
--
-- If you are starting from a FRESH empty DB, prefer REBUILD_INSTRUCTIONS.md —
-- running database-schema.sql top-to-bottom includes everything here.
--
-- This script is idempotent for ENUM/table/function creation where practical,
-- but can be safely re-run only if the Prompt 1 objects don't already exist.
-- ============================================================================

BEGIN;

-- ─── 1. Enum types ──────────────────────────────────────────────────────────

CREATE TYPE ledger_entry_type AS ENUM ('debit', 'credit');
CREATE TYPE ledger_entry_category AS ENUM (
  'levy',
  'special_levy',
  'interest',
  'payment',
  'writeoff',
  'adjustment_debit',
  'adjustment_credit',
  'refund',
  'void_offset'
);
CREATE TYPE ledger_entry_status AS ENUM ('active', 'voided');
CREATE TYPE reconciliation_match_method AS ENUM (
  'manual',
  'auto_reference',
  'auto_bpay_crn',
  'auto_sender',
  'auto_amount',
  'system'
);

-- Extend levy_batch_status with 'ledger_written'. Must be executed outside
-- a transaction in some Postgres versions — split out if applying via psql.
-- Supabase's SQL editor accepts it inside an explicit transaction block.
ALTER TYPE levy_batch_status ADD VALUE IF NOT EXISTS 'ledger_written' BEFORE 'sent';

-- ─── 2. bank_transactions column ────────────────────────────────────────────

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS matched_total DECIMAL(12,2) NOT NULL DEFAULT 0;

COMMIT;

-- ─── 3. New tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lot_ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id),
  lot_id UUID NOT NULL REFERENCES lots(id),
  fund_type fund_type NOT NULL,
  entry_type ledger_entry_type NOT NULL,
  category ledger_entry_category NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT,
  reference TEXT,
  levy_notice_id UUID REFERENCES levy_notices(id),
  status ledger_entry_status NOT NULL DEFAULT 'active',
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES profiles(id),
  void_reason TEXT,
  voided_by_entry_id UUID REFERENCES lot_ledger_entries(id),
  voids_entry_id UUID REFERENCES lot_ledger_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES profiles(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT chk_ledger_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_ledger_type_category CHECK (
    (entry_type = 'debit'  AND category IN ('levy', 'special_levy', 'interest', 'adjustment_debit', 'refund', 'void_offset'))
    OR
    (entry_type = 'credit' AND category IN ('payment', 'writeoff', 'adjustment_credit', 'void_offset'))
  ),
  CONSTRAINT chk_ledger_voided_consistency CHECK ((status = 'voided') = (voided_at IS NOT NULL)),
  CONSTRAINT chk_ledger_voids_requires_offset CHECK (voids_entry_id IS NULL OR category = 'void_offset')
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_subdivision ON lot_ledger_entries(subdivision_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_lot         ON lot_ledger_entries(lot_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_lot_date    ON lot_ledger_entries(lot_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_active_lot  ON lot_ledger_entries(lot_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ledger_entries_reference   ON lot_ledger_entries(reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_levy_notice ON lot_ledger_entries(levy_notice_id) WHERE levy_notice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lot_ledger_state (
  lot_id UUID PRIMARY KEY REFERENCES lots(id) ON DELETE CASCADE,
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id),
  admin_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  capital_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  oldest_unpaid_date_admin DATE,
  oldest_unpaid_date_capital DATE,
  last_entry_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_state_subdivision ON lot_ledger_state(subdivision_id);

CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(id),
  ledger_entry_id UUID NOT NULL REFERENCES lot_ledger_entries(id),
  amount_matched DECIMAL(12,2) NOT NULL,
  match_method reconciliation_match_method NOT NULL,
  match_confidence match_confidence NOT NULL,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_by UUID REFERENCES profiles(id),
  notes TEXT,
  CONSTRAINT chk_recon_amount_positive CHECK (amount_matched > 0),
  UNIQUE (bank_transaction_id, ledger_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_recon_matches_bank_txn ON reconciliation_matches(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_recon_matches_ledger   ON reconciliation_matches(ledger_entry_id);

-- ─── 4. Trigger on lots INSERT ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_lot_trigger_ledger_state()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO lot_ledger_state (lot_id, subdivision_id, admin_balance, capital_balance, total_balance)
  VALUES (NEW.id, NEW.subdivision_id, 0, 0, 0)
  ON CONFLICT (lot_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lot_ledger_state_create ON lots;
CREATE TRIGGER trg_lot_ledger_state_create
  AFTER INSERT ON lots
  FOR EACH ROW EXECUTE FUNCTION create_lot_trigger_ledger_state();

-- Backfill lot_ledger_state rows for any lots that existed before this migration.
INSERT INTO lot_ledger_state (lot_id, subdivision_id, admin_balance, capital_balance, total_balance)
SELECT l.id, l.subdivision_id, 0, 0, 0
  FROM lots l
  LEFT JOIN lot_ledger_state s ON s.lot_id = l.id
 WHERE s.lot_id IS NULL;

-- ─── 5. Ledger functions ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _walk_oldest_unpaid(p_lot_id uuid, p_fund fund_type)
RETURNS date
LANGUAGE plpgsql
AS $$
DECLARE
  v_free_pool decimal(12,2) := 0;
  v_debit RECORD;
  v_targeted decimal(12,2);
  v_needed decimal(12,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0)
    INTO v_free_pool
    FROM lot_ledger_entries
   WHERE lot_id = p_lot_id
     AND fund_type = p_fund
     AND status = 'active'
     AND entry_type = 'credit'
     AND levy_notice_id IS NULL
     AND reference IS NULL;

  FOR v_debit IN
    SELECT id, amount, entry_date, levy_notice_id, reference
      FROM lot_ledger_entries
     WHERE lot_id = p_lot_id
       AND fund_type = p_fund
       AND status = 'active'
       AND entry_type = 'debit'
     ORDER BY entry_date ASC, created_at ASC
  LOOP
    SELECT COALESCE(SUM(c.amount), 0)
      INTO v_targeted
      FROM lot_ledger_entries c
     WHERE c.lot_id = p_lot_id
       AND c.fund_type = p_fund
       AND c.status = 'active'
       AND c.entry_type = 'credit'
       AND (
         (c.levy_notice_id IS NOT NULL AND c.levy_notice_id = v_debit.levy_notice_id)
         OR (c.reference IS NOT NULL AND v_debit.reference IS NOT NULL AND c.reference = v_debit.reference)
       );

    IF v_targeted >= v_debit.amount THEN
      CONTINUE;
    END IF;

    v_needed := v_debit.amount - v_targeted;
    IF v_free_pool >= v_needed THEN
      v_free_pool := v_free_pool - v_needed;
    ELSE
      RETURN v_debit.entry_date;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION recompute_lot_ledger_state(p_lot_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_subdivision uuid;
  v_admin decimal(12,2);
  v_capital decimal(12,2);
  v_oldest_admin date;
  v_oldest_capital date;
  v_last_entry timestamptz;
BEGIN
  SELECT subdivision_id INTO v_subdivision FROM lots WHERE id = p_lot_id;
  IF v_subdivision IS NULL THEN
    RAISE EXCEPTION 'recompute_lot_ledger_state: lot % not found', p_lot_id;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END), 0)
    INTO v_admin
    FROM lot_ledger_entries
   WHERE lot_id = p_lot_id AND status = 'active' AND fund_type = 'administrative';

  SELECT COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END), 0)
    INTO v_capital
    FROM lot_ledger_entries
   WHERE lot_id = p_lot_id AND status = 'active' AND fund_type = 'capital_works';

  v_oldest_admin   := _walk_oldest_unpaid(p_lot_id, 'administrative');
  v_oldest_capital := _walk_oldest_unpaid(p_lot_id, 'capital_works');

  SELECT MAX(created_at) INTO v_last_entry
    FROM lot_ledger_entries
   WHERE lot_id = p_lot_id AND status = 'active';

  INSERT INTO lot_ledger_state (
    lot_id, subdivision_id, admin_balance, capital_balance, total_balance,
    oldest_unpaid_date_admin, oldest_unpaid_date_capital, last_entry_at, updated_at
  ) VALUES (
    p_lot_id, v_subdivision, v_admin, v_capital, v_admin + v_capital,
    v_oldest_admin, v_oldest_capital, v_last_entry, NOW()
  )
  ON CONFLICT (lot_id) DO UPDATE SET
    subdivision_id             = EXCLUDED.subdivision_id,
    admin_balance              = EXCLUDED.admin_balance,
    capital_balance            = EXCLUDED.capital_balance,
    total_balance              = EXCLUDED.total_balance,
    oldest_unpaid_date_admin   = EXCLUDED.oldest_unpaid_date_admin,
    oldest_unpaid_date_capital = EXCLUDED.oldest_unpaid_date_capital,
    last_entry_at              = EXCLUDED.last_entry_at,
    updated_at                 = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION rpc_levy_debit(
  p_subdivision_id uuid,
  p_lot_id uuid,
  p_fund_type fund_type,
  p_amount decimal,
  p_entry_date date,
  p_description text,
  p_reference text,
  p_levy_notice_id uuid,
  p_category ledger_entry_category,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing uuid;
  v_new_id uuid;
  v_notice_lot uuid;
  v_after jsonb;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_levy_debit: amount must be positive';
  END IF;
  IF p_category NOT IN ('levy', 'special_levy') THEN
    RAISE EXCEPTION 'rpc_levy_debit: category must be levy or special_levy, got %', p_category;
  END IF;
  IF p_levy_notice_id IS NULL THEN
    RAISE EXCEPTION 'rpc_levy_debit: p_levy_notice_id is required';
  END IF;

  SELECT lot_id INTO v_notice_lot FROM levy_notices WHERE id = p_levy_notice_id;
  IF v_notice_lot IS NULL THEN
    RAISE EXCEPTION 'rpc_levy_debit: levy_notice % not found', p_levy_notice_id;
  END IF;
  IF v_notice_lot <> p_lot_id THEN
    RAISE EXCEPTION 'rpc_levy_debit: levy_notice % does not belong to lot %', p_levy_notice_id, p_lot_id;
  END IF;

  SELECT id INTO v_existing
    FROM lot_ledger_entries
   WHERE levy_notice_id = p_levy_notice_id
     AND entry_type = 'debit'
     AND status = 'active'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO lot_ledger_entries (
    subdivision_id, lot_id, fund_type, entry_type, category,
    amount, entry_date, description, reference, levy_notice_id,
    status, created_by
  ) VALUES (
    p_subdivision_id, p_lot_id, p_fund_type, 'debit', p_category,
    p_amount, p_entry_date, p_description, p_reference, p_levy_notice_id,
    'active', p_created_by
  ) RETURNING id INTO v_new_id;

  PERFORM recompute_lot_ledger_state(p_lot_id);

  SELECT to_jsonb(e) INTO v_after FROM lot_ledger_entries e WHERE id = v_new_id;
  INSERT INTO audit_log (profile_id, subdivision_id, action, entity_type, entity_id, after_state)
  VALUES (p_created_by, p_subdivision_id, 'ledger.debit.created', 'lot_ledger_entry', v_new_id, v_after);

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_payment_credit(
  p_subdivision_id uuid,
  p_lot_id uuid,
  p_fund_type fund_type,
  p_amount decimal,
  p_entry_date date,
  p_description text,
  p_reference text,
  p_levy_notice_id uuid,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_id uuid;
  v_after jsonb;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_payment_credit: amount must be positive';
  END IF;

  INSERT INTO lot_ledger_entries (
    subdivision_id, lot_id, fund_type, entry_type, category,
    amount, entry_date, description, reference, levy_notice_id,
    status, created_by
  ) VALUES (
    p_subdivision_id, p_lot_id, p_fund_type, 'credit', 'payment',
    p_amount, p_entry_date, p_description, p_reference, p_levy_notice_id,
    'active', p_created_by
  ) RETURNING id INTO v_new_id;

  PERFORM recompute_lot_ledger_state(p_lot_id);

  SELECT to_jsonb(e) INTO v_after FROM lot_ledger_entries e WHERE id = v_new_id;
  INSERT INTO audit_log (profile_id, subdivision_id, action, entity_type, entity_id, after_state)
  VALUES (p_created_by, p_subdivision_id, 'ledger.credit.created', 'lot_ledger_entry', v_new_id, v_after);

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_ledger_adjustment(
  p_subdivision_id uuid,
  p_lot_id uuid,
  p_fund_type fund_type,
  p_entry_type ledger_entry_type,
  p_category ledger_entry_category,
  p_amount decimal,
  p_entry_date date,
  p_description text,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_id uuid;
  v_after jsonb;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_ledger_adjustment: amount must be positive';
  END IF;
  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION 'rpc_ledger_adjustment: description is required';
  END IF;
  IF p_category NOT IN ('adjustment_debit', 'writeoff', 'adjustment_credit', 'refund') THEN
    RAISE EXCEPTION 'rpc_ledger_adjustment: category must be adjustment_debit / writeoff / adjustment_credit / refund, got %', p_category;
  END IF;
  IF p_entry_type = 'debit' AND p_category NOT IN ('adjustment_debit', 'refund') THEN
    RAISE EXCEPTION 'rpc_ledger_adjustment: category % incompatible with debit entry_type', p_category;
  END IF;
  IF p_entry_type = 'credit' AND p_category NOT IN ('adjustment_credit', 'writeoff') THEN
    RAISE EXCEPTION 'rpc_ledger_adjustment: category % incompatible with credit entry_type', p_category;
  END IF;

  INSERT INTO lot_ledger_entries (
    subdivision_id, lot_id, fund_type, entry_type, category,
    amount, entry_date, description, status, created_by
  ) VALUES (
    p_subdivision_id, p_lot_id, p_fund_type, p_entry_type, p_category,
    p_amount, p_entry_date, p_description, 'active', p_created_by
  ) RETURNING id INTO v_new_id;

  PERFORM recompute_lot_ledger_state(p_lot_id);

  SELECT to_jsonb(e) INTO v_after FROM lot_ledger_entries e WHERE id = v_new_id;
  INSERT INTO audit_log (profile_id, subdivision_id, action, entity_type, entity_id, after_state)
  VALUES (p_created_by, p_subdivision_id, 'ledger.adjustment.created', 'lot_ledger_entry', v_new_id, v_after);

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_ledger_void(
  p_entry_id uuid,
  p_reason text,
  p_voided_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_original lot_ledger_entries%ROWTYPE;
  v_offset_id uuid;
  v_offset_type ledger_entry_type;
  v_linked_match_ids uuid[];
  v_before jsonb;
  v_after jsonb;
  v_old_notice_status levy_status;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'rpc_ledger_void: reason is required';
  END IF;

  SELECT * INTO v_original
    FROM lot_ledger_entries
   WHERE id = p_entry_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_ledger_void: entry % not found', p_entry_id;
  END IF;
  IF v_original.status = 'voided' THEN
    RAISE EXCEPTION 'rpc_ledger_void: entry % is already voided', p_entry_id;
  END IF;
  IF v_original.category = 'void_offset' THEN
    RAISE EXCEPTION 'rpc_ledger_void: cannot void an offset entry %', p_entry_id;
  END IF;

  v_before := to_jsonb(v_original);
  v_offset_type := CASE WHEN v_original.entry_type = 'debit'
                        THEN 'credit'::ledger_entry_type
                        ELSE 'debit'::ledger_entry_type END;

  INSERT INTO lot_ledger_entries (
    subdivision_id, lot_id, fund_type, entry_type, category,
    amount, entry_date, description, reference, levy_notice_id,
    voids_entry_id, status, created_by
  ) VALUES (
    v_original.subdivision_id, v_original.lot_id, v_original.fund_type, v_offset_type, 'void_offset',
    v_original.amount, CURRENT_DATE,
    'Void of entry ' || p_entry_id::text || ': ' || p_reason,
    v_original.reference, v_original.levy_notice_id,
    p_entry_id, 'active', p_voided_by
  ) RETURNING id INTO v_offset_id;

  UPDATE lot_ledger_entries
     SET status             = 'voided',
         voided_at          = NOW(),
         voided_by          = p_voided_by,
         void_reason        = p_reason,
         voided_by_entry_id = v_offset_id
   WHERE id = p_entry_id;

  IF v_original.category IN ('levy', 'special_levy') AND v_original.levy_notice_id IS NOT NULL THEN
    SELECT status INTO v_old_notice_status FROM levy_notices WHERE id = v_original.levy_notice_id;
    UPDATE levy_notices SET status = 'written_off', updated_at = NOW() WHERE id = v_original.levy_notice_id;
    INSERT INTO audit_log (profile_id, subdivision_id, action, entity_type, entity_id, before_state, after_state, metadata)
    VALUES (p_voided_by, v_original.subdivision_id, 'levy_notice.written_off', 'levy_notice', v_original.levy_notice_id,
            jsonb_build_object('status', v_old_notice_status),
            jsonb_build_object('status', 'written_off'),
            jsonb_build_object('caused_by_ledger_void_id', p_entry_id, 'offset_entry_id', v_offset_id));
  END IF;

  PERFORM recompute_lot_ledger_state(v_original.lot_id);

  SELECT array_agg(id) INTO v_linked_match_ids
    FROM reconciliation_matches
   WHERE ledger_entry_id = p_entry_id;

  SELECT to_jsonb(e) INTO v_after FROM lot_ledger_entries e WHERE id = p_entry_id;
  INSERT INTO audit_log (profile_id, subdivision_id, action, entity_type, entity_id, before_state, after_state, metadata)
  VALUES (p_voided_by, v_original.subdivision_id, 'ledger.entry.voided', 'lot_ledger_entry', p_entry_id,
          v_before, v_after,
          jsonb_build_object(
            'reason', p_reason,
            'offset_entry_id', v_offset_id,
            'linked_reconciliation_match_ids', COALESCE(to_jsonb(v_linked_match_ids), 'null'::jsonb)
          ));

  RETURN v_offset_id;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_levy_batch_debit(
  p_batch_id uuid,
  p_created_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_batch levy_batches%ROWTYPE;
  v_notice RECORD;
  v_existing uuid;
  v_new_id uuid;
  v_created integer := 0;
  v_skipped integer := 0;
  v_lot_ids uuid[] := ARRAY[]::uuid[];
  v_lot uuid;
  v_category ledger_entry_category;
BEGIN
  SELECT * INTO v_batch
    FROM levy_batches
   WHERE id = p_batch_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_levy_batch_debit: batch % not found', p_batch_id;
  END IF;
  IF v_batch.status <> 'draft' THEN
    RAISE EXCEPTION 'rpc_levy_batch_debit: batch % has status %; expected draft', p_batch_id, v_batch.status;
  END IF;

  FOR v_notice IN
    SELECT id, subdivision_id, lot_id, fund_type, amount, period_start, reference_number, levy_type
      FROM levy_notices
     WHERE batch_id = p_batch_id
  LOOP
    SELECT id INTO v_existing
      FROM lot_ledger_entries
     WHERE levy_notice_id = v_notice.id
       AND entry_type = 'debit'
       AND status = 'active'
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_category := CASE WHEN v_notice.levy_type = 'special'
                       THEN 'special_levy'::ledger_entry_category
                       ELSE 'levy'::ledger_entry_category END;

    INSERT INTO lot_ledger_entries (
      subdivision_id, lot_id, fund_type, entry_type, category,
      amount, entry_date, description, reference, levy_notice_id,
      status, created_by
    ) VALUES (
      v_notice.subdivision_id, v_notice.lot_id, v_notice.fund_type, 'debit', v_category,
      v_notice.amount, v_notice.period_start,
      'Levy ' || v_notice.reference_number, v_notice.reference_number, v_notice.id,
      'active', p_created_by
    ) RETURNING id INTO v_new_id;

    v_created := v_created + 1;
    IF NOT (v_notice.lot_id = ANY(v_lot_ids)) THEN
      v_lot_ids := array_append(v_lot_ids, v_notice.lot_id);
    END IF;
  END LOOP;

  FOREACH v_lot IN ARRAY v_lot_ids LOOP
    PERFORM recompute_lot_ledger_state(v_lot);
  END LOOP;

  UPDATE levy_batches SET status = 'ledger_written' WHERE id = p_batch_id;

  INSERT INTO audit_log (profile_id, subdivision_id, action, entity_type, entity_id, metadata)
  VALUES (p_created_by, v_batch.subdivision_id, 'ledger.levy_batch.generated', 'levy_batch', p_batch_id,
          jsonb_build_object('created', v_created, 'skipped_existing', v_skipped));

  RETURN jsonb_build_object('created', v_created, 'skipped_existing', v_skipped);
END;
$$;

-- ─── 6. View ────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_levy_notice_status AS
WITH credits AS (
  SELECT
    n.id AS notice_id,
    COALESCE(SUM(e.amount), 0)::decimal(12,2) AS total_credit
  FROM levy_notices n
  LEFT JOIN lot_ledger_entries e
    ON e.status = 'active'
   AND e.entry_type = 'credit'
   AND (
         e.levy_notice_id = n.id
      OR (e.reference IS NOT NULL AND e.reference = n.reference_number)
       )
  GROUP BY n.id
),
voided_debits AS (
  SELECT DISTINCT levy_notice_id AS notice_id
  FROM lot_ledger_entries
  WHERE status = 'voided'
    AND entry_type = 'debit'
    AND category IN ('levy', 'special_levy')
    AND levy_notice_id IS NOT NULL
)
SELECT
  n.id,
  n.subdivision_id,
  n.lot_id,
  n.reference_number,
  n.amount,
  n.due_date,
  n.status AS stored_status,
  c.total_credit,
  CASE
    WHEN v.notice_id IS NOT NULL OR n.status = 'written_off' THEN 'written_off'::levy_status
    WHEN c.total_credit >= n.amount THEN 'paid'::levy_status
    WHEN c.total_credit > 0 THEN 'partially_paid'::levy_status
    WHEN n.due_date < CURRENT_DATE AND n.status NOT IN ('draft', 'written_off') THEN 'overdue'::levy_status
    ELSE n.status
  END AS effective_status
FROM levy_notices n
LEFT JOIN credits c       ON c.notice_id = n.id
LEFT JOIN voided_debits v ON v.notice_id = n.id;

-- ─── 7. RLS enables ─────────────────────────────────────────────────────────

ALTER TABLE lot_ledger_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_ledger_state       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_matches ENABLE ROW LEVEL SECURITY;

-- ─── 8. Grants — required because DROP SCHEMA CASCADE in Prompt 0 reset
--       the default privileges. Without these, service_role (and the app)
--       hits "permission denied" on the new objects.
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;
