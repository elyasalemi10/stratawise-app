import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  CRON_TASKS,
  findTask,
  melbourneDate,
  melbourneHour,
  type CronTask,
} from "@/lib/cron/registry";

// ============================================================================
// GET /api/cron/daily , Vercel Cron, hourly
// ----------------------------------------------------------------------------
// Every daily automation in the app. Runs each hour, works out what time it is
// in Melbourne, and runs whatever belongs at that hour.
//
// Hourly rather than six cron entries at six UTC times because Vercel cron
// expressions are UTC only and Melbourne moves between UTC+10 and UTC+11.
// A fixed UTC time silently becomes the wrong local time for half the year.
//
// EVERY run is guarded on (task, Melbourne date). Vercel Cron is at-least-once
// and an hourly tick offers the same task the same day more than once if a run
// is slow. Some of these issue levies and email owners, so a second run is a
// duplicate levy notice, not an untidy log. The insert into cron_runs is what
// wins the right to run; a conflict means someone already has it.
//
// Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`. Nothing else is
// accepted, including for the manual-run path below.
//
// TESTING
// -------
// Add `?task=<id>` to run one task now regardless of the hour, and `&force=1`
// to run it even if it has already run today (which deletes today's guard row
// first, so it is genuinely a re-run):
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "$APP_URL/api/cron/daily?task=levy-autosend&force=1"
//
// The response carries each task's own return value, so you can see what it
// actually did rather than inferring it from side effects. `?task=list` gives
// the registry without running anything.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface TaskOutcome {
  task: string;
  status: "ok" | "failed" | "already_ran";
  result?: unknown;
  error?: string;
}

async function runGuarded(task: CronTask, localDate: string, force: boolean): Promise<TaskOutcome> {
  const supabase = createServerClient();

  if (force) {
    await supabase.from("cron_runs").delete().eq("task", task.id).eq("local_date", localDate);
  }

  // Claim the day. A duplicate key means another invocation already has it.
  const { error: claimErr } = await supabase
    .from("cron_runs")
    .insert({ task: task.id, local_date: localDate });

  if (claimErr) {
    // 23505 = unique_violation. Anything else is a real problem worth seeing.
    if (claimErr.code !== "23505") {
      console.error(`cron/daily: could not claim ${task.id}`, claimErr);
      return { task: task.id, status: "failed", error: claimErr.message };
    }
    return { task: task.id, status: "already_ran" };
  }

  try {
    const result = await task.run();
    await supabase
      .from("cron_runs")
      .update({ finished_at: new Date().toISOString(), ok: true, result: result ?? null })
      .eq("task", task.id)
      .eq("local_date", localDate);
    return { task: task.id, status: "ok", result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`cron/daily: ${task.id} failed`, message);
    // The guard row STAYS. A task that half-ran and then threw should not be
    // retried blindly an hour later , several of these send email, and a
    // partial send re-run is worse than a missed one. Set ok=false so the row
    // reads as a failure, and use ?force=1 to re-run deliberately.
    await supabase
      .from("cron_runs")
      .update({ finished_at: new Date().toISOString(), ok: false, error: message.slice(0, 1000) })
      .eq("task", task.id)
      .eq("local_date", localDate);
    return { task: task.id, status: "failed", error: message };
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("cron/daily: CRON_SECRET is not configured");
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    console.warn("cron/daily: rejected, bad or missing bearer token");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const localDate = melbourneDate(now);
  const localHour = melbourneHour(now);

  const requested = request.nextUrl.searchParams.get("task");
  const force = request.nextUrl.searchParams.get("force") === "1";

  // `?task=list` , what is registered and when, without running anything.
  if (requested === "list") {
    return NextResponse.json({
      localDate,
      localHour,
      tasks: CRON_TASKS.map((t) => ({ id: t.id, hour: t.hour, label: t.label })),
    });
  }

  let due: CronTask[];
  if (requested) {
    const task = findTask(requested);
    if (!task) {
      return NextResponse.json(
        { error: "unknown_task", known: CRON_TASKS.map((t) => t.id) },
        { status: 400 },
      );
    }
    due = [task];
  } else {
    due = CRON_TASKS.filter((t) => t.hour === localHour);
  }

  // Sequential, in registry order. Several of these share an hour and the
  // order matters , levy autosend has to land before the follow-up sweep
  // goes looking for overdue notices.
  const results: TaskOutcome[] = [];
  for (const task of due) {
    results.push(await runGuarded(task, localDate, force));
  }

  return NextResponse.json({ status: "ok", localDate, localHour, results });
}
