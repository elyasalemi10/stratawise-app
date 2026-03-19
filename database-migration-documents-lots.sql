-- ============================================================================
-- MIGRATION: Documents + Lot Owner Occupied
-- Run in Supabase SQL Editor after previous migrations.
-- ============================================================================

-- 1. Add owner_occupied column to lots table
ALTER TABLE lots ADD COLUMN IF NOT EXISTS owner_occupied BOOLEAN NOT NULL DEFAULT true;

-- 2. Add lot_id column to documents table (nullable FK — lot docs vs subdivision docs)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES lots(id) ON DELETE CASCADE;

-- 3. Index for efficient lot document queries
CREATE INDEX IF NOT EXISTS idx_documents_lot_id ON documents(lot_id) WHERE lot_id IS NOT NULL;

-- 4. Index for subdivision-level documents (lot_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_documents_subdivision_no_lot ON documents(subdivision_id) WHERE lot_id IS NULL;
