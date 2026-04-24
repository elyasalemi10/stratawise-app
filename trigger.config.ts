import { defineConfig } from "@trigger.dev/sdk";

// ============================================================================
// Trigger.dev v4 configuration
// ----------------------------------------------------------------------------
// This project uses Trigger.dev to run the three scheduled tasks that back
// Prompt 3's Basiq bank-feed integration:
//
//   /trigger/basiq-jobs.ts
//     midnight-basiq-poll       — every day 00:00 Australia/Melbourne
//     daily-reauth-notifications — every day 09:00 Australia/Melbourne
//     hourly-expiry-check        — every hour, top of the hour
//
// The tasks import ONLY from src/lib/basiq/jobs.ts — a framework-agnostic
// module that never crosses the Next.js "use server" boundary and never
// calls Clerk auth or next/cache. Each task passes a connection's own
// `created_by` (NOT NULL FK to profiles) as the performer.
//
// Env vars:
//   TRIGGER_SECRET_KEY     — from Trigger.dev dashboard (per environment)
//   TRIGGER_PROJECT_ID     — set below in `project`
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BASIQ_API_KEY,
//     BASIQ_API_BASE_URL, BASIQ_STATE_SECRET, BASIQ_WEBHOOK_SECRET,
//     RESEND_API_KEY, NEXT_PUBLIC_APP_URL
//     — these do NOT automatically sync from Vercel to Trigger.dev.
//       Add them to the Trigger.dev dashboard under Project Settings →
//       Environment Variables, or wire up the vercel-sync build
//       extension before deploy. See docs/deployment.md.
//
// Deploy:
//   npx trigger.dev@latest login        (once, per local dev machine)
//   npx trigger.dev@latest init         (once, per Trigger.dev project)
//   npx trigger.dev@latest deploy       (per release of task code)
// ============================================================================

export default defineConfig({
  // Replace <set by `npx trigger.dev@latest init`> with the project ref
  // after running init. The ref format is `proj_<slug>`. Do not commit a
  // live secret here — the `project` field is a public identifier only
  // (authentication is via TRIGGER_SECRET_KEY env var).
  project: process.env.TRIGGER_PROJECT_ID ?? "<set by trigger.dev init>",
  dirs: ["./trigger"],
  runtime: "node-22",
  maxDuration: 120, // seconds — plenty for per-OC poll loops
});
