-- ============================================================================
-- MIGRATION: Fix OC Tier calculation to match VIC legislation
-- ============================================================================
-- Tier 5: ≤2 occupiable lots
-- Tier 4: 3–12 occupiable lots
-- Tier 3: 13–50 occupiable lots
-- Tier 2: 51–100 occupiable lots
-- Tier 1: 100+ occupiable lots
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_oc_tier()
RETURNS TRIGGER AS $$
BEGIN
  NEW.oc_tier := CASE
    WHEN NEW.total_lots <= 2 THEN 5
    WHEN NEW.total_lots <= 12 THEN 4
    WHEN NEW.total_lots <= 50 THEN 3
    WHEN NEW.total_lots <= 100 THEN 2
    ELSE 1
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recalculate tiers for all existing subdivisions
UPDATE subdivisions SET oc_tier = CASE
  WHEN total_lots <= 2 THEN 5
  WHEN total_lots <= 12 THEN 4
  WHEN total_lots <= 50 THEN 3
  WHEN total_lots <= 100 THEN 2
  ELSE 1
END;
