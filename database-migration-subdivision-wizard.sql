-- ============================================================================
-- MIGRATION: Subdivision Wizard — Additional columns
-- Run in Supabase SQL Editor after the base schema.
-- ============================================================================

-- New columns on subdivisions table
ALTER TABLE subdivisions
  ADD COLUMN IF NOT EXISTS subdivision_type text NOT NULL DEFAULT 'strata',
  ADD COLUMN IF NOT EXISTS management_start_date date,
  ADD COLUMN IF NOT EXISTS levy_year_start_month integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS levies_per_year integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS bank_connection_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS street_number text,
  ADD COLUMN IF NOT EXISTS street_name text,
  ADD COLUMN IF NOT EXISTS suburb text,
  ADD COLUMN IF NOT EXISTS setup_step integer NOT NULL DEFAULT 1;

-- Constraints
DO $$ BEGIN
  ALTER TABLE subdivisions
    ADD CONSTRAINT chk_subdivision_type
      CHECK (subdivision_type IN ('strata', 'company', 'neighbourhood_association'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE subdivisions
    ADD CONSTRAINT chk_levy_year_start_month
      CHECK (levy_year_start_month BETWEEN 1 AND 12);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE subdivisions
    ADD CONSTRAINT chk_levies_per_year
      CHECK (levies_per_year IN (1, 2, 4, 6, 12));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE subdivisions
    ADD CONSTRAINT chk_bank_connection_type
      CHECK (bank_connection_type IN ('basiq', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- New columns on lots table
ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS unit_number text,
  ADD COLUMN IF NOT EXISTS owner_type text DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS owner_phone text;

DO $$ BEGIN
  ALTER TABLE lots
    ADD CONSTRAINT chk_owner_type
      CHECK (owner_type IN ('individual', 'company'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
