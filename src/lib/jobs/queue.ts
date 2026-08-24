import "server-only";
import { createServerClient } from "@/lib/supabase";
import { runBulkEmail, type BulkEmailPayload } from "@/lib/bulk-email-runner";
import {
  runLevyBatchSend,
  type LevyBatchSendPayload,
} from "@/lib/levy-batch-send-runner";

// Background work, without Trigger.dev.
//
// Only two things in this app genuinely need backgrounding: a levy batch send
// and a meeting-notice send. Both fan out one email per lot owner, which is
// slow enough that a manager should not sit on a spinner for it, and neither
// is something you can afford to drop halfway.
//
// So: a row in background_jobs, claimed atomically, retried with backoff.
// Two things drain it.
//
//   1. `after()` from next/server, kicked by the same request that queued the
//      job. It runs once the response has been sent, in the same invocation,
//      so the manager's click returns instantly AND the emails start going
//      out immediately. This is the path that runs essentially every time.
//   2. /api/cron/jobs, once a minute. The safety net: it picks up anything
//      the inline drain missed because the invocation was killed, the send
//      failed and is waiting on its backoff, or the job was queued somewhere
//      without a request to hang `after()` off (a cron, a webhook).
//
// The runners themselves are unchanged, and were always callable directly:
// the Trigger tasks were fifteen-line shims around them.

export type JobPayload =
  | { kind: "send_levy_batch"; payload: LevyBatchSendPayload }
  | { kind: "send_bulk_email"; payload: BulkEmailPayload };

export type JobKind = JobPayload["kind"];

/** How long a claimed job may sit in `running` before a later drain assumes
 *  its worker died and re-queues it. Comfortably longer than the 300s
 *  maxDuration of the cron route, so a slow-but-alive run is never stolen. */
const STALE_AFTER = "10 minutes";

/** Per drain. Each job is a fan-out that can itself send dozens of emails, so
 *  a small batch keeps one invocation inside its time budget. Anything left
 *  is picked up by the next drain, which follows immediately. */
const BATCH_SIZE = 3;

/** Retry backoff, indexed by attempt. Third failure gives up. */
const BACKOFF_MINUTES = [1, 5];

interface JobRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

/**
 * Put work on the queue. Returns the job id.
 *
 * Callers that have a request to hang it off should follow this with
 * `after(() => drainJobs())` so the work starts now rather than on the next
 * cron tick.
 */
export async function enqueueJob(
  job: JobPayload,
  queuedBy?: string | null,
): Promise<{ id: string } | { error: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("background_jobs")
    .insert({
      kind: job.kind,
      payload: job.payload as unknown as Record<string, unknown>,
      queued_by: queuedBy ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("enqueueJob failed", job.kind, error);
    return { error: error?.message ?? "Could not queue the job" };
  }
  return { id: (data as { id: string }).id };
}

async function runOne(row: JobRow): Promise<void> {
  const supabase = createServerClient();

  try {
    switch (row.kind) {
      case "send_levy_batch":
        await runLevyBatchSend(row.payload as unknown as LevyBatchSendPayload);
        break;
      case "send_bulk_email":
        await runBulkEmail(row.payload as unknown as BulkEmailPayload);
        break;
      default:
        // An unknown kind is a deploy-order problem, not a transient fault.
        // Failing it outright beats retrying it three times.
        throw new Error(`Unknown job kind: ${row.kind}`);
    }

    await supabase
      .from("background_jobs")
      .update({ status: "done", finished_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const exhausted = row.attempts >= row.max_attempts;
    const backoff = BACKOFF_MINUTES[row.attempts - 1] ?? 15;

    console.error(
      `background job ${row.kind} ${row.id} failed (attempt ${row.attempts}/${row.max_attempts})`,
      message,
    );

    await supabase
      .from("background_jobs")
      .update(
        exhausted
          ? {
              status: "failed",
              last_error: message.slice(0, 1000),
              finished_at: new Date().toISOString(),
            }
          : {
              status: "queued",
              last_error: message.slice(0, 1000),
              locked_at: null,
              run_after: new Date(Date.now() + backoff * 60_000).toISOString(),
            },
      )
      .eq("id", row.id);
  }
}

/**
 * Claim and run whatever is due.
 *
 * Safe to call concurrently: the claim is a single statement using SKIP
 * LOCKED, so the cron and an inline drain racing each other cannot take the
 * same job. Never throws , a drain that blows up must not take down the
 * request or cron invocation that called it.
 */
export async function drainJobs(): Promise<{ ran: number }> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("claim_background_jobs", {
    batch_size: BATCH_SIZE,
    stale_after: STALE_AFTER,
  });

  if (error) {
    console.error("drainJobs: claim failed", error);
    return { ran: 0 };
  }

  const rows = (data ?? []) as JobRow[];
  // Sequential on purpose. Each job is itself a fan-out of many emails;
  // running three of those at once is how you hit a provider rate limit.
  for (const row of rows) {
    await runOne(row);
  }
  return { ran: rows.length };
}
