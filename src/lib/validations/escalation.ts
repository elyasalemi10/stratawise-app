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
export const MERGE_FIELDS: Array<{ token: string; label: string }> = [
  { token: "{{owner_name}}", label: "Owner name" },
  { token: "{{oc_name}}", label: "OC name" },
  { token: "{{reference}}", label: "Levy reference" },
  { token: "{{amount_due}}", label: "Amount outstanding" },
  { token: "{{due_date}}", label: "Due date" },
  { token: "{{days_overdue}}", label: "Days overdue" },
  { token: "{{interest_accrued}}", label: "Interest accrued" },
  { token: "{{daily_interest}}", label: "Daily interest" },
];

// One step in an update payload. vcat steps carry no email body.
export const followupStepInputSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().max(120).nullable().optional(),
  days_after_overdue: z.number().int().min(0).max(365),
  subject: z.string().trim().max(300).nullable().optional(),
  body: z.string().trim().max(8000).nullable().optional(),
  enabled: z.boolean(),
});

export const updateFollowupStepsSchema = z.object({
  workflow_id: z.string().uuid(),
  steps: z.array(followupStepInputSchema).min(1).max(20),
});
export type UpdateFollowupStepsInput = z.input<typeof updateFollowupStepsSchema>;
