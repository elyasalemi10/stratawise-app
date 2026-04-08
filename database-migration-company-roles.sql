-- ============================================================================
-- Company roles for 3-tier management
-- Run this in Supabase SQL editor
-- ============================================================================

-- Company role type: admin, manager, viewer
CREATE TYPE company_role AS ENUM ('admin', 'manager', 'viewer');

-- Add company_role to profiles (null for lot owners)
ALTER TABLE profiles ADD COLUMN company_role company_role;

-- Set existing strata_managers and super_admins to admin
UPDATE profiles SET company_role = 'admin' WHERE role IN ('strata_manager', 'super_admin') AND company_role IS NULL;
