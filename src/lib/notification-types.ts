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
  "insurance_expiring",
  "agm_due",
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


// ─── Grouping + copy for the settings table ──────────────────────────────
//
// The preferences screen was a flat list of eighteen switches, which is a
// wall you scan rather than read. Grouped by what the notification is ABOUT,
// each row gets a one-line description, so a manager deciding whether to
// mute something knows what they are muting.
//
// Order matters: groups render in this order and rows in the order listed.

export interface NotificationTypeMeta {
  type: NotificationType;
  label: string;
  description: string;
}

export const NOTIFICATION_GROUPS: Array<{
  label: string;
  items: NotificationTypeMeta[];
}> = [
  {
    label: "Levies & payments",
    items: [
      { type: "levy_issued", label: "Levy issued", description: "A new levy notice has been issued for a lot." },
      { type: "payment_received", label: "Payment received", description: "A payment has been matched against a levy." },
      { type: "overdue_reminder", label: "Overdue reminder", description: "A levy has passed its due date." },
      { type: "second_reminder", label: "Second reminder", description: "A levy is still unpaid after the first reminder." },
      { type: "levy_final_notice", label: "Final notice", description: "The last step before an unpaid levy goes to VCAT." },
      { type: "escalation_step", label: "Follow-up step sent", description: "An automated follow-up has gone out to an owner." },
      { type: "levy_csv_reminder", label: "Bank statement reminder", description: "A levy run is due and no recent statement has been imported." },
    ],
  },
  {
    label: "Meetings",
    items: [
      { type: "meeting_notice", label: "Meeting notice", description: "A meeting has been scheduled and its notice issued." },
      { type: "meeting_minutes", label: "Meeting minutes", description: "Minutes have been published for a past meeting." },
      { type: "agm_due", label: "AGM due", description: "Twelve months have passed since the last annual general meeting." },
    ],
  },
  {
    label: "Property & compliance",
    items: [
      { type: "maintenance_update", label: "Maintenance update", description: "A recurring job is due, or its status changed." },
      { type: "insurance_expiring", label: "Insurance expiring", description: "A policy or contractor certificate expires within 30 days." },
      { type: "document_uploaded", label: "Document uploaded", description: "A document has been added to an Owners Corporation." },
    ],
  },
  {
    label: "Requests & claims",
    items: [
      { type: "new_claim_submitted", label: "New claim submitted", description: "An owner has lodged a claim." },
      { type: "claim_matched", label: "Claim matched", description: "A claim has been matched to a payment." },
      { type: "claim_rejected", label: "Claim rejected", description: "A claim has been declined." },
      { type: "complaint_update", label: "Complaint update", description: "A complaint has changed status." },
      { type: "announcement", label: "Announcement", description: "A manager has posted an announcement." },
    ],
  },
];
