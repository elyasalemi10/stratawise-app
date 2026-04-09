-- ============================================================================
-- Certificate-related fields for OC Certificate generation
-- Run this in Supabase SQL editor
-- ============================================================================

-- Management company fields
ALTER TABLE management_companies ADD COLUMN IF NOT EXISTS registered_name TEXT;
ALTER TABLE management_companies ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- Subdivision fields for certificate
ALTER TABLE subdivisions ADD COLUMN IF NOT EXISTS common_seal_text TEXT;
ALTER TABLE subdivisions ADD COLUMN IF NOT EXISTS inspection_address TEXT;
ALTER TABLE subdivisions ADD COLUMN IF NOT EXISTS manager_appointed BOOLEAN DEFAULT true;
ALTER TABLE subdivisions ADD COLUMN IF NOT EXISTS administrator_appointed BOOLEAN DEFAULT false;
