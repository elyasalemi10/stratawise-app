-- ============================================================================
-- Fix reference number generation
-- Run this in Supabase SQL editor
-- ============================================================================

-- Reset the levy sequence to start from 1 (clean slate)
ALTER SEQUENCE msm_levy_seq RESTART WITH 1;

-- Function to generate sequential reference numbers
-- Usage: SELECT next_reference_number('LEV');  → 'LEV-2026-000001'
CREATE OR REPLACE FUNCTION next_reference_number(prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  seq_name TEXT;
  seq_val BIGINT;
  year_str TEXT;
BEGIN
  seq_name := 'msm_' || lower(prefix) || '_seq';
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq_val;
  year_str := extract(year from now())::TEXT;
  RETURN prefix || '-' || year_str || '-' || lpad(seq_val::TEXT, 6, '0');
END;
$$;

-- Delete any test levies with broken reference numbers
DELETE FROM levy_notice_items WHERE levy_notice_id IN (
  SELECT id FROM levy_notices WHERE reference_number LIKE 'LEV-%-1%' AND length(reference_number) > 20
);
DELETE FROM levy_notices WHERE reference_number LIKE 'LEV-%-1%' AND length(reference_number) > 20;
