-- ============================================================================
-- Notifications / Inbox system
-- Run this in Supabase SQL editor
-- ============================================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subdivision_id UUID REFERENCES subdivisions(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- levy_issued, insurance_expiry, payment_received, meeting_notice, invitation, system
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT, -- URL path to relevant page, e.g. /subdivisions/{id}/my-levies
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX idx_notifications_unread ON notifications(recipient_id, read_at) WHERE read_at IS NULL;
