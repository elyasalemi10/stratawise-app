# MSM Build Context — Handoff for Subsequent Prompts

Every prompt in the reconciliation build reads this file first. It captures
the invariants, architecture, and current state of the codebase after the
Prompt 0 consolidation. Treat it as the authoritative starting point.

---

## 1. Product overview

My Strata Management (MSM) is a company-focused strata management platform
for Victorian owners' corporations (OCs). Management company staff operate
subdivisions on behalf of lot owners — levies, budgets, meetings, minutes,
insurance, maintenance, complaints, and compliance evidence trails all live
under one roof. Lot owners get an invited portal to view their lot, pay
levies, vote, chat, submit requests, and download certificates. Initial
compliance focus is VIC legislation; state rules are data-driven so
extending to other states is a seed-data exercise, not a code rewrite.

---

## 2. Stack summary

- **Framework**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **UI**: shadcn/ui components, Tremor charts, Lucide React icons
- **Auth**: Clerk (profiles synced via webhook → `profiles` table)
- **DB**: Supabase Postgres. **NO ORM.** Supabase JS client only. Multi-row
  atomic writes go through Postgres RPC functions called via `supabase.rpc()`.
- **Forms**: Zod + react-hook-form + shadcn Form. Same Zod schemas validate
  client and server.
- **PDFs**: @react-pdf/renderer, templates in `src/lib/pdf/templates/`
- **Background jobs**: Trigger.dev (escalations, polling, distribution)
- **Notifications**: Sonner (toasts, bottom-right). In-app notifications live
  in the `notifications` table.
- **Bank feeds**: Basiq (primary, being wired up). CSV import (interim
  fallback). Manual entry (cash, cheques, historical).
- **Hosting**: Vercel (syd1), Supabase project in AU
- **Font**: Inter. Light mode only. **No Framer Motion. No dark mode.**

---

## 3. Architecture patterns

- Server actions live in `src/lib/actions/*.ts` (shared) or colocated
  `actions.ts` next to the page that owns them.
- Supabase JS client only, no ORM. `createServerClient()` uses the service
  role key and bypasses RLS — only call it from server actions, API routes,
  and Trigger.dev jobs. The browser `getSupabaseClient()` uses the anon key
  and is RLS-constrained.
- RLS is enabled on every table. In the current build, server actions use
  the service role and enforce access via guards in `src/lib/auth.ts`
  (`requireRole`, `requireCompanyRole`, `requireSubdivisionAccess`). RLS
  policies are in place for future direct-from-browser queries.
- Validation is layered: UI (cosmetic) → server action (functional) → RLS
  (database). Zod schemas in `src/lib/validations/` are used client + server.
- Every mutation writes to `audit_log` with before/after JSONB state.
- Every outbound communication (email, SMS, in-app) logs to the
  `communication_log` table.
- No DB transactions via Supabase JS — for multi-row atomic writes use
  Postgres RPC functions (exposed via `supabase.rpc(...)`). See the
  `next_reference_number(prefix)` function for the pattern.
- Every server action calls `requireSubdivisionAccess(subdivisionId)` before
  reading, and `requireCompanyRole(...)` before mutating.
- Toasts via Sonner, bottom-right. Errors don't auto-dismiss.
- Loading states are Skeleton components that mirror the loaded layout
  exactly. No spinners. No page-transition animations. No dark mode.
- Reference numbers: `MSM-{PREFIX}-{YYYY}-{NNNNNN}`, generated from global
  Postgres sequences (never per-subdivision).
- Notifications: in-app via `notifications` (profile-scoped). The
  `notifications.read_at IS NULL` is the single source of truth for unread
  state. Email copies are sent via Resend and logged to `communication_log`.

---

## 4. Reconciliation architecture (the upcoming build)

This is the north-star for every prompt that follows. The reconciliation
system has three conceptually separate data structures linked by a matching
layer.

### 4.1 Bank transactions
A mirror of what moved through the OC's bank account. Three sources,
tracked on `bank_transactions.source`:

1. `basiq` — primary feed (webhook + polling fallback). Every Basiq
   transaction carries a unique `basiq_transaction_id` enforced at the DB
   level for idempotent reprocessing.
2. `csv` — interim fallback while Basiq approval is pending. Uploaded files
   are parsed, previewed, and committed with duplicate detection based on
   (bank_account_id, transaction_date, amount, description).
3. `manual` — cash, cheques, historical entries recorded by the manager.

Each transaction has a `match_status` (`unmatched` | `auto_matched` |
`manually_matched` | `excluded`) and, once matched, a link to reconciliation
artefacts via the matching layer (see §4.3).

### 4.2 Lot ledger
Each lot has a running balance. Debits (levies owed, interest, adjustments)
and credits (payments, write-offs, credit adjustments) are entries on this
ledger. **Balance = sum of active credits − sum of active debits.** Voided
entries are excluded. No hard deletes on financial data — only voids with
offsetting entries. Every write goes through an RPC function for atomicity.

### 4.3 Reconciliation matches
A link table connecting a bank transaction to one or more ledger credits.
Managers **match** a transaction to ledger entries; they never "move" it
from one side to the other. Matching is either:

- **Automatic** — by exact reference, known sender, amount, or Basiq
  payload. Stored in `match_confidence` enum; will be extended in later
  prompts.
- **Manual** — the manager picks it from the unmatched list and links it.

A match's total linked amount must not exceed the bank transaction amount.
Partial matches are allowed (e.g. one transaction pays two different
lots' levies pro-rata).

### 4.4 Oldest-unpaid-date (derived)
A per-lot derived field used for statutory interest calculation. Walk the
lot's debits oldest-first, consume them with total payments-to-date — the
first uncovered debit's date is the oldest unpaid date. **No per-payment
allocation required** unless the owner explicitly references a specific
levy; in that case, that levy is marked paid and skipped in the walk.

### 4.5 Owner vs member
- `subdivision_members` (joined to `profiles`) is the billing destination
  for levy notices, receipts, arrears notices, and statements. This is the
  legal "roll" address.
- `profiles` is the logged-in portal user.
- In-app notifications go to the profile.
- Emails go to the subdivision member's email.
- When a member has no profile yet (invitation not accepted), in-app
  notifications queue on the member row and flush to the profile on
  invitation acceptance.

The Prompt 0 consolidation dropped the denormalised `lots.owner_*` columns
and replaced them with a shared helper — `src/lib/actions/lot-ownership.ts`
— that returns the active member (or pending invitation, or "unowned") for
each lot in one batch query.

---

## 5. Key invariants

- **Basiq idempotency**: `bank_transactions.basiq_transaction_id` is
  `UNIQUE`. Any webhook or polling replay must be idempotent.
- **No hard deletes on financial data**: void with offsetting entries.
  Enforced at the RPC layer.
- **Every financial write goes through an RPC function** (atomic). Never
  perform multi-row financial mutations with multiple JS-side inserts.
- **Every mutation writes to `audit_log`** with `before_state` +
  `after_state` JSONB. This is the evidence trail.
- **Reconciliation match total ≤ bank transaction amount**. Enforced in
  the matching RPC.
- **RLS is enabled on every table**; the service-role client bypasses it;
  auth guards in `src/lib/auth.ts` do the actual enforcement. Never issue
  sensitive queries from the browser without going through a server
  action.
- **Dual-fund accounting**: every budget, levy, payment, and reserve
  entry carries `fund_type` (`administrative` | `capital_works`). The
  platform fee is mandatory in every admin fund budget and cannot be
  removed by users.
- **Interest cap**: VIC legal max is 2.5%/month. Enforced on the
  `subdivisions.interest_rate_monthly` column (application layer).
- **Notice-period blocking**: meeting dates grey out within 14 days,
  levy due dates within 28 days of issue.
- **OC tiers**: auto-calculated from `total_lots` (≤2→T5, ≤12→T4,
  ≤50→T3, ≤100→T2, else T1) — VIC-legal thresholds, corrected in
  Prompt 0.

---

## 6. File locations

```
src/app/(auth)/                    — sign-in, sign-up, onboarding, invite accept
src/app/(dashboard)/               — all authenticated pages
  dashboard/                       — cross-subdivision landing
  subdivisions/                    — subdivision list + wizard + detail pages
  subdivisions/new/                — wizard (steps 1–5, colocated actions.ts)
  subdivisions/[id]/               — per-subdivision routes
    dashboard/                     — overview KPIs
    manage/                        — lots tab, subdivision settings, inline edit
    lots/[lotId]/                  — single lot detail
    finance/                       — levies, payments, reconciliation (upcoming),
                                     insurance, bank accounts
    meetings/                      — meetings, agenda, votes, minutes
    reports/                       — levy history, lot register, audit, OC cert
    my-levies/                     — lot-owner levy inbox
    settings/                      — subdivision-scoped settings
  settings/                        — user + company settings
  levies/                          — company-wide levy dashboard
src/app/api/                       — webhooks (Clerk, Basiq [upcoming]) + docs API
src/app/legal/                     — public terms + privacy
src/lib/                           — shared utilities
  actions/                         — server actions (shared across pages)
    lot-ownership.ts               — NEW: canonical owner resolver
    subdivision.ts                 — subdivision + lot list queries
    levy.ts                        — levy preview, batch create, send emails
    invitations.ts                 — team + lot-owner invites
    reports.ts                     — report data assembly
    notifications.ts               — in-app notifications
    insurance.ts, budget.ts, team.ts, bank-transactions.ts
  auth.ts                          — Clerk session → profile, role guards
  supabase.ts                      — server + browser client factories
  email.ts                         — Resend transport + templates
  validations/                     — Zod schemas (client + server)
  pdf/templates/                   — @react-pdf/renderer templates
  utils.ts                         — small helpers (date formatting, etc.)
src/trigger/                       — Trigger.dev job definitions
src/components/
  layout/                          — sidebar, header, breadcrumbs
  ui/                              — shadcn primitives
  shared/                          — PageHeader, KPI cards, skeletons, empty states
src/types/                         — application types
database-schema.sql                — SINGLE SOURCE OF TRUTH for the schema
CONSOLIDATION_PLAN.md              — Prompt 0 decision record
REBUILD_INSTRUCTIONS.md            — how to rebuild the DB from scratch
CONTEXT.md                         — this file
CLAUDE.md                          — Claude-facing repo rules
project-context.md                 — architectural decisions, edge cases, flows
project-roadmap.md                 — per-step delivery plan (when present)
```

---

## 7. What was consolidated in Prompt 0

### Drift resolved
- `database-schema.sql` is now the single authoritative file.
- 9 `database-migration-*.sql` files merged in and deleted.
- `notifications` had conflicting shapes across base schema, migration, and
  runtime code; runtime-matching shape (`profile_id`, `title`, `body`,
  `link`, `read_at`, `subdivision_id`, `type`) wins.
- `calculate_oc_tier()` fixed to VIC-legal thresholds (was ≤9→T4 in base,
  migrations had ≤12→T4 correction — now baked in).

### Tables dropped
- `bank_reconciliation_sessions` (zero code references)
- `lot_financial_summary` materialised view + `refresh_lot_financial_summary()`
  helper (never refreshed outside the helper; never queried anywhere)

### Columns dropped
- `lots.owner_name`, `lots.owner_email`, `lots.owner_phone`, `lots.owner_type`,
  `lots.owner_occupied` — ownership is modelled canonically via
  `subdivision_members` + `profiles`. 16 files were rewritten to use the
  new `src/lib/actions/lot-ownership.ts` helper.
- `management_companies.stripe_customer_id` (zero code refs; Stripe Connect
  deferred)
- `bank_accounts.stripe_account_id` (same)
- `notifications.read` boolean (`read_at IS NULL` is now the single source
  of truth for unread state)

### Columns/tables/enums added or promoted from migrations
- `lots.unit_number`
- `management_companies.registered_name`, `signature_url`
- `subdivisions.common_seal_text`, `inspection_address`, `manager_appointed`,
  `administrator_appointed`, `subdivision_type`, `management_start_date`,
  `levy_year_start_month`, `levies_per_year`, `bank_connection_type`,
  `street_number`, `street_name`, `suburb`, `setup_step` (with CHECK
  constraints)
- `documents.lot_id` (nullable FK for lot-scoped docs) + partial indexes
- `insurance_policies.document_url`
- `levy_notices.batch_id`, `pdf_url`
- `levy_batches` table + `msm_levy_batch_seq` + `levy_batch_status` enum
- `levy_notice_items` table
- Missing `trg_updated_at_*` triggers on `bank_accounts` and
  `insurance_policies`

### Wizard step-4 behaviour change
- Previously the wizard wrote owner name/email/phone to `lots.owner_*`.
- Now the wizard creates a **pending `invitations` row per lot** that
  provided an email. Invitation emails are **deferred** — they dispatch
  only when `completeSubdivisionSetup` runs at the end of the wizard.
- Until the owner accepts, the pending invitation carries the
  pre-acceptance identity. `getLotOwners()` returns
  `owner_status: "pending_invitation"` plus name/email/phone from the
  invitation row, so UI and PDFs render coherently.

### No renames
Per the consolidation plan's "minimise renames" directive, the database
column names are unchanged. TypeScript interfaces introduced new field
names (`owner_display_name`, `owner_contact_email`, `owner_contact_phone`,
`owner_status`) to reflect that the data is now derived, not stored.

---

## 8. What comes next

The full delivery plan is 8 prompts. Prompt 0 is complete; the rest build
the reconciliation feature progressively on top of the now-stable schema.

- [x] **Prompt 0** — Schema consolidation & structural cleanup.
- [ ] **Prompt 1** — Lot ledger foundation: ledger tables + state
  materialisation + RPCs (debit, credit, adjustment, void, batch debit) +
  atomic levy-debit generation on batch create. No UI.
- [ ] **Prompt 2** — CSV import full flow + manual payment entry against
  the ledger.
- [ ] **Prompt 3** — Basiq integration (webhook + polling fallback,
  idempotent by `basiq_transaction_id`).
- [ ] **Prompt 4** — Auto-matching logic: exact reference, BPAY CRN,
  known-sender memory, amount+window heuristics, explicit-levy-reference
  honouring.
- [ ] **Prompt 5** — Owner self-report payment flow (submit + manager
  approval writes the ledger credit).
- [ ] **Prompt 6** — Interest calculation cron (writes `interest` ledger
  debits), levy-notice status sweep, and arrears notification emails.
- [ ] **Prompt 7** — Statement PDFs + reconciliation reporting dashboards
  (arrears, evidence-trail exports, bulk match operations).

Each subsequent prompt should read this file and `CLAUDE.md` first, then
the relevant sections of `project-context.md`.
