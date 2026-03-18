-- ============================================================================
-- MY STRATA MANAGEMENT (MSM) — FULL DATABASE SCHEMA
-- ============================================================================
-- Run in Supabase SQL Editor. Creates ALL tables, triggers, RLS, sequences,
-- and seed data in one migration.
--
-- Roles: super_admin, strata_manager, lot_owner
-- Fund types: administrative, capital_works
-- State: VIC only for MVP (multi-state via state_compliance_rules)
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CUSTOM TYPES
-- ============================================================================
CREATE TYPE profile_role AS ENUM ('super_admin', 'strata_manager', 'lot_owner');
CREATE TYPE profile_status AS ENUM ('active', 'deactivated', 'anonymised');
CREATE TYPE subdivision_status AS ENUM ('active', 'archived', 'suspended');
CREATE TYPE subscription_status AS ENUM ('active', 'suspended', 'cancelled');
CREATE TYPE fund_type AS ENUM ('administrative', 'capital_works');
CREATE TYPE member_role AS ENUM ('strata_manager', 'lot_owner');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE budget_status AS ENUM ('draft', 'approved');
CREATE TYPE levy_status AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'written_off');
CREATE TYPE levy_type AS ENUM ('regular', 'special', 'penalty_interest');
CREATE TYPE payment_method AS ENUM ('bpay', 'eft', 'cash', 'cheque', 'direct_debit', 'stripe_card', 'other');
CREATE TYPE match_confidence AS ENUM ('exact_reference', 'amount_match', 'name_match', 'manual', 'auto_portal', 'basiq_auto');
CREATE TYPE transaction_source AS ENUM ('manual', 'csv', 'basiq');
CREATE TYPE meeting_type AS ENUM ('agm', 'sgm', 'committee');
CREATE TYPE meeting_status AS ENUM ('draft', 'notice_sent', 'in_progress', 'completed', 'cancelled');
CREATE TYPE resolution_type AS ENUM ('ordinary', 'special', 'unanimous', 'information');
CREATE TYPE vote_choice AS ENUM ('for', 'against', 'abstain');
CREATE TYPE maintenance_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE maintenance_status AS ENUM ('submitted', 'under_review', 'approved', 'in_progress', 'completed', 'rejected');
CREATE TYPE complaint_status AS ENUM ('open', 'under_review', 'resolved', 'escalated', 'closed');
CREATE TYPE communication_channel AS ENUM ('email', 'sms', 'voice', 'letter', 'in_app');
CREATE TYPE communication_status AS ENUM ('queued', 'sent', 'delivered', 'opened', 'bounced', 'failed');
CREATE TYPE escalation_status AS ENUM ('active', 'paused', 'completed', 'resolved', 'escalated_manual');
CREATE TYPE payment_plan_status AS ENUM ('active', 'completed', 'defaulted', 'cancelled');
CREATE TYPE reserve_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE reserve_status AS ENUM ('planned', 'in_progress', 'completed');
CREATE TYPE contractor_status AS ENUM ('active', 'inactive');

-- ============================================================================
-- GLOBAL SEQUENCES (for reference numbers — NEVER per-subdivision)
-- ============================================================================
CREATE SEQUENCE msm_levy_seq START 1;
CREATE SEQUENCE msm_special_levy_seq START 1;
CREATE SEQUENCE msm_payment_seq START 1;
CREATE SEQUENCE msm_meeting_seq START 1;
CREATE SEQUENCE msm_minutes_seq START 1;
CREATE SEQUENCE msm_policy_seq START 1;
CREATE SEQUENCE msm_claim_seq START 1;
CREATE SEQUENCE msm_maintenance_seq START 1;
CREATE SEQUENCE msm_invitation_seq START 1;
CREATE SEQUENCE msm_complaint_seq START 1;
CREATE SEQUENCE msm_escalation_seq START 1;

-- ============================================================================
-- 1. MANAGEMENT COMPANIES
-- ============================================================================
CREATE TABLE management_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  abn TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  subscription_status subscription_status NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. PROFILES (synced from Clerk via webhook)
-- ============================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  postal_address TEXT,
  avatar_url TEXT,
  role profile_role NOT NULL DEFAULT 'lot_owner',
  management_company_id UUID REFERENCES management_companies(id),
  status profile_status NOT NULL DEFAULT 'active',
  deactivated_at TIMESTAMPTZ,
  anonymised_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_clerk_id ON profiles(clerk_id);
CREATE INDEX idx_profiles_management_company ON profiles(management_company_id);
CREATE INDEX idx_profiles_role ON profiles(role);

-- ============================================================================
-- 3. USER CONSENTS
-- ============================================================================
CREATE TABLE user_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  consent_type TEXT NOT NULL, -- terms_of_service, privacy_policy, communication_email, communication_sms
  version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_user_consents_profile ON user_consents(profile_id);

-- ============================================================================
-- 4. NOTIFICATION PREFERENCES
-- ============================================================================
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  notification_type TEXT NOT NULL, -- levy_issued, payment_received, meeting_notice, etc.
  channel communication_channel NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(profile_id, notification_type, channel)
);

CREATE INDEX idx_notification_prefs_profile ON notification_preferences(profile_id);

-- ============================================================================
-- 5. SUBDIVISIONS
-- ============================================================================
CREATE TABLE subdivisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  management_company_id UUID NOT NULL REFERENCES management_companies(id),
  name TEXT NOT NULL,
  plan_number TEXT NOT NULL,
  address TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'VIC',
  total_lots INTEGER NOT NULL DEFAULT 0,
  common_property_description TEXT,
  oc_tier INTEGER, -- auto-calculated: 1-5
  abn TEXT,
  tfn TEXT,
  bank_bsb TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  financial_year_start_month INTEGER NOT NULL DEFAULT 7, -- July
  is_developer_period BOOLEAN NOT NULL DEFAULT false,
  developer_period_end_date DATE,
  rules_type TEXT NOT NULL DEFAULT 'model', -- model, custom
  custom_rules_registration_date DATE,
  custom_rules_reference TEXT,
  billing_cycle TEXT NOT NULL DEFAULT 'quarterly', -- monthly, quarterly, half_yearly, annually
  last_agm_date DATE,
  next_agm_due DATE, -- auto: last_agm_date + 15 months
  -- Interest settings (per-subdivision, configurable)
  interest_enabled BOOLEAN NOT NULL DEFAULT true,
  interest_rate_monthly DECIMAL(5,2) NOT NULL DEFAULT 2.0, -- max 2.5% per VIC
  interest_accrual_day INTEGER NOT NULL DEFAULT 1, -- 1, 15, or 0 (last day)
  interest_grace_period_days INTEGER NOT NULL DEFAULT 0,
  status subdivision_status NOT NULL DEFAULT 'active',
  archived_at TIMESTAMPTZ,
  archived_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_subdivisions_company ON subdivisions(management_company_id);
CREATE INDEX idx_subdivisions_status ON subdivisions(status);

-- ============================================================================
-- 6. LOTS
-- ============================================================================
CREATE TABLE lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  lot_number INTEGER NOT NULL,
  lot_entitlement DECIMAL(10,4) NOT NULL DEFAULT 0,
  lot_liability DECIMAL(10,4) NOT NULL DEFAULT 0,
  UNIQUE(subdivision_id, lot_number)
);

CREATE INDEX idx_lots_subdivision ON lots(subdivision_id);

-- ============================================================================
-- 7. SUBDIVISION MEMBERS
-- ============================================================================
CREATE TABLE subdivision_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id),
  lot_id UUID REFERENCES lots(id),
  role member_role NOT NULL DEFAULT 'lot_owner',
  is_primary_contact BOOLEAN NOT NULL DEFAULT false,
  is_financial BOOLEAN NOT NULL DEFAULT true,
  absent_owner_address TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ
);

CREATE INDEX idx_members_subdivision ON subdivision_members(subdivision_id);
CREATE INDEX idx_members_profile ON subdivision_members(profile_id);
CREATE INDEX idx_members_lot ON subdivision_members(lot_id);

-- ============================================================================
-- 8. STATE COMPLIANCE RULES
-- ============================================================================
CREATE TABLE state_compliance_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  state TEXT NOT NULL DEFAULT 'VIC',
  rule_key TEXT NOT NULL,
  rule_value TEXT NOT NULL,
  description TEXT,
  UNIQUE(state, rule_key)
);

-- ============================================================================
-- 9. INVITATIONS
-- ============================================================================
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES lots(id),
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  role member_role NOT NULL DEFAULT 'lot_owner',
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  reference_number TEXT, -- MSM-INV-YYYY-NNNNNN
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_subdivision ON invitations(subdivision_id);
CREATE INDEX idx_invitations_email ON invitations(email);

-- ============================================================================
-- 10. BUDGET CATEGORIES (seed data — COA mapping)
-- ============================================================================
CREATE TABLE budget_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE, -- COA code e.g. "200100"
  name TEXT NOT NULL,        -- user-facing e.g. "Insurance"
  fund_type fund_type NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- 11. BUDGETS
-- ============================================================================
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL, -- e.g. "2025-2026"
  fund_type fund_type NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status budget_status NOT NULL DEFAULT 'draft',
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(subdivision_id, financial_year, fund_type)
);

CREATE INDEX idx_budgets_subdivision ON budgets(subdivision_id);

-- ============================================================================
-- 12. BUDGET ITEMS
-- ============================================================================
CREATE TABLE budget_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES budget_categories(id),
  description TEXT,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  charge_group_id UUID, -- FK added after charge_groups table created
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budget_items_budget ON budget_items(budget_id);

-- ============================================================================
-- 13. LEVY NOTICES
-- ============================================================================
CREATE TABLE levy_notices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id),
  lot_id UUID NOT NULL REFERENCES lots(id),
  budget_id UUID REFERENCES budgets(id),
  reference_number TEXT UNIQUE NOT NULL, -- MSM-LEV-YYYY-NNNNNN
  fund_type fund_type NOT NULL,
  levy_type levy_type NOT NULL DEFAULT 'regular',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status levy_status NOT NULL DEFAULT 'draft',
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  linked_levy_id UUID REFERENCES levy_notices(id), -- for penalty_interest linking to original
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_levy_notices_subdivision ON levy_notices(subdivision_id);
CREATE INDEX idx_levy_notices_lot ON levy_notices(lot_id);
CREATE INDEX idx_levy_notices_reference ON levy_notices(reference_number);
CREATE INDEX idx_levy_notices_status ON levy_notices(status);
CREATE INDEX idx_levy_notices_due_date ON levy_notices(due_date);

-- ============================================================================
-- 14. PAYMENTS
-- ============================================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id),
  lot_id UUID NOT NULL REFERENCES lots(id),
  levy_notice_id UUID REFERENCES levy_notices(id),
  reference_number TEXT UNIQUE, -- MSM-PAY-YYYY-NNNNNN
  fund_type fund_type NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method payment_method NOT NULL,
  payment_reference TEXT, -- BPAY/EFT reference from bank
  match_confidence match_confidence,
  bank_transaction_id UUID, -- FK added after bank_transactions created
  notes TEXT,
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_subdivision ON payments(subdivision_id);
CREATE INDEX idx_payments_lot ON payments(lot_id);
CREATE INDEX idx_payments_levy ON payments(levy_notice_id);

-- ============================================================================
-- 15. BANK ACCOUNTS
-- ============================================================================
CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  bsb TEXT NOT NULL,
  account_number TEXT NOT NULL,
  fund_type fund_type NOT NULL,
  bank_name TEXT, -- Westpac, CBA, ANZ, NAB, Other
  opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  opening_balance_date DATE,
  -- Basiq integration
  basiq_user_id TEXT,
  basiq_connection_id TEXT,
  last_poll_at TIMESTAMPTZ,
  -- Stripe Connect
  stripe_account_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bank_accounts_subdivision ON bank_accounts(subdivision_id);

-- ============================================================================
-- 16. BANK TRANSACTIONS
-- ============================================================================
CREATE TABLE bank_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  source transaction_source NOT NULL DEFAULT 'manual',
  basiq_transaction_id TEXT UNIQUE,
  transaction_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL, -- positive = credit, negative = debit
  description TEXT,
  balance DECIMAL(12,2),
  category TEXT, -- for debits: Insurance, Utilities, etc.
  match_status TEXT NOT NULL DEFAULT 'unmatched', -- unmatched, auto_matched, manually_matched, excluded
  matched_payment_id UUID REFERENCES payments(id),
  notes TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bank_transactions_account ON bank_transactions(bank_account_id);
CREATE INDEX idx_bank_transactions_date ON bank_transactions(transaction_date);
CREATE INDEX idx_bank_transactions_basiq ON bank_transactions(basiq_transaction_id);
CREATE INDEX idx_bank_transactions_match ON bank_transactions(match_status);

-- Add FK from payments to bank_transactions
ALTER TABLE payments ADD CONSTRAINT fk_payments_bank_transaction
  FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id);

-- ============================================================================
-- 17. BANK RECONCILIATION SESSIONS
-- ============================================================================
CREATE TABLE bank_reconciliation_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  statement_date DATE NOT NULL,
  statement_balance DECIMAL(12,2) NOT NULL,
  calculated_balance DECIMAL(12,2) NOT NULL,
  discrepancy DECIMAL(12,2) GENERATED ALWAYS AS (statement_balance - calculated_balance) STORED,
  reconciled_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 18. MEETINGS
-- ============================================================================
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  reference_number TEXT UNIQUE, -- MSM-MTG-YYYY-NNNNNN
  meeting_type meeting_type NOT NULL,
  title TEXT NOT NULL,
  date_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  virtual_meeting_link TEXT,
  status meeting_status NOT NULL DEFAULT 'draft',
  notice_sent_at TIMESTAMPTZ,
  quorum_met BOOLEAN,
  quorum_percentage DECIMAL(5,2),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meetings_subdivision ON meetings(subdivision_id);
CREATE INDEX idx_meetings_date ON meetings(date_time);

-- ============================================================================
-- 19. AGENDA ITEMS
-- ============================================================================
CREATE TABLE agenda_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  item_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  resolution_type resolution_type NOT NULL DEFAULT 'information',
  motion_text TEXT,
  moved_by UUID REFERENCES profiles(id),
  seconded_by UUID REFERENCES profiles(id),
  result TEXT, -- passed, failed, withdrawn
  vote_for_count DECIMAL(10,4) DEFAULT 0,
  vote_against_count DECIMAL(10,4) DEFAULT 0,
  vote_abstain_count DECIMAL(10,4) DEFAULT 0,
  secret_ballot BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agenda_items_meeting ON agenda_items(meeting_id);

-- ============================================================================
-- 20. VOTES
-- ============================================================================
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agenda_item_id UUID NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id),
  profile_id UUID NOT NULL REFERENCES profiles(id), -- voter (may be proxy holder)
  choice vote_choice NOT NULL,
  vote_weight DECIMAL(10,4) NOT NULL, -- lot_entitlement
  is_proxy BOOLEAN NOT NULL DEFAULT false,
  proxy_holder_id UUID REFERENCES profiles(id),
  conflict_of_interest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agenda_item_id, lot_id)
);

CREATE INDEX idx_votes_agenda ON votes(agenda_item_id);

-- ============================================================================
-- 21. MEETING MINUTES
-- ============================================================================
CREATE TABLE meeting_minutes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) UNIQUE,
  reference_number TEXT UNIQUE, -- MSM-MIN-YYYY-NNNNNN
  content TEXT, -- markdown or rich text
  status TEXT NOT NULL DEFAULT 'draft', -- draft, approved, distributed
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  distributed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 22. PROXIES
-- ============================================================================
CREATE TABLE proxies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id),
  grantor_id UUID NOT NULL REFERENCES profiles(id), -- lot owner giving proxy
  holder_id UUID NOT NULL REFERENCES profiles(id),  -- person receiving proxy
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(meeting_id, lot_id)
);

-- ============================================================================
-- 23. PROXY DIRECTIONS
-- ============================================================================
CREATE TABLE proxy_directions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proxy_id UUID NOT NULL REFERENCES proxies(id) ON DELETE CASCADE,
  agenda_item_id UUID NOT NULL REFERENCES agenda_items(id),
  direction vote_choice, -- NULL means "at discretion"
  UNIQUE(proxy_id, agenda_item_id)
);

-- ============================================================================
-- 24. COMMITTEE NOMINATIONS
-- ============================================================================
CREATE TABLE committee_nominations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  agenda_item_id UUID NOT NULL REFERENCES agenda_items(id),
  nominee_id UUID NOT NULL REFERENCES profiles(id),
  nominated_by UUID REFERENCES profiles(id),
  position TEXT, -- chair, secretary, treasurer, member
  accepted BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 25. INSURANCE POLICIES
-- ============================================================================
CREATE TABLE insurance_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  reference_number TEXT UNIQUE, -- MSM-POL-YYYY-NNNNNN
  policy_type TEXT NOT NULL, -- building, public_liability, contents, workers_comp, office_bearers, fidelity, other
  provider TEXT NOT NULL,
  policy_number TEXT,
  sum_insured DECIMAL(14,2),
  premium DECIMAL(12,2),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, expiring_soon, expired, pending_renewal
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_insurance_subdivision ON insurance_policies(subdivision_id);

-- ============================================================================
-- 26. INSURANCE CLAIMS
-- ============================================================================
CREATE TABLE insurance_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES insurance_policies(id),
  reference_number TEXT UNIQUE, -- MSM-CLM-YYYY-NNNNNN
  description TEXT NOT NULL,
  amount_claimed DECIMAL(12,2),
  amount_received DECIMAL(12,2),
  status TEXT NOT NULL DEFAULT 'lodged', -- lodged, under_assessment, approved, paid, denied
  lodged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 27. MAINTENANCE REQUESTS
-- ============================================================================
CREATE TABLE maintenance_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  reference_number TEXT UNIQUE, -- MSM-MNT-YYYY-NNNNNN
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT,
  priority maintenance_priority NOT NULL DEFAULT 'medium',
  status maintenance_status NOT NULL DEFAULT 'submitted',
  fund_type fund_type,
  estimated_cost DECIMAL(12,2),
  actual_cost DECIMAL(12,2),
  contractor_id UUID, -- FK added after contractors table
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_subdivision ON maintenance_requests(subdivision_id);

-- ============================================================================
-- 28. ANNOUNCEMENTS
-- ============================================================================
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal', -- normal, important, urgent
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_announcements_subdivision ON announcements(subdivision_id);

-- ============================================================================
-- 29. DOCUMENTS
-- ============================================================================
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- minutes, financial, insurance, correspondence, legal, maintenance, other
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  is_confidential BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_subdivision ON documents(subdivision_id);
CREATE INDEX idx_documents_category ON documents(category);

-- ============================================================================
-- 30. COMMUNICATION LOG (evidence trail — ALL outbound comms)
-- ============================================================================
CREATE TABLE communication_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID REFERENCES subdivisions(id),
  recipient_id UUID REFERENCES profiles(id),
  recipient_email TEXT,
  channel communication_channel NOT NULL,
  type TEXT NOT NULL, -- levy_notice, levy_reminder, meeting_notice, announcement, escalation, etc.
  subject TEXT,
  body_preview TEXT,
  status communication_status NOT NULL DEFAULT 'queued',
  external_id TEXT, -- Resend message ID, Twilio SID, etc.
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  related_entity_type TEXT, -- levy_notice, meeting, announcement, escalation
  related_entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comms_subdivision ON communication_log(subdivision_id);
CREATE INDEX idx_comms_recipient ON communication_log(recipient_id);
CREATE INDEX idx_comms_type ON communication_log(type);
CREATE INDEX idx_comms_status ON communication_log(status);

-- ============================================================================
-- 31. COMPLAINTS
-- ============================================================================
CREATE TABLE complaints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  reference_number TEXT UNIQUE, -- MSM-CMP-YYYY-NNNNNN
  category TEXT NOT NULL, -- noise, parking, common_property, pets, renovations, behaviour, financial, other
  description TEXT NOT NULL,
  against_member_id UUID REFERENCES profiles(id),
  status complaint_status NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_complaints_subdivision ON complaints(subdivision_id);

-- ============================================================================
-- 32. NOTIFICATIONS (in-app)
-- ============================================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT, -- in-app URL to navigate to
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_profile ON notifications(profile_id);
CREATE INDEX idx_notifications_read ON notifications(read);

-- ============================================================================
-- 33. AUDIT LOG (immutable — INSERT only)
-- ============================================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id),
  subdivision_id UUID REFERENCES subdivisions(id),
  action TEXT NOT NULL, -- create, update, delete, anonymise, approve, distribute, etc.
  entity_type TEXT NOT NULL, -- profile, subdivision, budget, levy_notice, payment, meeting, etc.
  entity_id UUID,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB, -- extra context
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_subdivision ON audit_log(subdivision_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- ============================================================================
-- 34. ESCALATION WORKFLOWS
-- ============================================================================
CREATE TABLE escalation_workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID REFERENCES subdivisions(id),
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 35. ESCALATION WORKFLOW STEPS
-- ============================================================================
CREATE TABLE escalation_workflow_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES escalation_workflows(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  channel communication_channel NOT NULL DEFAULT 'email',
  days_after_overdue INTEGER NOT NULL,
  template_key TEXT NOT NULL, -- email template identifier
  requires_consent BOOLEAN NOT NULL DEFAULT false,
  fallback_channel communication_channel DEFAULT 'email',
  enabled BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(workflow_id, step_number)
);

-- ============================================================================
-- 36. ESCALATION INSTANCES
-- ============================================================================
CREATE TABLE escalation_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  levy_notice_id UUID NOT NULL REFERENCES levy_notices(id),
  workflow_id UUID NOT NULL REFERENCES escalation_workflows(id),
  reference_number TEXT UNIQUE, -- MSM-ESC-YYYY-NNNNNN
  current_step INTEGER NOT NULL DEFAULT 1,
  status escalation_status NOT NULL DEFAULT 'active',
  next_action_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  paused_by UUID REFERENCES profiles(id),
  paused_reason TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escalation_levy ON escalation_instances(levy_notice_id);
CREATE INDEX idx_escalation_status ON escalation_instances(status);
CREATE INDEX idx_escalation_next ON escalation_instances(next_action_at);

-- ============================================================================
-- 37. CHARGE GROUPS
-- ============================================================================
CREATE TABLE charge_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from budget_items
ALTER TABLE budget_items ADD CONSTRAINT fk_budget_items_charge_group
  FOREIGN KEY (charge_group_id) REFERENCES charge_groups(id);

-- ============================================================================
-- 38. CHARGE GROUP LOTS
-- ============================================================================
CREATE TABLE charge_group_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  charge_group_id UUID NOT NULL REFERENCES charge_groups(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  UNIQUE(charge_group_id, lot_id)
);

-- ============================================================================
-- 39. CONTRACTORS
-- ============================================================================
CREATE TABLE contractors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  trade TEXT, -- plumbing, electrical, carpentry, etc.
  abn TEXT,
  insurance_expiry DATE,
  notes TEXT,
  status contractor_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from maintenance_requests
ALTER TABLE maintenance_requests ADD CONSTRAINT fk_maintenance_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- ============================================================================
-- 40. PAYMENT PLANS
-- ============================================================================
CREATE TABLE payment_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  levy_notice_id UUID NOT NULL REFERENCES levy_notices(id),
  lot_id UUID NOT NULL REFERENCES lots(id),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id),
  total_amount DECIMAL(12,2) NOT NULL,
  installment_amount DECIMAL(12,2) NOT NULL,
  installment_frequency TEXT NOT NULL, -- weekly, fortnightly, monthly
  start_date DATE NOT NULL,
  end_date DATE,
  status payment_plan_status NOT NULL DEFAULT 'active',
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 41. RESERVE FUND ITEMS (10-year capital works plan)
-- ============================================================================
CREATE TABLE reserve_fund_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  estimated_cost DECIMAL(12,2) NOT NULL,
  estimated_year INTEGER NOT NULL,
  priority reserve_priority NOT NULL DEFAULT 'medium',
  status reserve_status NOT NULL DEFAULT 'planned',
  actual_cost DECIMAL(12,2),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 42. CHAT MESSAGES
-- ============================================================================
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_chat_messages_subdivision ON chat_messages(subdivision_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);

-- ============================================================================
-- 43. CHAT ATTACHMENTS
-- ============================================================================
CREATE TABLE chat_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 44. CHAT READ STATUS
-- ============================================================================
CREATE TABLE chat_read_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdivision_id UUID NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(subdivision_id, profile_id)
);

-- ============================================================================
-- 45. LOT FINANCIAL SUMMARY (MATERIALIZED VIEW)
-- ============================================================================
CREATE MATERIALIZED VIEW lot_financial_summary AS
SELECT
  l.id AS lot_id,
  l.subdivision_id,
  l.lot_number,
  COALESCE(SUM(ln.amount) FILTER (WHERE ln.status != 'draft'), 0) AS total_levied,
  COALESCE(SUM(p.amount), 0) AS total_paid,
  COALESCE(SUM(ln.amount) FILTER (WHERE ln.status != 'draft'), 0) -
    COALESCE(SUM(p.amount), 0) AS balance_owing,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM levy_notices ln2
      WHERE ln2.lot_id = l.id AND ln2.status = 'overdue'
    ) THEN false
    ELSE true
  END AS is_financial
FROM lots l
LEFT JOIN levy_notices ln ON ln.lot_id = l.id AND ln.status != 'draft'
LEFT JOIN payments p ON p.lot_id = l.id
GROUP BY l.id, l.subdivision_id, l.lot_number;

CREATE UNIQUE INDEX idx_lot_financial_summary_lot ON lot_financial_summary(lot_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-calculate OC tier based on lot count
CREATE OR REPLACE FUNCTION calculate_oc_tier()
RETURNS TRIGGER AS $$
BEGIN
  NEW.oc_tier := CASE
    WHEN NEW.total_lots <= 2 THEN 5
    WHEN NEW.total_lots <= 9 THEN 4
    WHEN NEW.total_lots <= 50 THEN 3
    WHEN NEW.total_lots <= 100 THEN 2
    ELSE 1
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_oc_tier
  BEFORE INSERT OR UPDATE OF total_lots ON subdivisions
  FOR EACH ROW EXECUTE FUNCTION calculate_oc_tier();

-- Auto-calculate next AGM due
CREATE OR REPLACE FUNCTION calculate_next_agm_due()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_agm_date IS NOT NULL THEN
    NEW.next_agm_due := NEW.last_agm_date + INTERVAL '15 months';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_next_agm_due
  BEFORE INSERT OR UPDATE OF last_agm_date ON subdivisions
  FOR EACH ROW EXECUTE FUNCTION calculate_next_agm_due();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_updated_at_management_companies BEFORE UPDATE ON management_companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_profiles BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_subdivisions BEFORE UPDATE ON subdivisions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_budgets BEFORE UPDATE ON budgets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_levy_notices BEFORE UPDATE ON levy_notices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_meetings BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_meeting_minutes BEFORE UPDATE ON meeting_minutes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_maintenance_requests BEFORE UPDATE ON maintenance_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_complaints BEFORE UPDATE ON complaints FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_escalation_instances BEFORE UPDATE ON escalation_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_charge_groups BEFORE UPDATE ON charge_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE management_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE subdivisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE subdivision_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE levy_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_group_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserve_fund_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_read_status ENABLE ROW LEVEL SECURITY;

-- NOTE: RLS policies use service_role key for server actions.
-- Actual per-user policies will reference a helper function:
--   get_current_profile_id() — returns the authenticated user's profile.id
--   get_current_role() — returns the user's profile.role
--   get_current_company_id() — returns the user's management_company_id
-- These are created in the application layer (Step 1.2) and used by RLS policies.
-- For MVP, server actions use supabase service_role client (bypasses RLS).
-- RLS policies below are the INTENDED enforcement for when we add client-side queries.

-- Example policy pattern (applied per table in Step 1.1):
-- CREATE POLICY "super_admin_full_access" ON subdivisions FOR ALL
--   USING (get_current_role() = 'super_admin');
-- CREATE POLICY "strata_manager_company_access" ON subdivisions FOR ALL
--   USING (management_company_id = get_current_company_id());
-- CREATE POLICY "lot_owner_member_read" ON subdivisions FOR SELECT
--   USING (id IN (SELECT subdivision_id FROM subdivision_members WHERE profile_id = get_current_profile_id()));

-- Audit log: INSERT only, no UPDATE/DELETE
CREATE POLICY "audit_log_insert_only" ON audit_log FOR INSERT WITH CHECK (true);
CREATE POLICY "audit_log_no_update" ON audit_log FOR UPDATE USING (false);
CREATE POLICY "audit_log_no_delete" ON audit_log FOR DELETE USING (false);

-- ============================================================================
-- SEED DATA — Victorian Compliance Rules
-- ============================================================================
INSERT INTO state_compliance_rules (state, rule_key, rule_value, description) VALUES
  ('VIC', 'agm_notice_days', '14', 'Minimum days notice before AGM'),
  ('VIC', 'agm_max_interval_months', '15', 'Maximum months between AGMs'),
  ('VIC', 'levy_notice_min_days', '28', 'Minimum days notice before levy due date'),
  ('VIC', 'levy_interest_cap_monthly', '2.5', 'Maximum simple interest rate per month on overdue levies'),
  ('VIC', 'proxy_limit_small_scheme', '1', 'Max proxies per holder for schemes with 20 or fewer lots'),
  ('VIC', 'proxy_limit_large_scheme_pct', '5', 'Max proxies as percentage for schemes with more than 20 lots'),
  ('VIC', 'committee_min', '3', 'Minimum committee members'),
  ('VIC', 'committee_max', '7', 'Maximum committee members'),
  ('VIC', 'committee_max_extended', '12', 'Maximum committee members by special resolution'),
  ('VIC', 'special_resolution_threshold', '75', 'Percentage required for special resolution'),
  ('VIC', 'ordinary_resolution_threshold', '50', 'Percentage required for ordinary resolution'),
  ('VIC', 'meeting_quorum_pct', '50', 'Quorum percentage of lot entitlements'),
  ('VIC', 'insurance_public_liability_min', '20000000', 'Minimum public liability insurance in dollars'),
  ('VIC', 'building_valuation_cycle_years', '5', 'Years between building valuations');

-- ============================================================================
-- SEED DATA — Budget Categories (COA codes)
-- ============================================================================
INSERT INTO budget_categories (code, name, fund_type, sort_order) VALUES
  -- Administrative Fund
  ('200100', 'Insurance', 'administrative', 1),
  ('200200', 'Utilities', 'administrative', 2),
  ('200300', 'Cleaning', 'administrative', 3),
  ('200400', 'Gardening', 'administrative', 4),
  ('200500', 'Repairs & Maintenance', 'administrative', 5),
  ('200600', 'Management Fee', 'administrative', 6),
  ('200650', 'Payment Processing Fees', 'administrative', 7),
  ('200700', 'Audit', 'administrative', 8),
  ('200800', 'Legal', 'administrative', 9),
  ('200900', 'Administration', 'administrative', 10),
  ('201000', 'Fire Safety', 'administrative', 11),
  ('201100', 'Pest Control', 'administrative', 12),
  ('201200', 'Lift Maintenance', 'administrative', 13),
  ('209900', 'Other', 'administrative', 99),
  -- Capital Works Fund
  ('300100', 'Building Works', 'capital_works', 1),
  ('300200', 'Painting', 'capital_works', 2),
  ('300300', 'Roofing', 'capital_works', 3),
  ('300400', 'Plumbing', 'capital_works', 4),
  ('300500', 'Electrical', 'capital_works', 5),
  ('300600', 'Fencing & Gates', 'capital_works', 6),
  ('300700', 'Paving & Driveways', 'capital_works', 7),
  ('300800', 'Pool/Gym Equipment', 'capital_works', 8),
  ('309900', 'Other Capital', 'capital_works', 99);

-- ============================================================================
-- SEED DATA — Default Escalation Workflow
-- ============================================================================
INSERT INTO escalation_workflows (id, name, description, is_default)
VALUES (uuid_generate_v4(), 'Standard Overdue Levy', '3-step email escalation for overdue levies', true);

INSERT INTO escalation_workflow_steps (workflow_id, step_number, channel, days_after_overdue, template_key)
SELECT id, 1, 'email'::communication_channel, 14, 'levy_reminder_friendly' FROM escalation_workflows WHERE is_default = true
UNION ALL
SELECT id, 2, 'email'::communication_channel, 28, 'levy_reminder_firm' FROM escalation_workflows WHERE is_default = true
UNION ALL
SELECT id, 3, 'email'::communication_channel, 42, 'levy_final_notice' FROM escalation_workflows WHERE is_default = true;

-- ============================================================================
-- HELPER: Refresh lot_financial_summary
-- Call this after any levy/payment mutation
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_lot_financial_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY lot_financial_summary;
END;
$$ LANGUAGE plpgsql;
