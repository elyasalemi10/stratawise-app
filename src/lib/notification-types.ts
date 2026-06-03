// Plain-data constants used by both the framework-agnostic
// /lib/notifications.ts emit helpers (server-side) AND the
// /settings/notifications-tab.tsx UI (client-side). Lives in its own file
// so the client bundle can import these without dragging in
// /lib/email.ts → google-auth-library (which Next 16 doesn't tolerate in
// the client-SSR graph).
//
// Keep this file dependency-free: no Supabase, no email, no Node-only APIs.

export const NOTIFICATION_TYPES = [
  "levy_issued",
  "payment_received",
  "overdue_reminder",
  "second_reminder",
  "levy_final_notice",
  "claim_matched",
  "claim_rejected",
  "new_claim_submitted",
  "meeting_notice",
  "meeting_minutes",
  "maintenance_update",
  "announcement",
  "complaint_update",
  "escalation_step",
  "document_uploaded",
  "levy_csv_reminder",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Statutory non-opt-outable notification types. Currently only the levy
// final notice , owner-facing PP6-C-1 types (overdue, payment_received,
// claim_matched, claim_rejected) are all opt-outable.
export const MANDATORY_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  "levy_final_notice",
]);

// PP6-D-B: managerial-event types. In-app channel is non-toggleable for
// these , operational signals must always reach the manager's inbox even
// if email is opted out. Email channel remains opt-outable.
export const MANAGERIAL_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  "new_claim_submitted",
]);
