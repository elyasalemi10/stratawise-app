"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { resolveWorkflowForOC } from "@/lib/escalation/helpers";
import {
  updateFollowupStepsSchema,
  type UpdateFollowupStepsInput,
  type FollowupStep,
  type FollowupWorkflow,
} from "@/lib/validations/escalation";

async function loadWorkflow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workflowId: string,
): Promise<FollowupWorkflow | null> {
  const { data: wf } = await supabase
    .from("escalation_workflows")
    .select("id, management_company_id, oc_id, name, is_default")
    .eq("id", workflowId)
    .maybeSingle();
  if (!wf) return null;
  const { data: steps } = await supabase
    .from("escalation_workflow_steps")
    .select("id, step_number, step_type, label, days_after_overdue, subject, body, attachment_url, attachment_name, enabled")
    .eq("workflow_id", workflowId)
    .order("step_number", { ascending: true });
  return { ...wf, steps: (steps ?? []) as FollowupStep[] };
}

// Company default workflow (seeds one if somehow missing).
export async function getCompanyFollowup(): Promise<FollowupWorkflow | null> {
  const profile = await requireCompanyRole();
  if (!profile.management_company_id) return null;
  const supabase = createServerClient();

  let { data: wf } = await supabase
    .from("escalation_workflows")
    .select("id, management_company_id, oc_id, name, is_default")
    .eq("management_company_id", profile.management_company_id)
    .is("oc_id", null)
    .eq("is_default", true)
    .maybeSingle();

  if (!wf) {
    const { data: seeded } = await supabase.rpc("seed_default_followup_workflow", { p_company: profile.management_company_id });
    const id = typeof seeded === "string" ? seeded : null;
    if (id) {
      const r = await supabase.from("escalation_workflows").select("id, management_company_id, oc_id, name, is_default").eq("id", id).maybeSingle();
      wf = r.data;
    }
  }
  if (!wf) return null;
  return await loadWorkflow(supabase, wf.id);
}

// Resolved workflow for an OC + whether it's an override or the company default.
export async function getFollowupForOC(ocId: string): Promise<{ mode: "default" | "override"; workflow: FollowupWorkflow | null }> {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data: ocWf } = await supabase
    .from("escalation_workflows")
    .select("id")
    .eq("oc_id", ocId)
    .maybeSingle();
  const workflow = await resolveWorkflowForOC(supabase, ocId, profile.management_company_id);
  return { mode: ocWf ? "override" : "default", workflow };
}

export async function updateFollowupSteps(input: UpdateFollowupStepsInput): Promise<{ error?: string }> {
  const parsed = updateFollowupStepsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: wf } = await supabase
    .from("escalation_workflows")
    .select("id, management_company_id, oc_id")
    .eq("id", parsed.data.workflow_id)
    .maybeSingle();
  if (!wf) return { error: "Workflow not found" };
  // Authorise: company default they own, or an OC override they can access.
  if (wf.oc_id) {
    await requireOCAccess(wf.oc_id as string);
  } else if (wf.management_company_id !== profile.management_company_id) {
    return { error: "Not allowed" };
  }

  for (const step of parsed.data.steps) {
    await supabase
      .from("escalation_workflow_steps")
      .update({
        label: step.label?.trim() || null,
        days_after_overdue: step.days_after_overdue,
        subject: step.subject?.trim() || null,
        body: step.body?.trim() || null,
        attachment_url: step.attachment_url?.trim() || null,
        attachment_name: step.attachment_name?.trim() || null,
        enabled: step.enabled,
      })
      .eq("id", step.id)
      .eq("workflow_id", parsed.data.workflow_id);
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: wf.oc_id ?? null,
    action: "update",
    entity_type: "escalation_workflow",
    entity_id: parsed.data.workflow_id,
  });

  revalidatePath("/settings");
  if (wf.oc_id) revalidatePath("/ocs/[ocCode]/settings", "page");
  return {};
}

// Clone the company default into an OC-scoped override (the OC then owns it).
export async function overrideFollowupForOC(ocId: string): Promise<{ error?: string }> {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data: existing } = await supabase.from("escalation_workflows").select("id").eq("oc_id", ocId).maybeSingle();
  if (existing) return {}; // already overridden

  const base = await resolveWorkflowForOC(supabase, ocId, profile.management_company_id);
  if (!base) return { error: "No company default to copy" };

  const { data: newWf, error } = await supabase
    .from("escalation_workflows")
    .insert({
      management_company_id: profile.management_company_id,
      oc_id: ocId,
      name: base.name,
      description: "OC-specific follow-up override",
      is_default: false,
    })
    .select("id")
    .single();
  if (error || !newWf) return { error: error?.message ?? "Could not create override" };

  if (base.steps.length > 0) {
    await supabase.from("escalation_workflow_steps").insert(
      base.steps.map((s) => ({
        workflow_id: newWf.id,
        step_number: s.step_number,
        step_type: s.step_type,
        label: s.label,
        days_after_overdue: s.days_after_overdue,
        subject: s.subject,
        body: s.body,
        enabled: s.enabled,
      })),
    );
  }

  await supabase.from("audit_log").insert({ profile_id: profile.id, oc_id: ocId, action: "create", entity_type: "escalation_workflow", entity_id: newWf.id });
  revalidatePath("/ocs/[ocCode]/settings", "page");
  return {};
}

// Delete an OC override so it reverts to following the company default.
export async function revertFollowupForOC(ocId: string): Promise<{ error?: string }> {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { error } = await supabase.from("escalation_workflows").delete().eq("oc_id", ocId);
  if (error) return { error: error.message };
  await supabase.from("audit_log").insert({ profile_id: profile.id, oc_id: ocId, action: "delete", entity_type: "escalation_workflow" });
  revalidatePath("/ocs/[ocCode]/settings", "page");
  return {};
}
