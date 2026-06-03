// Framework-agnostic helpers for the levy follow-up engine. No "use server",
// no next/cache, no auth , safe to import from the Trigger.dev cron AND from
// server actions. Takes an explicit Supabase client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FollowupStep, FollowupWorkflow } from "@/lib/validations/escalation";

// Resolve the follow-up workflow that applies to an OC: its own override if it
// has one, otherwise the management company's default. Returns the workflow +
// ordered steps, or null if nothing is set up.
export async function resolveWorkflowForOC(
  supabase: SupabaseClient,
  ocId: string,
  companyId: string | null,
): Promise<FollowupWorkflow | null> {
  // OC override first.
  const { data: ocWf } = await supabase
    .from("escalation_workflows")
    .select("id, management_company_id, oc_id, name, is_default")
    .eq("oc_id", ocId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  let wf = ocWf as Omit<FollowupWorkflow, "steps"> | null;
  if (!wf && companyId) {
    const { data: defWf } = await supabase
      .from("escalation_workflows")
      .select("id, management_company_id, oc_id, name, is_default")
      .eq("management_company_id", companyId)
      .is("oc_id", null)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    wf = defWf as Omit<FollowupWorkflow, "steps"> | null;
  }
  if (!wf) return null;

  const { data: steps } = await supabase
    .from("escalation_workflow_steps")
    .select("id, step_number, step_type, label, days_after_overdue, subject, body, enabled")
    .eq("workflow_id", wf.id)
    .order("step_number", { ascending: true });

  return { ...wf, steps: (steps ?? []) as FollowupStep[] };
}

// Substitute {{tokens}} in a subject/body. Unknown tokens are left intact.
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (full, key: string) => {
    const v = vars[key.toLowerCase()];
    return v != null ? v : full;
  });
}

// Simple penalty interest on overdue principal. The OC stores a monthly rate
// (VIC cap 2.5%/month); we accrue per day on a 30-day-month basis from the due
// date after any grace period. Returns dollars accrued + the daily figure.
// This is an estimate for a draft VCAT pack; the manager verifies before filing.
export function computeInterest(opts: {
  principal: number;
  dueDate: string;
  asOf: string;
  monthlyRatePct: number;
  graceDays: number;
}): { accrued: number; dailyRate: number; daysCharged: number } {
  const { principal, dueDate, asOf, monthlyRatePct, graceDays } = opts;
  if (principal <= 0 || monthlyRatePct <= 0) return { accrued: 0, dailyRate: 0, daysCharged: 0 };
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00.000Z`).getTime();
  const at = new Date(`${asOf.slice(0, 10)}T00:00:00.000Z`).getTime();
  const totalDays = Math.floor((at - due) / 86_400_000);
  const daysCharged = Math.max(0, totalDays - (graceDays || 0));
  const dailyRate = (principal * (monthlyRatePct / 100)) / 30;
  const accrued = Math.round(dailyRate * daysCharged * 100) / 100;
  return { accrued, dailyRate: Math.round(dailyRate * 100) / 100, daysCharged };
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
