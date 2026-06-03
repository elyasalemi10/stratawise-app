import { z } from "zod";

// ─── Frequency ──────────────────────────────────────────────────────────────
export const RECURRING_FREQUENCIES = [
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "half_yearly",
  "annually",
] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Every 6 months",
  annually: "Annually",
};

export const RECURRING_FREQUENCY_OPTIONS = RECURRING_FREQUENCIES.map((value) => ({
  value,
  label: RECURRING_FREQUENCY_LABELS[value],
}));

// ─── Fund (matches the fund_type DB enum) ────────────────────────────────────
export const RECURRING_FUND_TYPES = ["operating", "capital_works", "maintenance_plan"] as const;
export type RecurringFundType = (typeof RECURRING_FUND_TYPES)[number];

export const RECURRING_FUND_LABELS: Record<RecurringFundType, string> = {
  operating: "Administrative fund",
  capital_works: "Capital works fund",
  maintenance_plan: "Maintenance plan fund",
};

export const RECURRING_FUND_OPTIONS = RECURRING_FUND_TYPES.map((value) => ({
  value,
  label: RECURRING_FUND_LABELS[value],
}));

// ─── Status ─────────────────────────────────────────────────────────────────
export const RECURRING_JOB_STATUSES = ["active", "paused"] as const;
export type RecurringJobStatus = (typeof RECURRING_JOB_STATUSES)[number];

export const RECURRING_JOB_STATUS_LABELS: Record<RecurringJobStatus, string> = {
  active: "Active",
  paused: "Paused",
};

// ─── Notify scope ───────────────────────────────────────────────────────────
export const RECURRING_NOTIFY_SCOPES = ["all_owners", "specific", "none"] as const;
export type RecurringNotifyScope = (typeof RECURRING_NOTIFY_SCOPES)[number];

export const RECURRING_NOTIFY_SCOPE_LABELS: Record<RecurringNotifyScope, string> = {
  all_owners: "All lot owners",
  specific: "Specific lot owners",
  none: "Don't notify owners",
};

// ─── Input schema ───────────────────────────────────────────────────────────
export const recurringJobSchema = z.object({
  oc_id: z.string().uuid("Pick an Owners Corporation"),
  title: z.string().trim().min(1, "Job title is required").max(200),
  trade: z.string().trim().max(60).nullable().optional(),
  contractor_id: z.string().uuid().nullable().optional(),
  frequency: z.enum(RECURRING_FREQUENCIES),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().nullable().optional(), // null = ongoing
  lead_time_days: z.number().int().min(0).max(120).default(0),
  notify_scope: z.enum(RECURRING_NOTIFY_SCOPES).default("none"),
  notify_lot_owner_ids: z.array(z.string().uuid()).default([]),
  scope: z.string().trim().max(4000).nullable().optional(),
  cost_per_visit: z.number().nonnegative().nullable().optional(),
  fund_type: z.enum(RECURRING_FUND_TYPES).nullable().optional(),
  approval_reference: z.string().trim().max(120).nullable().optional(),
  status: z.enum(RECURRING_JOB_STATUSES).default("active"),
});

export type RecurringJobInput = z.input<typeof recurringJobSchema>;

export interface RecurringJobRecord {
  id: string;
  oc_id: string;
  oc_name: string | null;
  oc_code: string | null;
  reference_number: string | null;
  title: string;
  trade: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
  frequency: RecurringFrequency;
  start_date: string;
  end_date: string | null;
  lead_time_days: number;
  notify_scope: RecurringNotifyScope;
  scope: string | null;
  cost_per_visit: number | null;
  fund_type: RecurringFundType | null;
  approval_reference: string | null;
  status: RecurringJobStatus;
  next_occurrence_date: string | null;
  created_at: string;
}
