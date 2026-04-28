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
ledger. **Balance = sum of all credits − sum of all debits** (active and
voided both counted). When an entry is voided, an offsetting entry of
opposite type is created so they cancel in the balance sum. Both the
original entry and its offset remain in the ledger permanently — the
ledger is append-only. The oldest-unpaid-date walker filters to active
entries only (excluding voided debits and `void_offset` credits) so
reversed debts don't appear as arrears and offset credits aren't counted
as "free money" to absorb other debts. Every write goes through an RPC
function for atomicity.

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

**Priority-aware walker (PP4-A):** the walk orders debits by
`(allocation_priority ASC, entry_date ASC, created_at ASC)` instead of
date-only. Categories map to priorities: interest=1, levy=2, special_levy=3,
adjustment_debit/writeoff=4. For lots with mixed regular/special-levy
debits, untargeted credits absorb regular levies before special levies
(allocation priority 2 before 3), changing which debit is the oldest-unpaid
relative to a date-only walk. Targeted credits (with `levy_notice_id` or
`reference` set) bypass priority entirely and net directly against their
target. Pre-launch the semantic is changeable; post-launch any change
requires migrating computed `oldest_unpaid_date_*` values across all
mixed-debit lots.

**Snapshot-aware per-notice status (PP4-A):** `_walk_per_notice_status`
returns per-notice payment status (`paid | partially_paid | outstanding`)
at a given asOfDate. Visibility filter: `entry_date <= asOfDate AND
((status = 'active') OR (status = 'voided' AND voided_at::date > asOfDate))`.
Wrapped by `computeLevyPaymentStatus` (TS); Prompt 7 certificate rendering
must call this rather than reading `levy_notices.status` directly.

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

### What Prompt 1 added

**New enums.** `ledger_entry_type` (`debit | credit`),
`ledger_entry_category` (9 values including `void_offset`),
`ledger_entry_status` (`active | voided`), `reconciliation_match_method`
(6 values). `levy_batch_status` extended with `ledger_written` —
lifecycle is now `draft → ledger_written → sent / partially_sent`.

**New tables.**
- `lot_ledger_entries` — per-lot debit/credit log. No hard deletes: voids
  create a `void_offset` entry that points back to the original.
- `lot_ledger_state` — materialised per-lot summary (balances per fund,
  `oldest_unpaid_date_*`, `last_entry_at`). Seeded by a trigger on
  `lots` INSERT.
- `reconciliation_matches` — scaffold for the bank-txn ↔ ledger link.
  Writes arrive in Prompt 2+.

**New column.** `bank_transactions.matched_total` (scaffold for
reconciliation totalling; app-layer guard `matched_total <= amount`).

**RPCs.** Every financial mutation goes through one of:
`rpc_levy_debit`, `rpc_payment_credit`, `rpc_ledger_adjustment`,
`rpc_ledger_void`, `rpc_levy_batch_debit`. All call
`recompute_lot_ledger_state` internally and write `audit_log` with
before/after JSONB. The void RPC also flips `levy_notices.status →
written_off` when voiding a levy-category debit.

**Helper function.** `_walk_oldest_unpaid(lot_id, fund_type)` walks
active debits oldest-first. Free credits (no `levy_notice_id`, no
`reference`) feed a pool; targeted credits (either set) are pinned to
the matching debit. Excess targeted credit does NOT spill into the
free pool — it stays on the notice. Surplus credit still shows up in
the balance via the simple SUM(credit) − SUM(debit) calculation.

**View.** `v_levy_notice_status` derives a levy notice's effective
status from the ledger (precedence: `written_off` > `paid` >
`partially_paid` > `overdue` > stored). The stored
`levy_notices.status` column remains for the last explicit transition;
a cron sweep to keep them in sync is Prompt 6.

**Levy generation rewrite.** `createLevyBatch` now writes ledger
debits atomically after inserting notices. On RPC failure, the batch +
notices + items are rolled back; if rollback itself is incomplete, a
`severity: critical` `audit_log` entry names the orphans.
`cancelBatch` rejects once the batch is past `draft` — users must use
the void RPC per-notice. `markBatchPaid` now logs a
`ledger_coverage_warning` when ledger credits already cover notices
(doesn't block — legacy path).

**Penalty interest.** No existing code path created
`levy_type = 'penalty_interest'` rows; nothing to stub. Flagged for
Prompt 6 which will own interest-debit writes via a dedicated RPC.

**Server actions.** `src/lib/actions/ledger.ts` exposes
`getLotBalance`, `getLotLedgerEntries`, `recordAdjustment`,
`voidLedgerEntry`, `getSubdivisionArrearsSummary` (queries
`lot_ledger_state` only — never re-walks), and `getLotStatement` (data
assembly for the future statement PDF). Zod schemas in
`src/lib/validations/ledger.ts`.

**Verification.** `src/lib/actions/ledger.verification.ts` — `tsx` CLI
that creates isolated test data under a `__VERIFY_LEDGER__` marker,
runs the 9 Prompt 1 §6 scenarios, and cleans up (or `--no-cleanup` to
leave the fixture for inspection; `--cleanup` cleans stale runs).

### What Prompt 2 added

**New table.** `undeposited_funds_entries` — staging table for
cash/cheque receipts. Rows live here from `rpc_record_cash_receipt`
until `rpc_deposit_receipts` links them to a bank transaction. Each row
carries `receipt_number` (MSM-RCPT-YYYY-NNNNNN), `amount`,
`bank_account_id`, `linked_ledger_credit_id` (the ledger credit it
created), `status` (`pending_deposit | deposited | voided`), and
deposit tracking columns (`deposited_at`, `deposited_bank_txn_id`,
`deposited_by`).

**Reconciliation_matches populated.** The `reconciliation_matches`
scaffold from Prompt 1 is now fully written. Each row links one
`bank_transaction_id` to one `ledger_entry_id` with a `matched_amount`,
`match_method`, and `matched_by`.

**Auto-matching is application-layer only (no DB trigger).** After a
manual bank transaction is inserted, `addManualBankTransaction` calls
`tryAutoMatchByReference` as a best-effort step — it scans the
description for a single MSM-LEV-* reference, looks up the levy notice,
and calls `rpc_reconcile_bank_transaction` if an outstanding amount
exists. If matching fails, the error is written to `audit_log` and the
function returns `{ matched: false }` without failing or rolling back the
outer insert. CSV imports have an inline copy of the same logic.

**RPCs.** Three core transactional RPCs in `database-schema.sql`:
- `rpc_reconcile_bank_transaction(p_bank_transaction_id, p_allocations[],
  p_match_method, p_match_confidence, p_notes, p_performed_by)` —
  allocates one bank txn across ≥1 lots; updates `matched_total`,
  inserts `reconciliation_matches`, calls `rpc_payment_credit` per lot.
- `rpc_unmatch_bank_transaction(p_bank_txn_id, p_reason, p_performed_by)` —
  reverses a match: voids all credits via `rpc_ledger_void`, deletes
  match rows, resets `matched_total` and `match_status` to `unmatched`.
  Re-opens any deposited receipts to `pending_deposit`.
- `rpc_record_cash_receipt(...)` — records a cash/cheque receipt: calls
  `rpc_payment_credit` for the lot, inserts `undeposited_funds_entries`,
  assigns `MSM-RCPT-YYYY-NNNNNN` reference.

**Server actions.** `src/lib/actions/reconciliation.ts` exposes
`addManualBankTransaction`, `getReconciliationQueue`,
`getReconciliationDetail`, `matchBankTransaction`,
`unmatchBankTransaction`, `excludeBankTransaction`,
`unexcludeBankTransaction`, `voidBankTransaction`.
`src/lib/actions/bank-transactions.ts` gains `getBankAccountsForSubdivision`,
`getUndepositedEntries`, `recordCashReceipt`, `depositReceipts`,
`voidCashReceipt`. `src/lib/actions/ledger.ts` gains
`getLedgerPaymentSourceLinks` (list-level source map for tooltip routing)
and `getLedgerEntryDetail` (full drawer payload: entry + audit trail
with performer names + source chain).

**Auth resolver seam.** `src/lib/auth-resolver.ts` carries two
`__`-prefixed exports (`__setUserIdResolverForVerification`,
`__getUserIdResolverForVerification`) used exclusively by `*.verification.ts`
scripts to bypass Clerk in standalone `tsx` runs. Application code never
imports them. See `PRE_LAUNCH_CLEANUP.md` for the grep command to verify.

**Verification harness.** `src/lib/actions/reconciliation.verification.ts`
— 12 scenarios covering manual entry, auto-match, partial match,
multi-lot manual match, unmatch round-trip, receipt → deposit, sum
mismatch rejection, exclude/unexclude, void cascade for bank txn and
receipt (pending and deposited). Runs clean with 12/12 pass.

**UI surfaces.**
- Reconciliation queue: `/finance/reconciliation` — filterable table of
  bank transactions with status badges and sidebar link.
- Reconciliation detail: `/finance/reconciliation/[bankTxnId]` — full
  transaction view with match/unmatch/void actions and lot allocation.
- Bank account page enhancements: undeposited funds panel (staging table
  view), record cash receipt flow, deposit-receipts flow.
- Lot ledger tab (replaces Payments placeholder): 4-KPI header, filter
  bar (fund, category, date range, include-voided toggle), running balance
  column (single-fund mode only), per-row void with `VoidEntryDialog`,
  `RecordCashReceiptDialog` and `RecordAdjustmentDialog` pre-filled with
  the lot.
- Ledger entry drawer: Sheet panel (fade-in, no slide) lazy-loaded on
  "View" click. Shows entry metadata, source chain deep links (levy →
  batch, payment → recon/receipt), and audit trail with performer names
  resolved from `profiles`.
- `markBatchPaid` relocated to "Advanced actions" DropdownMenu with
  legacy warning and an `AlertDialog` confirmation gate.

**Shared components.** `RecordCashReceiptDialog` and
`RecordAdjustmentDialog` (both accept `defaultLotId` for pre-fill).
`SharedBadges` for reuse across surfaces. `alert-dialog.tsx` UI wrapper
(thin over Dialog, follows custom `form.tsx` pattern).

**Deferred to later prompts.**
- Basiq bank feed connection and webhook ingestion → Prompt 3.
- Auto-matching beyond MSM-LEV reference (BPAY CRN, sender identity,
  confidence scoring) → Prompt 4.
- Owner self-report and duplicate detection → Prompt 5.
- Lot statement PDF (`getLotStatement` data is ready; PDF template
  pending) → Prompt 7.

### What Prompt 3 added

**Scope.** Basiq-powered bank feed integration — consent lifecycle,
webhook ingestion, scheduled polling, force-sync before critical
operations, 12-month consent expiry with reminders, and gap
reconciliation when a manager reauthorises late. No UX copy uses
"Basiq"; the system refers to it as "bank feed" or "automatic bank
feed". "Basiq" appears only in legal/privacy disclosures and internal
audit logs.

**New tables (6).**
- `basiq_connections` — one row per CDR consent per OC. Lifecycle
  (`pending → active → syncing ↔ active → expired|revoked|failed`),
  12-month expiry, nominated rep, last-sync + last-webhook tracking.
  `basiq_external_connection_id` (TEXT) holds Basiq's own connection
  string, kept visually distinct from `bank_accounts.basiq_connection_id`
  (our UUID FK). Legal transitions documented in an inline comment.
- `basiq_reauth_notifications` — idempotency ledger for the
  30/14/7/3/1-day reminders + expired + gap_reconciliation emails.
  `UNIQUE(connection, type)` guarantees each reminder sends once.
- `basiq_gap_reports` — one row per late-reauth gap. Generated
  `gap_duration_hours`, counts for backfilled/auto-matched/manual-review,
  `committee_notified` flag when gap > 30 days, `dismissed_at` +
  `dismissed_by` for team-wide banner dismissal, undismissed partial
  index.
- `subdivision_notification_suppressions` — 48h arrears-email pause
  after a gap-reconciliation event. Read by Prompt 6 arrears flows.
- Legacy `bank_accounts.{basiq_user_id, basiq_connection_id TEXT,
  last_poll_at}` dropped (never wired up in prod) and replaced with
  `{basiq_connection_id UUID FK, basiq_account_id TEXT, last_sync_at
  TIMESTAMPTZ}`.
- `bank_transactions.basiq_raw JSONB` added; `basiq_transaction_id`
  (unique) was pre-wired from Prompt 0.

**New RPCs (2).** `rpc_insert_basiq_transaction` (idempotent; silent
on duplicates; 20KB `basiq_raw` size guard; writes `audit_log` on
first insert). `rpc_mark_basiq_connection_expired` (state flip to
`expired` + audit; idempotent).

**Server actions (15+).** `src/lib/actions/basiq.ts` — `createBasiqUser`,
`startBasiqConsent`, `completeBasiqConsent`, `getBasiqConnectionStatus`,
`disconnectBasiqConnection`, `initiateReauth`, `forceSyncBasiqConnection`,
`pollBasiqConnection` (auth-required wrapper; cron path goes through
`src/lib/basiq/jobs.ts` → `pollConnectionAsSystem`), `runGapReconciliation`,
`listBasiqInstitutions` (24h cache), `sendPendingReauthNotifications`,
`sweepExpiredConnections`, `isArrearsNotificationSuppressed`,
`getBasiqConnectionDetails`, `handleBasiqEvent` (webhook dispatcher),
`autoBindBankAccountsForConnection`, `releaseBankAccountFromConnection`,
`getFeedStateForBankAccount`, `getBankAccountsForWizardStep`,
`listBasiqConnectionsForSubdivision`, `getActiveGapReportForSubdivision`,
`getGapReportPageData`, `dismissGapReport`.

**Framework-agnostic modules (`src/lib/basiq/*.ts`).**
- `client.ts` — `BasiqApiClient` interface + `RealBasiqApiClient` (60-min
  server-token cache, 15s timeout, single 5xx retry, `basiq-version:
  3.0` header) + `__setBasiqApiClientForVerification` seam.
- `parsers.ts` — 7 bank parsers (CBA, NAB, ANZ, WBC, Macquarie, ING,
  Bendigo) with a generic fallback. All per-bank entries currently
  route to the generic parser with `TODO(pre-launch)` flags; no
  bank-specific patterns fabricated.
- `state.ts` — stateless HMAC-signed CSRF state tokens for the Consent
  UI round-trip (1h TTL).
- `webhook-signature.ts` — HMAC-SHA256 verifier matching Basiq's
  webhooks-security spec (headers `webhook-id`, `webhook-timestamp`,
  `webhook-signature`; signed content `id.timestamp.rawBody`; 5-minute
  replay tolerance).
- `jobs.ts` — `pollConnectionAsSystem`, `sendPendingReauthNotificationsJob`,
  `sweepExpiredConnectionsJob`. No `"use server"` directive; callable
  from Trigger.dev tasks without crossing the Next.js request context.

**Route handlers.**
- `POST /api/basiq/webhook` — HMAC-verified dispatcher. Bad signature
  → 401 + audit entry. Good signature → `handleBasiqEvent` (handles
  `transactions.updated`, `connection.invalidated`, `account.updated`;
  `consent.revoked` is NOT a Basiq event — revocation surfaces via
  `connection.invalidated` with remote-status inspection).
- `GET /api/basiq/callback` — verifies the state token, runs
  `completeBasiqConsent`, `autoBindBankAccountsForConnection`, and
  (when the prior state was expired/revoked/failed) `runGapReconciliation`.
  Redirects to the caller-supplied `returnTo` with `?basiq=connected`
  appended, or `?basiq=error&message=…` on failure.

**Trigger.dev scheduled tasks** (`/trigger/basiq-jobs.ts`, `@trigger.dev/sdk@4.4.4`):
- `midnight-basiq-poll` — daily 00:00 Australia/Melbourne;
  Promise.allSettled over active connections with per-connection 15s
  timeout; one aggregate audit_log entry per batch run.
- `daily-reauth-notifications` — daily 09:00 Australia/Melbourne;
  30/14/7/3/1-day cadence with idempotency via
  `basiq_reauth_notifications`.
- `hourly-expiry-check` — hourly (UTC); flips `consent_expires_at`-past
  rows to `expired`, emails the nominated rep.
- All three tasks import ONLY from `src/lib/basiq/jobs.ts` — grep
  invariant `grep -n "from.*actions" trigger/basiq-jobs.ts` returns
  zero code hits.

**UI surfaces.**
- Wizard step 4 "Connect bank feeds" (optional) — per-account Connect
  buttons; institution picker with search, generic `Landmark` icons
  (no Basiq-branded logos); pending-resume banner; inline success /
  error banners; single Skip-for-now → Continue button transition.
- Bank-account page: `GapReconciliationBanner` at the top of the
  content area; inline `BankFeedPanel` inside each bank-account card
  rendering one of five states (Not connected / Active / Expiring soon
  / Expired / Revoked|Failed) plus a sixth Pending state for abandoned
  consent. Active/Expiring rows expose a 30s-cooldown Sync-now button
  and a Manage dialog. Manage dialog shows institution, grant +
  expiry dates, last-synced relative (en-AU), nominated rep, human-
  readable linked accounts, optional last-error, Reauthorise and
  Disconnect (guarded by an AlertDialog confirmation).
- Read-only gap report page at
  `/subdivisions/[id]/finance/reconciliation/gap-reports/[reportId]` —
  Summary + Metrics + whole-row-clickable transactions table +
  arrears-suppression footer. Breadcrumb-carried title
  "Reconciliation > Gap report". 404 on missing or cross-subdivision
  reports; renders fine for dismissed reports via direct URL.
- `InstitutionPicker` extracted to `src/components/shared/` and reused
  by the wizard step and the bank-account page's Connect/Reconnect
  flows.

**Help + legal artefacts.**
- `docs/help/nominated-representative-setup.md` (canonical markdown).
- `src/app/(dashboard)/help/nominated-representative-setup/page.tsx`
  (in-app mirror at `/help/nominated-representative-setup`).
- `PRIVACY_POLICY_BASIQ_DISCLOSURE.md` — one-paragraph CDR disclosure
  for Elyas to paste into the privacy policy document.

**Trust-hole fixes during Prompt 3.**
- `pollBasiqConnection` previously accepted an optional `performedBy`
  parameter from callers (trust hole in a `"use server"` module —
  any client component could import and invoke with an arbitrary
  profile UUID). Refactored: the server action now requires auth
  unconditionally; cron callers go through the non-`"use server"`
  `src/lib/basiq/jobs.ts::pollConnectionAsSystem`.
- `tryAutoMatchByReference` carried the same shape after Prompt 2's
  export. Moved to `src/lib/reconciliation/auto-match.ts` — no
  `"use server"` directive, not reachable from client components.
  Call sites (`addManualBankTransaction`, `pollConnectionAsSystem`)
  update their imports only; audit accuracy preserved (performer
  still flows from the server-side resolution point).
- `sweepExpiredConnections` had a latent FK landmine: the fallback
  performer was `row.id` (a `basiq_connections.id`, not a profile
  UUID). Changed to `row.created_by` (NOT NULL FK to profiles).

**Verification.** `src/lib/actions/basiq.verification.ts` — 15
scenarios covering user creation, consent start/complete,
force-sync + auto-match, duplicate-id silent dedupe, 30s rate-limit
bypass, poll flow, HMAC signature good/bad, connection.invalidated
dispatch, expired-sync skip, reauth URL shape, 5-day gap
reconciliation, 40-day committee-notified gap, reauth cadence
idempotency, disconnect-preserves-transactions. Zero live HTTP calls
in the default run; optional `--live` flag reserved for sandbox
smoke testing.

**What Prompt 3 did NOT do (flagged in `PRE_LAUNCH_CLEANUP.md`).**
- Bank-specific description parsing (all 7 parsers are generic-fallback
  wrappers pending sandbox sample verification).
- `consecutive_sync_failures` counter + inline ≥2-failures warning on
  the feed panel.
- Precise lineage from `basiq_gap_reports` to backfilled
  `bank_transactions` rows (currently a date-window heuristic).
- Gap-report footer absolute-only suppression copy (can't show
  "active vs past" because `Date.now()` is impure in Server Components
  per the React Compiler lint rule).
- Pre-launch URL verification for the seven bank CDR pages in the
  help doc.
- Pre-launch RPC security-model audit (`SECURITY DEFINER` opt-in).

---

## 8. What comes next

The full delivery plan is 8 prompts. Prompt 0 is complete; the rest build
the reconciliation feature progressively on top of the now-stable schema.

- [x] Prompt 0 — Schema consolidation & structural cleanup
- [x] Prompt 1 — Lot ledger foundation + RPC functions + levy generation rewrite
- [x] Prompt 2 — Manual bank transaction entry + manual matching UI + cash/cheque receipts + undeposited funds + void/reversal
- [x] Prompt 3 — Basiq integration (connect, consent, polling, webhook, reauth, gap reconciliation)
- [ ] Prompt 4 — Auto-matching pipeline (levy ref, BPAY CRN, sender identity, confidence, auto-learn)
- [ ] Prompt 5 — Duplicate detection + owner self-report
- [ ] Prompt 6 — Notifications + interest/arrears/penalty
- [ ] Prompt 7 — Reporting, exports, owner portal, polish

Each subsequent prompt should read this file and `CLAUDE.md` first, then
the relevant sections of `project-context.md`.
