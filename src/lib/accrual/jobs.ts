// ============================================================================
// Cron-callable accrual jobs — framework-agnostic
// ----------------------------------------------------------------------------
// Same rules as src/lib/basiq/jobs.ts:
//   - NO `"use server"` directive — exports must not become server actions
//   - NO imports from `next/cache` — no revalidate calls
//   - NO imports from `@/lib/auth` — auth is resolved by the caller; this
//     module takes an explicit systemProfileId arg.
//   - Caller supplies a real profile UUID; the only "system sentinel" is
//     the bootstrap row keyed by auth_user_id='system_accrual_cron' (PP6-A).
//
// The verification harness (PP6-B-B src/lib/accrual/accrual.verification.ts)
// will call accrueInterestForOCJob directly with deterministic
// runDate fixtures. The Trigger.dev cron at trigger/accrue-interest.ts
// resolves runDate via Australia/Melbourne timezone math.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

const SYSTEM_ACCRUAL_AUTH_ID = "system_accrual_cron";

export interface AccrualJobInput {
  ocId: string;
  runDate: string;            // 'YYYY-MM-DD' — date interpreted in AEST/AEDT
  systemProfileId: string;
  supabase: SupabaseClient;
}

export type AccrualJobResult =
  | {
      ok: true;
      runId: string;
      outcome: "completed" | "skipped_no_eligible";
      accruedCount: number;
      totalInterest: number;
    }
  | { ok: true; outcome: "skipped_already_accrued" }
  | { ok: true; outcome: "skipped_oc_missing" }
  | { ok: false; outcome: "failed"; errorMessage: string };

// ─── resolveSystemProfileId ────────────────────────────────────────
// Look up the bootstrap profile id at cron startup. Trigger.dev tasks
// are stateless per-run, so "cache" means "lookup once at top of run,
// reuse within the run". Hard-fails if the profile is missing —
// surfaces deploy-ordering bugs (cron deployed before PP6-A schema
// delta applied) immediately rather than burying them in per-row FK
// violations.

export async function resolveSystemProfileId(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", SYSTEM_ACCRUAL_AUTH_ID)
    .single();

  if (error || !data) {
    throw new Error(
      `system profile '${SYSTEM_ACCRUAL_AUTH_ID}' not found — apply PP6-A schema delta`,
    );
  }
  return (data as { id: string }).id;
}

// ─── accrueInterestForOCJob ───────────────────────────────
// Per-oc wrapper around rpc_accrue_interest_for_oc.
// Classifies errors into three outcomes per PP6-B-0 ratification:
//
//   - SQLSTATE 23505 (unique_violation) → 'skipped_already_accrued'
//     Run-row UNIQUE(oc_id, run_date) tripped, meaning the cron
//     already ran for this date. Benign no-op.
//
//   - 'oc % not found' → 'skipped_oc_missing'
//     OC was deleted between the cron's iteration query and
//     this per-sub call. Transient race, not the cron's fault.
//
//   - Any other error → 'failed'
//     Caller writes a separate failed run row (RPC's run-row INSERT
//     was rolled back along with the work, so the slot is free).
//     chk_iar_failed_pair satisfied via non-empty error_message.
//
// Successful RPC return path performs a follow-up SELECT against the
// run row to surface accrued_count / total_interest for cron telemetry.
// Cheap (single PK lookup); RPC contract returns the run id only.

export async function accrueInterestForOCJob(
  input: AccrualJobInput,
): Promise<AccrualJobResult> {
  const { ocId, runDate, systemProfileId, supabase } = input;

  const { data: runIdRaw, error } = await supabase.rpc(
    "rpc_accrue_interest_for_oc",
    {
      p_oc_id: ocId,
      p_run_date: runDate,
      p_created_by: systemProfileId,
    },
  );

  if (error) {
    const klass = classifyAccrualError(error);
    if (klass === "skip_already_accrued") {
      return { ok: true, outcome: "skipped_already_accrued" };
    }
    if (klass === "skip_oc_missing") {
      return { ok: true, outcome: "skipped_oc_missing" };
    }
    const errorMessage = error.message ?? "unknown error";
    await writeFailedRunRow(supabase, ocId, runDate, errorMessage);
    return { ok: false, outcome: "failed", errorMessage };
  }

  const runId = runIdRaw as string | null;
  if (!runId) {
    // Defensive: RPC contract returns a UUID. If null surfaces, treat as fail.
    const errorMessage =
      "rpc_accrue_interest_for_oc returned null run id";
    await writeFailedRunRow(supabase, ocId, runDate, errorMessage);
    return { ok: false, outcome: "failed", errorMessage };
  }

  const { data: runRow, error: runRowErr } = await supabase
    .from("interest_accrual_runs")
    .select("status, accrued_count, total_interest")
    .eq("id", runId)
    .single();

  if (runRowErr) {
    // Telemetry undercount with explicit log > silent undercount. Cron
    // metric will report accruedCount=0 / totalInterest=0 for this row
    // even though the RPC succeeded; investigations later have a
    // breadcrumb.
    console.warn(
      `accrueInterestForOCJob: telemetry hydration failed for runId=${runId}`,
      runRowErr,
    );
  }

  const status =
    (runRow as { status: string } | null)?.status ?? "completed";
  const accruedCount =
    (runRow as { accrued_count: number } | null)?.accrued_count ?? 0;
  const totalInterest = Number(
    (runRow as { total_interest: number | string } | null)?.total_interest ??
      0,
  );

  if (status === "skipped_no_eligible") {
    return {
      ok: true,
      runId,
      outcome: "skipped_no_eligible",
      accruedCount: 0,
      totalInterest: 0,
    };
  }
  return {
    ok: true,
    runId,
    outcome: "completed",
    accruedCount,
    totalInterest,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

type AccrualErrorClass =
  | "skip_already_accrued"
  | "skip_oc_missing"
  | "fail";

function classifyAccrualError(err: {
  code?: string | null;
  message?: string | null;
}): AccrualErrorClass {
  const code = err.code ?? "";
  const message = err.message ?? "";
  if (code === "23505") return "skip_already_accrued";
  if (
    message.includes("rpc_accrue_interest_for_oc") &&
    message.includes("oc") &&
    message.includes("not found")
  ) {
    return "skip_oc_missing";
  }
  return "fail";
}

async function writeFailedRunRow(
  supabase: SupabaseClient,
  ocId: string,
  runDate: string,
  errorMessage: string,
): Promise<void> {
  // chk_iar_failed_pair requires length(trim(error_message)) > 0. Source
  // errors with empty/whitespace messages would otherwise trip the CHECK
  // and silently leave no record of the failure. Fallback sentinel
  // guarantees the failed row lands every time.
  const safeErrorMessage =
    errorMessage?.trim() || "(unknown failure — empty error message)";

  const { error } = await supabase.from("interest_accrual_runs").insert({
    oc_id: ocId,
    run_date: runDate,
    status: "failed",
    error_message: safeErrorMessage,
    completed_at: new Date().toISOString(),
  });
  if (error) {
    // If even the failed-row write fails, log loudly and proceed —
    // surfacing a real failure shouldn't be blocked by telemetry plumbing.
    console.error(
      "accrueInterestForOCJob: failed to write failed run row",
      error,
    );
  }
}
