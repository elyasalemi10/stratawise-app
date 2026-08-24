import { NextRequest, NextResponse } from "next/server";
import { drainJobs } from "@/lib/jobs/queue";

// ============================================================================
// GET /api/cron/jobs , Vercel Cron
// ----------------------------------------------------------------------------
// The safety net behind the background_jobs queue.
//
// Almost every job is already running before this fires: whatever queued it
// kicked an inline drain with `after()`, so the work starts the moment the
// manager's request returns. This route exists for the cases that misses:
//
//   - the invocation was killed mid-send, leaving a job locked. The claim
//     re-queues anything stuck in `running` past its stale window.
//   - a send failed and is sitting out its retry backoff.
//   - the job was queued somewhere with no request to hang `after()` off,
//     e.g. another cron or a webhook.
//
// When there is nothing due it claims nothing and returns immediately.
//
// Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` on every cron
// invocation. We reject anything else so the endpoint isn't publicly runnable.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("cron/jobs: CRON_SECRET is not configured");
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    console.warn("cron/jobs: rejected, bad or missing bearer token");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Keep draining while there is work, but stop well before maxDuration so
  // the invocation returns cleanly rather than being killed mid-job.
  const deadline = Date.now() + 240_000;
  let ran = 0;
  for (;;) {
    const res = await drainJobs();
    ran += res.ran;
    if (res.ran === 0 || Date.now() > deadline) break;
  }

  return NextResponse.json({ status: "ok", ran });
}
