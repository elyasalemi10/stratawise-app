import { schedules } from "@trigger.dev/sdk";
import {
  pollConnectionAsSystem,
  sendPendingReauthNotificationsJob,
  sweepExpiredConnectionsJob,
} from "@/lib/basiq/jobs";
import { createServerClient } from "@/lib/supabase";

// ============================================================================
// Trigger.dev scheduled tasks for Basiq bank-feed integration (Prompt 3)
// ----------------------------------------------------------------------------
// These run OUTSIDE the Next.js request context — no Clerk, no next/cache,
// no server-action boundary. They import ONLY from src/lib/basiq/jobs.ts and
// src/lib/supabase (both framework-agnostic). Any change that requires
// auth or revalidation must go through a server action; those belong in
// src/lib/actions/basiq.ts, not here.
//
// Grep invariant (verified in commit body before merge):
//   grep -n "from.*actions" trigger/basiq-jobs.ts  →  zero matches
//
// All three tasks tolerate partial failure. Individual connection/sync
// errors are logged but never thrown — one dud OC must not starve the
// batch. Cron cadence is enforced by Trigger.dev with IANA timezone
// handling (AEST/AEDT transitions auto-handled).
// ============================================================================

const PER_CONNECTION_TIMEOUT_MS = 15_000;

// ────────────────────────────────────────────────────────────────
// Task 1 — midnight-basiq-poll
// Every day at 00:00 Australia/Melbourne. Iterates all active
// basiq_connections and calls pollConnectionAsSystem per connection,
// bounded by a 15s per-connection timeout. Uses Promise.allSettled so
// one stuck OC doesn't block the rest of the batch.
// ────────────────────────────────────────────────────────────────

export const midnightBasiqPoll = schedules.task({
  id: "midnight-basiq-poll",
  cron: { pattern: "0 0 * * *", timezone: "Australia/Melbourne" },
  run: async (payload) => {
    const supabase = createServerClient();
    const { data: connections, error } = await supabase
      .from("basiq_connections")
      .select("id, created_by, subdivision_id")
      .eq("status", "active");

    if (error) {
      console.error("midnight-basiq-poll: failed to list connections", error);
      return { timestamp: payload.timestamp, processed: 0, errors: 1 };
    }
    if (!connections || connections.length === 0) {
      return { timestamp: payload.timestamp, processed: 0, errors: 0 };
    }

    const results = await Promise.allSettled(
      connections.map((conn) =>
        withTimeout(
          pollConnectionAsSystem(
            (conn as { id: string }).id,
            (conn as { created_by: string }).created_by,
          ),
          PER_CONNECTION_TIMEOUT_MS,
          `poll connection ${(conn as { id: string }).id}`,
        ),
      ),
    );

    let ok = 0;
    let errs = 0;
    let inserted = 0;
    let autoMatched = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        ok += 1;
        inserted += r.value.inserted;
        autoMatched += r.value.autoMatched;
      } else {
        errs += 1;
        console.error("midnight-basiq-poll per-connection failure", r.reason);
      }
    }

    // One aggregate audit_log entry per batch run (per spec — no per-OC spam).
    const { error: auditErr } = await supabase.from("audit_log").insert({
      profile_id: null,
      subdivision_id: null,
      action: "basiq_cron.midnight_poll_run",
      entity_type: "basiq_cron",
      entity_id: null,
      metadata: {
        processed: connections.length,
        ok,
        errors: errs,
        transactions_inserted: inserted,
        auto_matched: autoMatched,
      },
    });
    if (auditErr) {
      console.error(
        "midnight-basiq-poll: audit insert failed",
        auditErr,
      );
    }

    return {
      timestamp: payload.timestamp,
      processed: connections.length,
      ok,
      errors: errs,
      inserted,
      autoMatched,
    };
  },
});

// ────────────────────────────────────────────────────────────────
// Task 2 — daily-reauth-notifications
// Every day at 09:00 Australia/Melbourne. Delegates to the job function,
// which internally iterates active connections and sends 30/14/7/3/1-day
// reminders with idempotency via basiq_reauth_notifications.
// ────────────────────────────────────────────────────────────────

export const dailyReauthNotifications = schedules.task({
  id: "daily-reauth-notifications",
  cron: { pattern: "0 9 * * *", timezone: "Australia/Melbourne" },
  run: async (payload) => {
    const result = await sendPendingReauthNotificationsJob();

    const supabase = createServerClient();
    const { error: auditErr } = await supabase.from("audit_log").insert({
      profile_id: null,
      subdivision_id: null,
      action: "basiq_cron.reauth_notifications_run",
      entity_type: "basiq_cron",
      entity_id: null,
      metadata: { sent: result.sentCount },
    });
    if (auditErr) {
      console.error(
        "daily-reauth-notifications: audit insert failed",
        auditErr,
      );
    }

    return { timestamp: payload.timestamp, sent: result.sentCount };
  },
});

// ────────────────────────────────────────────────────────────────
// Task 3 — hourly-expiry-check
// Every hour, top of the hour. Flips connections past their
// consent_expires_at to 'expired' and sends the consent-expired email.
// Timezone omitted — runs hourly in UTC, so 24 times a day; Daylight
// saving doesn't affect an hourly cadence.
// ────────────────────────────────────────────────────────────────

export const hourlyExpiryCheck = schedules.task({
  id: "hourly-expiry-check",
  cron: "0 * * * *",
  run: async (payload) => {
    const result = await sweepExpiredConnectionsJob();

    if (result.expiredCount > 0) {
      const supabase = createServerClient();
      const { error: auditErr } = await supabase.from("audit_log").insert({
        profile_id: null,
        subdivision_id: null,
        action: "basiq_cron.expiry_sweep_run",
        entity_type: "basiq_cron",
        entity_id: null,
        metadata: { expired: result.expiredCount },
      });
      if (auditErr) {
        console.error(
          "hourly-expiry-check: audit insert failed",
          auditErr,
        );
      }
    }

    return { timestamp: payload.timestamp, expired: result.expiredCount };
  },
});

// ─── Helpers ─────────────────────────────────────────────────────

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
