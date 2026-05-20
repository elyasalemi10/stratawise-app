import { schedules } from "@trigger.dev/sdk";
import {
  accrueInterestForOCJob,
  resolveSystemProfileId,
} from "@/lib/accrual/jobs";
import { createServerClient } from "@/lib/supabase";

// ============================================================================
// Trigger.dev scheduled task — daily interest accrual (Prompt 6 PP6-B).
// ----------------------------------------------------------------------------
// Mirrors trigger/basiq-jobs.ts conventions:
//   - Imports ONLY from @/lib/accrual/jobs and @/lib/supabase.
//   - Grep invariant (verified at merge):
//       grep -n "from.*actions" trigger/accrue-interest.ts → zero matches
//   - Promise.allSettled for partial-failure tolerance — one stuck OC must
//     not starve the batch.
//   - withTimeout per oc (5s; accrual is local DB, much faster
//     than basiq's 15s for external API calls).
//   - Aggregate audit_log row at end (no per-OC spam).
//
// Schedule: every day at 02:00 Australia/Melbourne. Trigger.dev's IANA-aware
// scheduler handles AEST/AEDT transitions automatically. DST edge cases
// (spring-forward skip → no fire on transition day; fall-back double → two
// fires same wall-clock hour) are accepted as benign:
//   - Accrual is monthly cadence at the per-levy level (last_accrual_date
//     guards repeat charges).
//   - The run-row UNIQUE(oc_id, run_date) constraint dedupes the
//     fall-back double-fire — second invocation gets unique_violation,
//     classified as 'skipped_already_accrued'.
//
// run_date computation: see DRAFTING NOTE inside the run() body.
// ============================================================================

const PER_SUBDIVISION_TIMEOUT_MS = 5_000;

export const dailyAccrueInterest = schedules.task({
  id: "daily-accrue-interest",
  // Runs at exactly midnight AEST/AEDT so interest accrues on the calendar
  // day it's due.
  cron: { pattern: "0 0 * * *", timezone: "Australia/Melbourne" },
  run: async (payload) => {
    const supabase = createServerClient();

    // Resolve system profile id once — hard-fail if missing (deploy-ordering
    // bug surfaces immediately rather than as per-oc FK failures).
    const systemProfileId = await resolveSystemProfileId(supabase);

    // ─── run_date ────────────────────────────────────────────────────
    // DRAFTING NOTE — architect ratified "SQL-side" run_date computation
    // at PP6-B-0. Strict SQL-side requires either a new RPC
    // (current_aest_date()) or a fake-table SELECT — Supabase JS does
    // not expose raw SQL execution. Both options entail a schema
    // addition outside PP6-A's locked scope.
    //
    // Intl.DateTimeFormat with timeZone='Australia/Melbourne' and
    // locale='en-CA' returns ISO YYYY-MM-DD format and is built into
    // Node 22 (matches trigger.config.ts runtime). Equivalent
    // correctness; no schema change needed.
    //
    // Surfaced in PP6-B-A code review pause for architect to confirm
    // or override. If override → add `current_aest_date()` RPC in a
    // PP6-B addendum schema delta and switch to supabase.rpc() here.
    const runDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Melbourne",
    }).format(new Date());

    // ─── List eligible ocs ──────────────────────────────────
    const { data: ocs, error: listErr } = await supabase
      .from("owners_corporations")
      .select("id")
      .eq("interest_enabled", true)
      .eq("status", "active");

    if (listErr) {
      console.error(
        "daily-accrue-interest: failed to list ocs",
        listErr,
      );
      return {
        timestamp: payload.timestamp,
        runDate,
        processed: 0,
        ok: 0,
        skipped: 0,
        errors: 1,
        totalAccruedCount: 0,
        totalInterest: 0,
      };
    }
    if (!ocs || ocs.length === 0) {
      return {
        timestamp: payload.timestamp,
        runDate,
        processed: 0,
        ok: 0,
        skipped: 0,
        errors: 0,
        totalAccruedCount: 0,
        totalInterest: 0,
      };
    }

    // ─── Fan out per oc ─────────────────────────────────────
    const results = await Promise.allSettled(
      ocs.map((sub) =>
        withTimeout(
          accrueInterestForOCJob({
            ocId: (sub as { id: string }).id,
            runDate,
            systemProfileId,
            supabase,
          }),
          PER_SUBDIVISION_TIMEOUT_MS,
          `accrue ${(sub as { id: string }).id}`,
        ),
      ),
    );

    // ─── Aggregate metrics ───────────────────────────────────────────
    let ok = 0;
    let skipped = 0;
    let errs = 0;
    let totalAccruedCount = 0;
    let totalInterest = 0;
    // Metric semantics (mirrors basiq's processed/ok/errors with a `skipped`
    // bucket for the four non-error no-op outcomes):
    //   - ok:      outcome === 'completed' (work done, penalty notices written)
    //   - skipped: outcome ∈ {skipped_no_eligible, skipped_already_accrued,
    //              skipped_oc_missing}
    //   - errors:  outcome === 'failed' OR allSettled rejection (e.g. timeout)
    // processed = ok + skipped + errors (mutually exclusive).
    for (const r of results) {
      if (r.status === "fulfilled") {
        const v = r.value;
        if (v.ok) {
          if (v.outcome === "completed") {
            ok += 1;
            totalAccruedCount += v.accruedCount;
            totalInterest += v.totalInterest;
          } else {
            skipped += 1;
          }
        } else {
          errs += 1;
          console.error(
            "daily-accrue-interest per-oc failure:",
            v.errorMessage,
          );
        }
      } else {
        errs += 1;
        console.error(
          "daily-accrue-interest unexpected rejection:",
          r.reason,
        );
      }
    }

    // ─── Aggregate audit row ─────────────────────────────────────────
    const { error: auditErr } = await supabase.from("audit_log").insert({
      profile_id: null,
      oc_id: null,
      action: "interest_accrual_cron.run",
      entity_type: "interest_accrual_cron",
      entity_id: null,
      metadata: {
        run_date: runDate,
        processed: ocs.length,
        ok,
        skipped,
        errors: errs,
        total_accrued_count: totalAccruedCount,
        total_interest: totalInterest,
      },
    });
    if (auditErr) {
      console.error(
        "daily-accrue-interest: audit insert failed",
        auditErr,
      );
    }

    return {
      timestamp: payload.timestamp,
      runDate,
      processed: ocs.length,
      ok,
      skipped,
      errors: errs,
      totalAccruedCount,
      totalInterest,
    };
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timeout after ${ms}ms: ${label}`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
