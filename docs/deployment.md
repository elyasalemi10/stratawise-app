# Deployment Notes

## Trigger.dev — scheduled tasks for Basiq

The Basiq bank-feed integration relies on three scheduled tasks defined in
[/trigger/basiq-jobs.ts](../trigger/basiq-jobs.ts):

| Task | Cadence | Timezone |
|---|---|---|
| `midnight-basiq-poll` | `0 0 * * *` | `Australia/Melbourne` |
| `daily-reauth-notifications` | `0 9 * * *` | `Australia/Melbourne` |
| `hourly-expiry-check` | `0 * * * *` | UTC (hourly is timezone-agnostic) |

Trigger.dev deploys **separately** from the Next.js app. Claude Code cannot
run any Trigger.dev CLI commands because the `login` step is interactive.
Elyas owns these commands.

### First-time setup (once per Trigger.dev project)

```
npx trigger.dev@latest login
npx trigger.dev@latest init
```

`init` will prompt to select a project, link it, and backfill
`TRIGGER_PROJECT_ID` in `.env.local`. Populate the value shown in the
Trigger.dev dashboard under **Project Settings → API Keys** into
`TRIGGER_SECRET_KEY`.

### Per-release task deploy

```
npx trigger.dev@latest deploy
```

This bundles `/trigger/**.ts`, uploads to the Trigger.dev cloud, and starts
the schedules. Re-run after any change to the task files or the
framework-agnostic `src/lib/basiq/jobs.ts` module they import from. Changes
to `src/lib/actions/basiq.ts` never require a Trigger.dev redeploy — the
tasks don't import from that file by design (see the grep invariant in
`/trigger/basiq-jobs.ts`).

### Environment variable sync (required before first deploy)

Trigger.dev tasks do **not** automatically inherit Vercel / local env vars.
The tasks access `SUPABASE_SERVICE_ROLE_KEY`, `BASIQ_API_KEY`,
`BASIQ_API_BASE_URL`, `BASIQ_STATE_SECRET`, `BASIQ_WEBHOOK_SECRET`,
`RESEND_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_APP_URL`
via `process.env`. Before the first deploy, add each of these to the
Trigger.dev dashboard under **Project Settings → Environment Variables**
(separate entries for `development`, `staging`, and `production` as
relevant).

Alternative: wire up the `syncVercelEnvVars()` build extension in
`trigger.config.ts` — this keeps Trigger.dev env vars in lockstep with
Vercel. Deferred; manual entry is fine for the small number of keys
currently used.

## Vercel — Next.js app

Unchanged from Prompt 2. The Basiq additions register two new routes:

- `POST /api/basiq/webhook` — HMAC-verified Basiq webhook receiver
- `GET  /api/basiq/callback` — post-consent return URL

Both are marked `runtime = "nodejs"` (Node crypto + raw body access) and
`dynamic = "force-dynamic"` (every request authentic-verifies, no caching).

## Supabase — schema migrations

Prompt 3's schema additions live in [database-schema.sql](../database-schema.sql)
as the canonical source. When applying to a fresh Supabase project, run
the full file per [REBUILD_INSTRUCTIONS.md](../REBUILD_INSTRUCTIONS.md).
Incremental migrations against an existing dev Supabase are tracked in
the commit log (e.g. the Prompt 3 schema delta was run standalone before
being mirrored into the canonical schema).
