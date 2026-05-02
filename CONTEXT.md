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

### 4.6 Remember-payer collision resolution (two-call flow)

Persisting "this canonical sender → this lot" mapping during reconciliation
is a **two-call flow**, deliberately separated from the matching call:

1. `reconcileTransaction({ remember_payer: true, ... })` — runs the match
   via `rpc_reconcile_bank_transaction` and atomically inserts a new
   `bank_payer_mappings` row. If a *different* lot already has an active
   mapping for this canonical sender, the conflicting rows are flipped to
   `ambiguous`, the new insert is skipped, and the response carries a
   `mappingCollision` payload describing the three-way options
   (update / keep_existing / remove). **The match is committed in this
   call** (`matchIds.length ≥ 1`) — collision detection runs *after*
   reconcile and only mutates `bank_payer_mappings`.
2. If the response contained `mappingCollision`, the UI shows the dialog.
   The user's choice is submitted via
   `resolvePayerMappingCollision({ resolution, expected_collisions, ... })`.

`resolvePayerMappingCollision` does **not** touch
`rpc_reconcile_bank_transaction`. The match was already applied in call 1;
this server action only mutates `bank_payer_mappings` rows
(via `resolveCollision` in `src/lib/reconciliation/mappings.ts`).

**Future authors: do not collapse this back into a single-call flow.** The
original PP4-B implementation accepted `mapping_resolution` as an extension
of the reconcile schema and re-invoked the RPC on the second call, which
caused over-allocation against an already-matched transaction (and was
blocked downstream by the `allocations.min(1)` schema constraint, making an
empty-allocation re-call impossible too). PP4-C split the contract so each
server action owns a single concern.

### 4.7 Bank-side duplicate detection (PP5-A)

Detection runs synchronously after every successful insert into
`bank_transactions` from the three sources (CSV import, manual entry,
Basiq poll). Helper lives at
`src/lib/reconciliation/duplicate-detection.ts` — pure functions, no
`"use server"`. Callers invoke `detectDuplicate` then, on flagged=true,
`markDuplicate`, then **skip** `tryAutoMatch`. The orchestrator also
self-defends — it reads `duplicate_status` in its combined fetch and
early-outs for `'suspected'` and `'confirmed'` rows, returning
`duplicate_skipped: true` and writing **no** orchestrator-summary
audit. The `bank_transaction.duplicate_detected` audit from the detector
is the audit-of-record.

**Detection scope is per `bank_account_id`.** Cross-account (admin x
capital_works in the same subdivision) and cross-subdivision matches are
intentionally out of scope — different accounts cannot legitimately
receive the same payment, and a hash-equal cross-account match is far more
likely a coincidence than a duplicate.

**Detection key**: hash equality on the normalised description, equal
amount, same bank_account, within +/-2 days. Voided rows
(`is_voided=true`), excluded rows (`match_status='excluded'`), and
already-suspected rows (`duplicate_of` non-null) are excluded from the
candidate pool — voided/excluded can't anchor a duplicate; the
`duplicate_of` filter is **chain prevention** so a third-arrival doesn't
re-anchor on a row that already points elsewhere.

**Description normaliser**: `normaliseDescription` uppercases, strips MSM
reference tokens (`LEV-`, `RCP-`, `PAY-`, `MSM-{PREFIX}-{YYYY}-{NNNN}`),
strips non-word characters, collapses whitespace, trims. Reference
tokens are stripped because two sources may format them differently
("LEV-12" vs "Ref:LEV-12" vs "lev12") — the normaliser collapses these
so the hash is source-agnostic. **Empty-after-normalise descriptions DO
flag** — two amount-equal rows on the same day whose descriptions
normalise to "" hash-collide and the detector flags them. Documented
behaviour; recovery path is fast (manager rejects via the review action).

**`description_hash`**: SHA-256 truncated to **16 hex chars (64 bits)**.
Stored in `duplicate_metadata` for forensics. Collision risk in a single
bank_account ±2-day candidate pool is ~10^-19 — negligible. The hash is
not the storage key (the detector recomputes both sides in memory at
detection time); the stored hash exists so support can grep `audit_log`
metadata for forensic recovery.

**`duplicate_status` × `match_status` are orthogonal.** `confirmDuplicate`
moves status to `'confirmed'` but does **not** touch `match_status`.
Queue queries that should hide confirmed duplicates filter
`WHERE duplicate_status IS DISTINCT FROM 'confirmed'`. Future authors:
do **not** collapse this back to "confirmed-duplicate sets
match_status='excluded'" — the chk_bt_excluded_reason constraint
requires `excluded_reason`, and overloading `excluded` with two distinct
semantic flavours destroys forensics.

**Default queue behaviour (PP5-D-A clarification):**
The reconciliation queue (`getReconciliationQueue` →
`/reconciliation` page) applies the following filter on the
`duplicate_status` axis by default:
- `null` (no flag): visible
- `'suspected'`: visible **with `<DuplicateBadge />`**; click → `<BankDuplicateReviewDialog />`
- `'rejected'`: visible **as a normal row** (manager already said
  not-a-duplicate; no badge needed)
- `'confirmed'`: **hidden**

The `?dup=1` URL param ("Possible duplicate" chip filter, surfaced as
a single-bool toggle in the queue's filter card) narrows the result
set to ONLY `'suspected'` rows. Queue verification scenario PD-1 in
`reconciliation.verification.ts` exercises both branches.

**Detection runs on debits too.** The orchestrator-skip rule is
credits-only (orchestrator already early-outs on `amount <= 0`), but the
detection rule is direction-agnostic — flagged debit duplicates (e.g. a
bank fee imported twice) get the badge for manager review even though
auto-match was never going to run.

**markDuplicate failure handling.** If the UPDATE or audit INSERT inside
`markDuplicate` fails, the row stays `unmatched + unmarked` in the DB.
Callers (CSV import, manual entry, Basiq poll) **still skip
`tryAutoMatch`** in this case — don't compound a DB issue with allocation
work. The failure is logged via `console.error` with
`{ bank_transaction_id, subdivision_id, duplicate_of, error }` for
Sentry. Manager investigates via the audit-gap or the Sentry alert; the
row will reappear in the next detection run if a re-trigger path is
introduced.

**Backfill not in PP5-A.** Pre-existing rows have `duplicate_status=NULL`
and are never retroactively scanned. New rows post-deploy go through the
detector. PRE_LAUNCH_CLEANUP records the option of a one-shot CLI
sweeper if a real-world need emerges.

**`bank_transaction.csv_imported` audit shape change.** The old
`after_state.duplicates` key is gone; new keys are
`after_state.exact_duplicates_dropped` and
`after_state.cross_source_duplicates_flagged`. Forensics queries that
look for `after_state->>'duplicates'` will not find post-PP5-A rows.
audit_log is append-only so old rows still carry the old shape — query
both for cross-period forensics.

**Per-`ImportSummary` field semantics**:
- `exact_duplicates_dropped`: silently dropped before insert via the
  exact-key set `(transaction_date|amount|description-trimmed)`. Catches
  intra-batch (same CSV uploads the row twice) **and** prior-import
  (the row was already in the DB from an earlier import). Soft-renamed
  from `duplicates` so the dual nature is explicit.
- `cross_source_duplicates_flagged`: row was inserted, then flagged by
  the bank-side detector. Distinct from `exact_duplicates_dropped`;
  these rows persist in the DB with `duplicate_status='suspected'` for
  manager review.

**Manager review actions** (`confirmDuplicate`, `rejectDuplicate`):
- Both gate on `duplicate_status === 'suspected'` and return
  `errorCode='NOT_SUSPECTED'` if called on a non-suspected row. Action
  is **not idempotent at the server** — the UI must debounce.
- `confirmDuplicate` blocks with `errorCode='MATCH_ACTIVE'` if the row
  has `match_status IN ('auto_matched','manually_matched')` or
  `matched_total > 0`. Manager must undo the match first.
- `rejectDuplicate` runs `tryAutoMatch` retroactively (Q3 resolution).
  Returns `matchOutcome` so the UI can toast match-vs-no-match.
- Both accept optional `notes` written to `audit_log.metadata`.

### 4.8 Ledger-side duplicate detection (PP5-B)

Detects when the same payment is recorded twice on a lot — typically
when an owner pays via two methods (e.g. card + bank transfer) and both
end up posting credits against the same levy notice. Detection runs
synchronously after every successful payment-category credit insert via
two integration sites. Helper lives at
`src/lib/reconciliation/ledger-duplicate-detection.ts`.

**Detection scope** is **per (lot_id, levy_notice_id)**. Cross-lot
matches are out of scope (different lots' credits can't be duplicates).
Cross-account / cross-fund matches are out of scope by construction
(each `levy_notice_id` is fund-typed). Cross-subdivision: never.

**Detection key** is structural — no description normalisation
(ledger entries don't have free-form description noise like bank
transactions): same `lot_id` + same `levy_notice_id` + same `amount` +
both `entry_type='credit'` + both `category='payment'` + `entry_date`
within ±7 days. Voided rows (`status='voided'`), already-suspected
rows (`duplicate_of` non-null), and non-payment categories are excluded
from the candidate pool.

**±7 day window vs bank-side ±2 day window:**
- Bank-side reflects bank-settlement tightness (OSKO same-day, T+1
  typical, T+2 rare).
- Ledger-side reflects payment-cycle reality — an owner can pay via
  card today and the bank-side OSKO entry can land days later; two
  manually-recorded receipts can drift further.
- **Known false-positive surface**: instalment plans where an owner
  pays $X today + $X in 5 days against the same notice get flagged.
  Manager has a clean reject path via `keepAsOverpayment`. PRE_LAUNCH_CLEANUP
  records the option of tightening to ±3d or adding an instalment-plan
  flag on `levy_notices` if production reveals noise.

**Eligibility predicate (which `category` values trigger detection):**

| Category | entry_type | Detector behaviour |
|---|---|---|
| `payment` | credit | **DETECTS** — the only category in scope; spec key |
| `levy` / `special_levy` / `interest` / `adjustment_debit` / `refund` | debit | does not detect (predicate excludes non-credits) |
| `writeoff` | credit | does not detect (not a real-money payment) |
| `adjustment_credit` | credit | does not detect (manual adjustment, not duplicate-class) |
| `void_offset` | credit/debit | **CRITICAL EXCLUSION** — same lot/notice/amount as the entry it voids; without this exclusion every void would generate a false flag |

Untargeted credits (`levy_notice_id IS NULL`) are out of scope by the
detection key — receipts and other unlinked credits never trigger.

**Two integration sites** (`detectAndMarkLedgerDuplicates` helper):
- `orchestrator.tryAutoMatch` — after `rpc_reconcile_bank_transaction`.
- `reconcileTransaction` (manual match) — after the same RPC.

**`recordCashReceipt` is intentionally NOT integrated.**
`rpc_record_cash_receipt` creates credits with `levy_notice_id = NULL`
(untargeted at receipt time; notice linkage happens later when
`rpc_deposit_undeposited_funds` matches the receipt to a bank tx).
Eligibility predicate excludes untargeted credits, so calling the
helper from `recordCashReceipt` would be dead code. PRE_LAUNCH_CLEANUP
records the option of revisiting once the receipt-to-notice linkage
feature lands.

**Manager review actions** (symmetric verb pair):

| Action | Final state | Side effects |
|---|---|---|
| `voidAsLedgerDuplicate` | `duplicate_status='confirmed'` + `status='voided'` | offsetting `void_offset` entry; cascade through `rpc_unmatch_bank_transaction` if linked (matches deleted, bank `matched_total`/`match_status` updated) |
| `keepAsOverpayment` | `duplicate_status='rejected'`; entry stays `'active'` | none — balance reflects overpayment |

**`voidAsLedgerDuplicate` linked vs unlinked branching:**
- **Unlinked credit** (no `reconciliation_matches` rows): direct
  `rpc_ledger_void` call. Returns the void offset id directly.
- **Linked credit** (1+ matches): goes through `rpc_unmatch_bank_transaction`
  which deletes matches, calls `rpc_ledger_void` internally, and
  recomputes `bank_transactions.matched_total` + `match_status` — full
  cascade, no stale fields.
- **Multi-linked credit** (>1 distinct bank txs via partial-allocation
  matches): hard error `errorCode='MULTI_LINKED'`. Currently impossible
  via any normal MSM flow but allowed by the
  `UNIQUE(bank_transaction_id, ledger_entry_id)` constraint (only blocks
  same-pair duplicates). Hard-erroring keeps financial-state writes
  inside RPC contracts and surfaces any future architectural shift
  loudly. **Future authors:** if a flow legitimately creates this
  multi-linked state, lift the guard with a coordinated change — the
  manual-cleanup branch (DELETE matches + recompute) was deliberately
  removed because direct UPDATE bypassing the RPC contract drops
  audit-log entries (no `reconciliation.unmatched` rows for the manual
  cleanups).

**`markLedgerDuplicate` failure handling.** Same pattern as bank-side:
if the UPDATE or audit INSERT fails inside the marker, the row stays
`unmarked` in the DB. Callers (orchestrator, reconcileTransaction) **do
not roll back the credit** — it's already committed. The failure is
logged via `console.error` with `{ ledger_entry_id, subdivision_id,
duplicate_of, error }` for Sentry. Manager investigates via the
audit-gap or the Sentry alert.

**Bank-side ↔ ledger-side double-flag:** in the manual-match path, a
single conceptual problem (a manually-allocated second payment) can
trigger BOTH the bank-side detector (suspected duplicate bank tx) AND
the ledger-side detector (suspected duplicate ledger credit). Manager
acts on either; `voidAsLedgerDuplicate` cascades through the unmatch
flow (full bank state cleanup); bank-side `confirmDuplicate` is
separately gated by `MATCH_ACTIVE` until the manager unmatches. Slight
UX redundancy — acceptable; documented as known interaction.

**Backfill not in PP5-B.** Pre-existing rows have `duplicate_status=NULL`
and are never retroactively scanned. New rows post-deploy go through
the detector. PRE_LAUNCH_CLEANUP records the option of a one-shot
sweeper if a real-world need emerges.

### 4.9 Verification suite practices (lessons learned)

**Fresh notices for orchestrator-auto-match scenarios.** Verification
scenarios that rely on the orchestrator auto-matching against a levy
notice MUST create a fresh dedicated notice per scenario, unless the
test explicitly validates over-allocation behaviour. Cumulative credits
from prior scenarios on shared fixture notices can flip outstanding
balances negative, at which point the orchestrator (correctly) rejects
the auto-match as `stale_reference_detected`. PP5-B's LD-17 hit this
during execution: noticeC had been depleted by LD-2 / LD-15 / LD-16
credits before LD-17 ran, causing the orchestrator to fall through.
Fix was to inline a fresh `LEV-1017` notice + debit specific to the
scenario. Apply the same discipline in future verification work.

**Hash-equal descriptions for PP5-A integration tests.** When a
verification scenario expects PP5-A's bank-side detector to flag a
freshly-inserted bank tx as a suspected duplicate, both the candidate
(pre-existing bank tx) and the new bank tx must produce the same
description hash — i.e. either identical raw descriptions or differing
only in normaliser-stripped tokens (`LEV-`, `RCP-`, `PAY-`,
`MSM-{PREFIX}-{YYYY}-{NNNN}`). Distinct descriptions correctly produce
no detector flag; that's not a bug, it's the spec. PP5-C's OPC-9 hit
this during first execution — candidate `"OPC-9 candidate"` vs new
`"OPC-9 manual bank tx (override candidate)"` didn't hash-match, so
the detector (correctly) didn't flag. Fix: make both descriptions the
same string. When you write a flag-expected scenario, double-check the
description hashes will collide.

---

### 4.10 Owner self-report payment claim flow (PP5-C)

Owner submits a claim ("I paid $X on date D for lot L via method M
with reference R"). Manager reviews via the queue and either confirms
+ matches (linking the claim to a bank tx + ledger credit) or rejects
(with reason ≥10 chars). Helper lives at
`src/lib/actions/owner-payment-claims.ts` and the table is
`owner_payment_claims` (PP5-C schema delta).

**Detection scope is per `bank_account_id`** when path (ii) of the
manager confirm flow runs its LIKELY_DUPLICATE pre-check. Same
scoping discipline as PP5-A bank-side detection (per
[CONTEXT.md §4.7](#47-bank-side-duplicate-detection-pp5-a)). Cross-
account, cross-fund, and cross-subdivision matches are intentionally
out of scope at all three layers (bank-side detection, ledger-side
detection, claim-confirm pre-check).

**Manager confirm hybrid (PP5-C Gap C ratification):**

- **Path (iii) PRIMARY** — link the claim to an already-existing bank
  tx. `confirmAndMatchClaimViaExistingBankTx` calls
  `reconcileTransaction` internally (PP5-B ledger detector runs on the
  credit it creates) and then UPDATEs the claim. Encouraged when the
  bank tx is already in the queue.
- **Path (ii) FALLBACK** — create a new manual bank tx for the claim.
  `confirmAndMatchClaimViaNewBankTx` runs a LIKELY_DUPLICATE pre-check
  (same `bank_account_id`, ±2 days from `claim_date`, equal `amount`).
  If candidates exist and `override_likely_duplicate` is `false`,
  returns `errorCode='LIKELY_DUPLICATE'` with `likely_duplicate_bank_tx_ids[]`.
  Manager can switch to path (iii) or pass override. With override:
  `addManualBankTransaction` runs (PP5-A bank-side detector fires on
  the new row; if a real duplicate exists, the new row gets
  `duplicate_status='suspected'` AND auto-allocation skipped — the
  manager-confirm flow then explicitly allocates via
  `reconcileTransaction`). Then PP5-B ledger detector runs on the
  credit. Then the claim is UPDATED.

**Bank tx description vs claim notes split (Spec gap K):**
- `description` on the new manual bank tx (path ii) is **manager-supplied**
  at confirm time — typed by the manager into the confirm form.
- `notes` on the claim is **owner-supplied** at submission and is
  read-only after submission. It surfaces in the manager queue for
  context but does NOT become part of the bank tx description.
- Owner's notes go into `audit_log.metadata` only when the manager
  rejects (rejection_reason is the owner-visible field).
- This split is deliberate — the bank tx description is forensically
  authoritative (matches reality of what the manager-on-the-day
  recorded); owner notes are subjective context that helps the
  manager identify the payment but isn't load-bearing.

**Server action composition pattern (Spec gap H):**
Path (ii) chains three server actions:
1. `confirmAndMatchClaimViaNewBankTx` (auth: `requireCompanyRole` +
   `requireSubdivisionAccess`)
2. → `addManualBankTransaction` (auth re-checks; PP5-A detector runs;
   writes `bank_transaction.added_manually` audit)
3. → `reconcileTransaction` (auth re-checks; PP5-B detector runs;
   writes `reconciliation.matched` audit)
4. → claim UPDATE (writes `owner_payment_claim.matched` audit)

**Three audit log entries land per path-(ii) confirm**, all linked by
foreign keys (the audit's `entity_id` chain spans bank_transaction,
reconciliation_match-equivalent, lot_ledger_entry, and
owner_payment_claim). Forensics walks the chain. The double-auth
overhead is the cost of keeping the action layer composable; cleaner
than factoring helpers out of those actions for one-time PP5-C use.

**Void-cascade orphan (PP5-C MEDIUM-risk documented behaviour):**
When a manager voids a bank tx (via the production
`voidBankTransaction` action — UPDATE `is_voided=true`, NOT DELETE),
the FK `ON DELETE SET NULL` on `owner_payment_claims.bank_transaction_id`
**does not fire** (the row is preserved). Same for
`ledger_entry_id` (the linked credit is voided via offset, not
deleted). Result:
- `claim.bank_transaction_id` stays SET, pointing at a now-voided tx
- `claim.ledger_entry_id` stays SET, pointing at a voided credit
- `claim.claim_status` stays `'matched'` (no auto-update)

**Stale-link, not null-link.** Manager queue should surface this in
PP5-D as a "matched but underlying bank tx voided" filter. Real fix
options: (a) trigger to flip `claim_status='pending'` on bank tx
void cascade, (b) manager queue filter, (c) DB view that flags
orphans. Decision deferred to PP5-D or post-launch. OPC-16 verifies
the current behaviour.

**`payment_method` enum reuse (Spec gap B):**
Owner UI exposes a subset: `eft`, `bpay`, `stripe_card`, `cash`,
`cheque`, `other`. UI labels are mapped via
`OWNER_CLAIM_PAYMENT_METHOD_LABELS`:
- `eft` → "Bank transfer"
- `bpay` → "BPAY"
- `stripe_card` → "Card"
- `cash` → "Cash"
- `cheque` → "Cheque"
- `other` → "Other"
**`direct_debit` is hidden from owner UI** (manager-controlled; the
owner doesn't initiate direct debits). The pg enum still includes
`direct_debit`; managers and future flows can write that value. Map
is centralised to keep server-side audit + client-side display in
agreement.

**Lot picker visibility:**
Owners with multiple active lots in a subdivision (multiple active
`subdivision_members` rows with `role='lot_owner'` AND `left_at IS
NULL`) see a lot picker on the owner submission form. Owners with
exactly one lot have the picker hidden — `lot_id` defaults to that
single lot.

**RLS:** ENABLE only, **no policies** — matches existing codebase
convention (only `audit_log` has explicit policies, three minimal
write-locks). Service-role bypass is the only access path; auth is
enforced at the action layer via `src/lib/auth.ts` guards
(`requireRole`, subdivision_members membership check on submission,
`requireCompanyRole` + `requireSubdivisionAccess` on review actions,
`claimed_by_profile_id` server-enforcement on submission). Future
hardening pass may add explicit policies across all owner-data tables
consistently — see PRE_LAUNCH_CLEANUP.

**Backfill not in PP5-C.** No `withdrawn` state, no claim TTL — both
deferred to PRE_LAUNCH_CLEANUP per ratification.

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
- Reconciliation queue: `/reconciliation` — filterable table of
  bank transactions with status badges and sidebar link.
- Reconciliation detail: `/reconciliation/[bankTxnId]` — full
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
  `/subdivisions/[id]/reconciliation/gap-reports/[reportId]` —
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
