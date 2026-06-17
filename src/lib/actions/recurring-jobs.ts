"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import {
  recurringJobSchema,
  type RecurringJobInput,
  type RecurringJobRecord,
} from "@/lib/validations/recurring-jobs";
import { computeNextOccurrence, advance, anchorFromStart } from "@/lib/recurring-jobs-helpers";
import type { RecurringFrequency } from "@/lib/validations/recurring-jobs";

// Recurring maintenance jobs are managed company-wide but each job runs for a
// single OC (so owner notifications resolve correctly). All reads scope by the
// firm's management_company_id; the chosen OC is access-checked on write.

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface OCSelectOption {
  id: string;
  name: string;
  short_code: string;
}

export async function getCompanyOCsForSelect(): Promise<OCSelectOption[]> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();
  const { data } = await supabase
    .from("owners_corporations")
    .select("id, name, short_code")
    .eq("management_company_id", profile.management_company_id)
    .order("name", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? "OC",
    short_code: (r.short_code as string) ?? "",
  }));
}

export interface NotifyOwnerOption {
  lot_owner_id: string;
  name: string;
  email: string;
  lot_label: string;
}

// Email-eligible lot owners for an OC: have an email AND aren't post-only.
// Post recipients are excluded , chasing physical mail is too slow to be a
// useful notification channel.
export async function getOCNotifyOwners(ocId: string): Promise<NotifyOwnerOption[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { data } = await supabase
    .from("lot_owners")
    .select("id, name, email, delivery_preference, lots!inner(oc_id, lot_number, unit_number)")
    .eq("lots.oc_id", ocId)
    .not("email", "is", null)
    .neq("delivery_preference", "post");

  return (data ?? []).map((r) => {
    const lot = (r as { lots: { lot_number?: number; unit_number?: string | null } | { lot_number?: number; unit_number?: string | null }[] }).lots;
    const lotRow = Array.isArray(lot) ? lot[0] : lot;
    const lotLabel = lotRow
      ? `Lot ${lotRow.lot_number}${lotRow.unit_number ? ` (Unit ${lotRow.unit_number})` : ""}`
      : "";
    return {
      lot_owner_id: r.id as string,
      name: (r.name as string) ?? "Owner",
      email: r.email as string,
      lot_label: lotLabel,
    };
  });
}

const RECURRING_JOB_SELECT =
  "id, oc_id, reference_number, title, trade, contractor_id, frequency, start_date, end_date, lead_time_days, notify_scope, scope, cost_per_visit, fund_type, approval_reference, status, next_occurrence_date, created_at, owners_corporations(name, short_code), contractors(business_name)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJobRow(row: any): RecurringJobRecord {
  const oc = (row as { owners_corporations: { name?: string; short_code?: string } | null }).owners_corporations;
  const contractor = (row as { contractors: { business_name?: string } | null }).contractors;
  return {
    id: row.id as string,
    oc_id: row.oc_id as string,
    oc_name: oc?.name ?? null,
    oc_code: oc?.short_code ?? null,
    reference_number: (row.reference_number as string) ?? null,
    title: row.title as string,
    trade: (row.trade as string) ?? null,
    contractor_id: (row.contractor_id as string) ?? null,
    contractor_name: contractor?.business_name ?? null,
    frequency: row.frequency as RecurringJobRecord["frequency"],
    start_date: row.start_date as string,
    end_date: (row.end_date as string) ?? null,
    lead_time_days: (row.lead_time_days as number) ?? 0,
    notify_scope: (row.notify_scope as RecurringJobRecord["notify_scope"]) ?? "none",
    scope: (row.scope as string) ?? null,
    cost_per_visit: row.cost_per_visit != null ? Number(row.cost_per_visit) : null,
    fund_type: (row.fund_type as RecurringJobRecord["fund_type"]) ?? null,
    approval_reference: (row.approval_reference as string) ?? null,
    status: (row.status as RecurringJobRecord["status"]) ?? "active",
    next_occurrence_date: (row.next_occurrence_date as string) ?? null,
    created_at: row.created_at as string,
  } satisfies RecurringJobRecord;
}

// Per-OC list (for the OC dashboard maintenance page).
export async function getRecurringJobsForOC(ocId: string): Promise<RecurringJobRecord[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { data } = await supabase
    .from("recurring_jobs")
    .select(RECURRING_JOB_SELECT)
    .eq("oc_id", ocId)
    .order("next_occurrence_date", { ascending: true, nullsFirst: false });
  return (data ?? []).map(mapJobRow);
}

export async function getRecurringJobs(): Promise<RecurringJobRecord[]> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data } = await supabase
    .from("recurring_jobs")
    .select(RECURRING_JOB_SELECT)
    .eq("management_company_id", profile.management_company_id)
    .order("next_occurrence_date", { ascending: true, nullsFirst: false });

  return (data ?? []).map(mapJobRow);
}

async function syncNotifyTargets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string,
  scope: string,
  lotOwnerIds: string[],
) {
  await supabase.from("recurring_job_notify_targets").delete().eq("recurring_job_id", jobId);
  if (scope === "specific" && lotOwnerIds.length > 0) {
    await supabase.from("recurring_job_notify_targets").insert(
      lotOwnerIds.map((lot_owner_id) => ({ recurring_job_id: jobId, lot_owner_id })),
    );
  }
}

export async function createRecurringJob(
  input: RecurringJobInput,
): Promise<{ jobId?: string; error?: string }> {
  const parsed = recurringJobSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const profile = await requireCompanyRole();
  await requireOCAccess(d.oc_id);
  const supabase = createServerClient();

  const { data: refRow } = await supabase.rpc("next_reference_number", { p_prefix: "RJB" });
  const reference = typeof refRow === "string" ? refRow : null;

  const next = computeNextOccurrence({
    startDate: d.start_date,
    frequency: d.frequency,
    endDate: d.end_date ?? null,
    fromIso: todayIso(),
  });

  const { data, error } = await supabase
    .from("recurring_jobs")
    .insert({
      management_company_id: profile.management_company_id,
      oc_id: d.oc_id,
      reference_number: reference,
      title: d.title.trim(),
      trade: d.trade?.trim() || null,
      contractor_id: d.contractor_id || null,
      frequency: d.frequency,
      start_date: d.start_date,
      anchor_day: anchorFromStart(d.start_date, d.frequency),
      end_date: d.end_date || null,
      lead_time_days: d.lead_time_days ?? 0,
      notify_scope: d.notify_scope ?? "none",
      scope: d.scope?.trim() || null,
      cost_per_visit: d.cost_per_visit ?? null,
      fund_type: d.fund_type ?? null,
      approval_reference: d.approval_reference?.trim() || null,
      status: d.status ?? "active",
      next_occurrence_date: next,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not create job" };

  await syncNotifyTargets(supabase, data.id, d.notify_scope ?? "none", d.notify_lot_owner_ids ?? []);

  // Materialise the forward schedule so the manager has editable visit dates.
  await seedJobOccurrences(supabase, {
    id: data.id, oc_id: d.oc_id, start_date: d.start_date, frequency: d.frequency, end_date: d.end_date ?? null,
  }, profile.id);

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: d.oc_id,
    action: "create",
    entity_type: "recurring_job",
    entity_id: data.id,
    after_state: { title: d.title, frequency: d.frequency },
  });

  revalidatePath("/maintenance");
  return { jobId: data.id };
}

export async function updateRecurringJob(
  jobId: string,
  input: RecurringJobInput,
): Promise<{ error?: string }> {
  const parsed = recurringJobSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const profile = await requireCompanyRole();
  await requireOCAccess(d.oc_id);
  const supabase = createServerClient();

  const next = computeNextOccurrence({
    startDate: d.start_date,
    frequency: d.frequency,
    endDate: d.end_date ?? null,
    fromIso: todayIso(),
  });

  const { error } = await supabase
    .from("recurring_jobs")
    .update({
      oc_id: d.oc_id,
      title: d.title.trim(),
      trade: d.trade?.trim() || null,
      contractor_id: d.contractor_id || null,
      frequency: d.frequency,
      start_date: d.start_date,
      anchor_day: anchorFromStart(d.start_date, d.frequency),
      end_date: d.end_date || null,
      lead_time_days: d.lead_time_days ?? 0,
      notify_scope: d.notify_scope ?? "none",
      scope: d.scope?.trim() || null,
      cost_per_visit: d.cost_per_visit ?? null,
      fund_type: d.fund_type ?? null,
      approval_reference: d.approval_reference?.trim() || null,
      status: d.status ?? "active",
      next_occurrence_date: next,
    })
    .eq("id", jobId)
    .eq("management_company_id", profile.management_company_id);

  if (error) return { error: error.message };

  await syncNotifyTargets(supabase, jobId, d.notify_scope ?? "none", d.notify_lot_owner_ids ?? []);

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: d.oc_id,
    action: "update",
    entity_type: "recurring_job",
    entity_id: jobId,
    after_state: { title: d.title, frequency: d.frequency },
  });

  revalidatePath("/maintenance");
  return {};
}

export async function setRecurringJobStatus(
  jobId: string,
  status: "active" | "paused",
): Promise<{ error?: string }> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { error } = await supabase
    .from("recurring_jobs")
    .update({ status })
    .eq("id", jobId)
    .eq("management_company_id", profile.management_company_id);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: null,
    action: "update",
    entity_type: "recurring_job",
    entity_id: jobId,
    after_state: { status },
  });

  revalidatePath("/maintenance");
  return {};
}

export async function deleteRecurringJob(jobId: string): Promise<{ error?: string }> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { error } = await supabase
    .from("recurring_jobs")
    .delete()
    .eq("id", jobId)
    .eq("management_company_id", profile.management_company_id);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: null,
    action: "delete",
    entity_type: "recurring_job",
    entity_id: jobId,
  });

  revalidatePath("/maintenance");
  return {};
}

// Currently-selected specific notify targets for a job (for the edit drawer).
export async function getRecurringJobNotifyTargets(jobId: string): Promise<string[]> {
  await requireCompanyRole();
  const supabase = createServerClient();
  const { data } = await supabase
    .from("recurring_job_notify_targets")
    .select("lot_owner_id")
    .eq("recurring_job_id", jobId);
  return (data ?? []).map((r) => r.lot_owner_id as string);
}

// ─── Documents linked to a recurring job ────────────────────────────────────

export interface RecurringJobDoc {
  id: string;
  file_name: string;
  created_at: string;
}

export async function getRecurringJobDocuments(jobId: string): Promise<RecurringJobDoc[]> {
  await requireCompanyRole();
  const supabase = createServerClient();
  const { data } = await supabase
    .from("documents")
    .select("id, file_name, created_at")
    .eq("recurring_job_id", jobId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((d) => ({
    id: d.id as string,
    file_name: d.file_name as string,
    created_at: d.created_at as string,
  }));
}

// Link already-uploaded R2 objects (from /api/recurring-job-docs) to a job by
// creating documents rows. Used after create + for immediate links on edit.
export interface UploadedDocRef { key: string; file_name: string; file_size?: number; mime_type?: string }

export async function linkRecurringJobDocs(
  jobId: string,
  docs: UploadedDocRef[],
): Promise<{ docs?: RecurringJobDoc[]; error?: string }> {
  if (docs.length === 0) return { docs: [] };
  const profile = await requireCompanyRole();
  const supabase = createServerClient();
  const { data: job } = await supabase
    .from("recurring_jobs")
    .select("id, oc_id, management_company_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.management_company_id !== profile.management_company_id) return { error: "Job not found" };

  const { data: inserted, error } = await supabase
    .from("documents")
    .insert(docs.map((d) => ({
      oc_id: job.oc_id,
      category: "maintenance",
      file_name: d.file_name,
      file_path: d.key,
      file_size: d.file_size ?? null,
      mime_type: d.mime_type ?? null,
      uploaded_by: profile.id,
      recurring_job_id: jobId,
      ocr_status: "skipped",
    })))
    .select("id, file_name, created_at");
  if (error) return { error: error.message };
  revalidatePath("/maintenance");
  return { docs: (inserted ?? []).map((d) => ({ id: d.id as string, file_name: d.file_name as string, created_at: d.created_at as string })) };
}

const ALLOWED_DOC_TYPES = [
  "application/pdf", "image/png", "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function uploadRecurringJobDocument(
  jobId: string,
  formData: FormData,
): Promise<{ docId?: string; file_name?: string; error?: string }> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: job } = await supabase
    .from("recurring_jobs")
    .select("id, oc_id, management_company_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.management_company_id !== profile.management_company_id) {
    return { error: "Job not found" };
  }

  const file = formData.get("file") as File | null;
  if (!file) return { error: "No file provided" };
  if (!ALLOWED_DOC_TYPES.includes(file.type)) return { error: "File type not supported" };
  if (file.size > 25 * 1024 * 1024) return { error: "File too large. Maximum 25MB." };

  const { uploadObject } = await import("@/lib/storage/r2");
  const safeName = file.name.replace(/[/\\]/g, "_").replace(/[\x00-\x1f]/g, "").trim().slice(0, 200) || "document";
  const key = `documents/${job.oc_id}/recurring-jobs/${crypto.randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadObject(key, buffer, file.type);

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      oc_id: job.oc_id,
      category: "maintenance",
      file_name: safeName,
      file_path: key,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: profile.id,
      recurring_job_id: jobId,
      ocr_status: "skipped",
    })
    .select("id")
    .single();

  if (error || !doc) return { error: error?.message ?? "Could not save document" };

  revalidatePath("/maintenance");
  return { docId: doc.id, file_name: safeName };
}

export async function deleteRecurringJobDocument(docId: string): Promise<{ error?: string }> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();
  // Confine to docs that belong to a recurring job in this manager's company.
  const { data: doc } = await supabase
    .from("documents")
    .select("id, recurring_job_id, recurring_jobs(management_company_id)")
    .eq("id", docId)
    .maybeSingle();
  const company = (doc as { recurring_jobs: { management_company_id?: string } | null } | null)?.recurring_jobs?.management_company_id;
  if (!doc || !doc.recurring_job_id || company !== profile.management_company_id) {
    return { error: "Document not found" };
  }
  const { error } = await supabase.from("documents").delete().eq("id", docId);
  if (error) return { error: error.message };
  revalidatePath("/maintenance");
  return {};
}

// ─── Service schedule + attendance (recurring_job_occurrences) ──────────────

export interface JobOccurrence {
  id: string;
  scheduled_date: string;
  status: "scheduled" | "attended" | "skipped";
  notes: string | null;
  completed_at: string | null;
}

const OCC_SELECT = "id, scheduled_date, status, notes, completed_at";

// Materialise the next `count` occurrence dates from the recurrence rule into
// the DB (status 'scheduled'), skipping dates already present. Called once when
// a job is created and as a top-up when a manager opens an empty schedule.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedJobOccurrences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  job: { id: string; oc_id: string; start_date: string; frequency: RecurringFrequency; end_date: string | null },
  createdBy: string | null,
  count = 12,
) {
  const { data: existing } = await supabase
    .from("recurring_job_occurrences").select("scheduled_date").eq("recurring_job_id", job.id);
  const have = new Set((existing ?? []).map((r: { scheduled_date: string }) => r.scheduled_date.slice(0, 10)));
  const today = new Date().toISOString().slice(0, 10);
  const rows: Array<Record<string, unknown>> = [];
  let cursor = computeNextOccurrence({ startDate: job.start_date, frequency: job.frequency, endDate: job.end_date, fromIso: today });
  let guard = 0;
  while (cursor && rows.length < count && guard < 400) {
    if (!have.has(cursor)) rows.push({ recurring_job_id: job.id, oc_id: job.oc_id, scheduled_date: cursor, status: "scheduled", created_by: createdBy });
    const next = advance(cursor, job.frequency);
    if (job.end_date && next > job.end_date.slice(0, 10)) break;
    cursor = next;
    guard++;
  }
  if (rows.length > 0) await supabase.from("recurring_job_occurrences").insert(rows);
}

// Returns the stored occurrence rows (ascending). Seeds upcoming dates the
// first time a job has none, so the schedule is persisted, not recomputed.
export async function getJobSchedule(jobId: string): Promise<JobOccurrence[]> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();
  const { data: job } = await supabase
    .from("recurring_jobs")
    .select("id, oc_id, start_date, frequency, end_date, management_company_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.management_company_id !== profile.management_company_id) return [];

  const { count } = await supabase
    .from("recurring_job_occurrences").select("id", { count: "exact", head: true }).eq("recurring_job_id", jobId);
  if ((count ?? 0) === 0) {
    await seedJobOccurrences(supabase, {
      id: job.id as string, oc_id: job.oc_id as string, start_date: job.start_date as string,
      frequency: job.frequency as RecurringFrequency, end_date: (job.end_date as string) ?? null,
    }, profile.id);
  }

  const { data: rows } = await supabase
    .from("recurring_job_occurrences").select(OCC_SELECT).eq("recurring_job_id", jobId).order("scheduled_date", { ascending: true });
  return (rows ?? []) as JobOccurrence[];
}

export async function addJobOccurrence(
  jobId: string,
  input: { scheduled_date: string; status?: "scheduled" | "attended" | "skipped"; notes?: string | null },
): Promise<{ occurrence?: JobOccurrence; error?: string }> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();
  const { data: job } = await supabase
    .from("recurring_jobs").select("id, oc_id, management_company_id").eq("id", jobId).maybeSingle();
  if (!job || job.management_company_id !== profile.management_company_id) return { error: "Job not found" };
  if (!input.scheduled_date) return { error: "Pick a date" };

  const status = input.status ?? "scheduled";
  const { data, error } = await supabase.from("recurring_job_occurrences").insert({
    recurring_job_id: jobId,
    oc_id: job.oc_id,
    scheduled_date: input.scheduled_date,
    status,
    notes: input.notes?.trim() || null,
    completed_at: status === "attended" ? new Date().toISOString() : null,
    created_by: profile.id,
  }).select(OCC_SELECT).single();
  if (error || !data) return { error: error?.message ?? "Could not add the visit" };
  revalidatePath("/maintenance");
  return { occurrence: data as JobOccurrence };
}

export async function updateJobOccurrence(
  occurrenceId: string,
  patch: { scheduled_date?: string; status?: "scheduled" | "attended" | "skipped"; notes?: string | null },
): Promise<{ occurrence?: JobOccurrence; error?: string }> {
  await requireCompanyRole();
  const supabase = createServerClient();
  // Authorize against the occurrence's OC before mutating it.
  const { data: occ } = await supabase
    .from("recurring_job_occurrences")
    .select("oc_id")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (!occ) return { error: "Visit not found" };
  await requireOCAccess(occ.oc_id as string);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};
  if (patch.scheduled_date) update.scheduled_date = patch.scheduled_date;
  if (patch.status) {
    update.status = patch.status;
    update.completed_at = patch.status === "attended" ? new Date().toISOString() : null;
  }
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;
  const { data, error } = await supabase.from("recurring_job_occurrences").update(update).eq("id", occurrenceId).select(OCC_SELECT).single();
  if (error || !data) return { error: error?.message ?? "Could not update the visit" };
  revalidatePath("/maintenance");
  return { occurrence: data as JobOccurrence };
}

export async function deleteJobOccurrence(occurrenceId: string): Promise<{ error?: string }> {
  await requireCompanyRole();
  const supabase = createServerClient();
  const { data: occ } = await supabase
    .from("recurring_job_occurrences")
    .select("oc_id")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (!occ) return { error: "Visit not found" };
  await requireOCAccess(occ.oc_id as string);
  const { error } = await supabase.from("recurring_job_occurrences").delete().eq("id", occurrenceId);
  if (error) return { error: error.message };
  revalidatePath("/maintenance");
  return {};
}
