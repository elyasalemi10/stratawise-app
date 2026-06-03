import { z } from "zod";

// ─── Follow-up workflow types ───────────────────────────────────────────────

export const FOLLOWUP_STEP_TYPES = ["email", "vcat"] as const;
export type FollowupStepType = (typeof FOLLOWUP_STEP_TYPES)[number];

export interface FollowupStep {
  id: string;
  step_number: number;
  step_type: FollowupStepType;
  label: string | null;
  days_after_overdue: number;
  subject: string | null;
  body: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  enabled: boolean;
}

export interface FollowupWorkflow {
  id: string;
  management_company_id: string | null;
  oc_id: string | null;
  name: string;
  is_default: boolean;
  steps: FollowupStep[];
}

// Merge fields available in step subjects/bodies. Shown as a legend under the
// editor; substituted at send time by renderTemplate().
// Each field carries a distinct colour so chips are visually distinguishable
// in the editor + palette.
export const MERGE_FIELDS: Array<{ token: string; label: string; color: string }> = [
  { token: "{{owner_name}}", label: "Owner name", color: "#2563eb" },
  { token: "{{oc_name}}", label: "OC name", color: "#7c3aed" },
  { token: "{{reference}}", label: "Levy reference", color: "#0891b2" },
  { token: "{{amount_due}}", label: "Amount outstanding", color: "#16a34a" },
  { token: "{{due_date}}", label: "Due date", color: "#d97706" },
  { token: "{{days_overdue}}", label: "Days overdue", color: "#dc2626" },
  { token: "{{interest_accrued}}", label: "Interest accrued", color: "#db2777" },
  { token: "{{daily_interest}}", label: "Daily interest", color: "#0d9488" },
];

export const MERGE_FIELD_COLORS: Record<string, string> = Object.fromEntries(
  MERGE_FIELDS.map((f) => [f.token, f.color]),
);

// One step in an update payload. vcat steps carry no email body.
export const followupStepInputSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().max(120).nullable().optional(),
  days_after_overdue: z.number().int().min(0).max(365),
  subject: z.string().trim().max(300).nullable().optional(),
  body: z.string().trim().max(8000).nullable().optional(),
  attachment_url: z.string().trim().nullable().optional(),
  attachment_name: z.string().trim().max(200).nullable().optional(),
  enabled: z.boolean(),
});

export const updateFollowupStepsSchema = z.object({
  workflow_id: z.string().uuid(),
  steps: z.array(followupStepInputSchema).min(1).max(20),
});
export type UpdateFollowupStepsInput = z.input<typeof updateFollowupStepsSchema>;
