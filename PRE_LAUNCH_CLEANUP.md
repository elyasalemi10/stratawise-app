# Pre-Launch Cleanup

Small fixes to batch before going live. Non-blocking for feature work.

## From Prompt 0

- [ ] Fix pre-existing lint in `step-4-lots.tsx` (unused `eslint-disable-next-line`, `initialData: any[]`)
- [ ] Update `getSubdivisionWizardData()` to join pending invitations per lot; update `step-4-lots.tsx` to render pre-filled invitation data on re-edit so managers don't create duplicate invitations
- [ ] Update `REBUILD_INSTRUCTIONS.md` drop step to use `DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;` — current instructions leave stale types behind
- [ ] `CONTEXT.md` Section 2 says Next.js 15; `package.json` is 16.1.7. Update.

## From Prompt 2

- **Verify no reads remain on `bank_transactions.matched_payment_id`** before
  removing the column in Prompt 7. The column is a legacy pointer to the old
  `payments` table that pre-dates the ledger; Prompt 2 left it untouched
  (never written, never read from TypeScript). Grep to confirm:
  `grep -rn "matched_payment_id" src/` should return only the type-level
  declarations in `src/lib/validations/bank-transactions.ts` — if any runtime
  read or write appears, migrate it to `reconciliation_matches` before the
  column drops.
- **Custom shadcn form component decision:** `npx shadcn@latest add form` hung
  on interactive prompts during build. Instead of waiting, a custom
  `src/components/ui/form.tsx` was created following the canonical shadcn
  pattern. The wrapper exports:
  - `Form` (FormProvider)
  - `FormField` (Controller from react-hook-form)
  - `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`
  - `useFormField`
  
  This matches the standard shadcn form API. All 6 dialog files
  (add-manual-transaction, record-cash-receipt, record-adjustment, etc.)
  use these exports and build cleanly. **If shadcn adds form components
  that diverge in behaviour, revisit this decision and replace with
  canonical.** For now, the custom wrapper is API-compatible and verified
  via 12/12 verification scenarios passing.
- **Injection seam grep check:** symbols
  `__setUserIdResolverForVerification` and
  `__getUserIdResolverForVerification` must appear ONLY in `src/lib/auth-resolver.ts`
  and `src/**/*.verification.ts`. Run:
  `grep -rn "__setUserIdResolverForVerification" src/`
  Expected:
    - Exactly ONE file with the definition: `src/lib/auth-resolver.ts`.
    - At most one `*.verification.ts` file per verification script (Prompts
      2, 3, 4, 5, 6, 7 each add one). Multiple hits within a single
      verification file are fine (import + call-site + assertion probe).
    - Any hit outside these locations is a bug. These symbols exist solely
      so verification scripts can exercise server actions end-to-end;
      application code must never import them.
- **Audit all `__verification`-prefixed exports in `src/lib/auth-resolver.ts`** before
  launch and confirm each is called only from `*.verification.ts` — no
  application code paths. The convention is: any `__`-prefixed export in
  `auth-resolver.ts` is a testing-only seam; grep -rn the name and verify no hit
  lands in a non-verification file.
- **Enrich sidebar badge with age-based severity.** Current badge is neutral
  grey — a count only. Upgrade path: include the oldest-unmatched
  `transaction_date` per subdivision in `getSidebarSubdivisions`, then vary
  the badge colour by age: grey for recent, amber for >7 days, red for
  >30 days. Requires an additional aggregate column on the already-cached
  query, not extra round-trips.
- **`next/cache` stub audit:** verification scripts pre-populate Node's
  CommonJS `require.cache` with a no-op stub for `next/cache` so
  `revalidatePath()` can be safely called from a standalone `tsx` context.
  Production code MUST NOT stub `next/cache`. Run:
  `grep -rn "next/cache" src/`
  Expected:
    - Real `import { revalidatePath } from "next/cache"` statements across
      application code (server actions): these are correct.
    - `require.cache[...nextCachePath] = { exports: { revalidatePath: () => {} } }`-
      style injections MUST only appear in `src/**/*.verification.ts`.
    - Any `require.cache` / module-stub manipulation of `next/cache` in a
      non-verification file is a bug.

## From Prompt 1

- **Sequence-name drift caught during Prompt 1 verification:** base schema
  used long-form (`msm_levy_seq`, `msm_meeting_seq`, ...), the
  `next_reference_number()` function and every caller used short-form
  (`msm_lev_seq`, `msm_mtg_seq`, ...). No caller ever succeeded at
  generating a reference number (production code `continue`d past the
  silent null). Root cause: Prompt 0 consolidation picked long-form
  sequence names without cross-checking the function body.
  **Lesson for future consolidations: verify function bodies against the
  table/sequence names they construct, not just the table names
  themselves.** Fixed in commit that renamed sequences to short-form and
  updated `next_reference_number()` to prepend `MSM-` so output matches
  the format advertised in CLAUDE.md and project-context.md.

## From Prompt 6

- **Undeposited funds panel skeleton:** The panel in `BankAccountCard` renders
  conditionally after `getUndepositedEntries` resolves. During the initial
  transition, no panel skeleton is shown (skeleton only covers the transactions
  table). This means the panel paints in after load rather than appearing at
  skeleton time. Accepted trade-off: knowing the entry count before first
  render would require passing it from the server component, which adds
  plumbing that outweighs the visual benefit. Polish path: pass an
  `undepositedCount` prop from the page's server component and show the
  panel skeleton rows conditionally during `isPending && transactions === null`.

## From Prompt 7

- **Lot ledger tab — paginate entries:** Current implementation fetches at most
  500 entries and displays them all. Running balance is computed from this
  capped set, so it will be incorrect for lots with >500 historical entries.
  Polish path: store a `running_balance` column per row at write time (DB
  trigger) so the UI can display it exactly, or implement cursor-based
  pagination with balance carried forward from the prior page.

- **Multiple bank accounts per fund on lot detail page:** `LedgerTab` selects
  the first bank account matching the current fund filter when opening
  `RecordCashReceiptDialog`. If an OC has multiple bank accounts per fund
  (unusual but valid), the user gets the first match arbitrarily. Polish path:
  add an account selector dropdown to `RecordCashReceiptDialog` so managers
  can pick the correct account when multiple exist.

- **Lot ledger "Oldest unpaid" KPI card colour:** Currently goes red whenever
  any unpaid date exists. Refine to go red only when oldest-unpaid-date is
  older than the subdivision's interest grace period (or before today if no
  grace configured). Neutral/grey for merely-outstanding-but-not-yet-overdue.
  Prevents false alarm on freshly-issued levies.

## From Prompt 3

- **Pre-launch grep audit:** no exported server action should accept performedBy from the caller. Auth guards must resolve the performer identity server-side, not trust a client-supplied UUID. Standing policy for all future server actions; run `grep -rn "performedBy\|performed_by" src/lib/actions/ | grep -v "\.verification\.ts"` and confirm every hit is either an RPC argument resolved from `profile.id`, an internal helper, or a type declaration — never a caller-supplied parameter on an exported `"use server"` function.

  **[RESOLVED in commit 73e9654]** — the live finding on
  `src/lib/actions/reconciliation.ts::tryAutoMatchByReference` was fixed
  by extracting the function (with its `AutoMatchArgs`/`AutoMatchResult`
  types and helpers) to `src/lib/reconciliation/auto-match.ts` — a
  module with no `"use server"` directive. It is no longer reachable
  as a server action from any client component, closing the trust
  hole. The rule stays as open-standing policy for future server
  actions.

- Verify each of the 7 bank parsers (CBA, NAB, ANZ, WBC, Macquarie, ING, Bendigo) against real Basiq sandbox descriptions. Placeholders exist with regex-only extraction; real per-bank quirks need documenting. Also verify `BASIQ_INSTITUTION_IDS` map in `src/lib/basiq/parsers.ts` against the live `GET /institutions` response — the current values are best-effort placeholders.

- docs/help/nominated-representative-setup.md has inferred URLs for each bank's CDR page. Verify each link resolves correctly before launch.

- **Basiq webhook payload shape:** `handleBasiqEvent` extracts the external connection id via best-effort probing of several candidate fields (`connectionId`, `connection`, `data.connectionId`, `data.connection`, `data.id`). Once we have a real webhook sample from Basiq's sandbox, lock down the exact shape with Zod validation.

- **Basiq consent URL institution hint parameter:** `buildConsentUrl` passes `institutionId=...` as a query param. If Basiq's Consent UI actually expects a different parameter name (e.g. `connectorId`) or ignores it entirely, fix in `src/lib/actions/basiq.ts::buildConsentUrl`.

- **Basiq job `links.source` extraction:** `completeBasiqConsent` parses the connection id out of `job.links.source` with `/connections\/([^/?]+)/`. Verify this matches the actual sandbox shape; fall-back path (listing user connections and picking the freshest untracked one) exists but should not be the primary path in production.

- **Injection seam grep rule (Prompt 3 addition to Prompt 2's rule):** the symbol `__setBasiqApiClientForVerification` (and its read-only twin `__getBasiqApiClientForVerification`) must appear ONLY in `src/lib/basiq/client.ts` and `src/**/*.verification.ts`. Same rules and rationale as the auth resolver seam.

- RPC security model audit. All 15 RPCs currently run as SECURITY INVOKER (caller's permissions). If Prompt 7 introduces RLS policies that differentiate per-user access, RPC behaviour becomes inconsistent across caller contexts. Before launch: decide per-RPC whether to add SECURITY DEFINER SET search_path = public, pg_temp. The financial-mutation RPCs (rpc_* that write to lot_ledger_entries, reconciliation_matches, undeposited_funds_entries, basiq_*) should all run DEFINER so they enforce app-level authorisation rather than DB-level permissions. Read-only RPCs can stay INVOKER.

- Schema-authoring rule: CREATE INDEX ... WHERE ... predicates must only reference IMMUTABLE functions. NOW(), CURRENT_TIMESTAMP, and any user-defined non-IMMUTABLE function cannot appear in index predicates. Index all rows instead; filter at query time.

- Clerk critical vulnerabilities (two criticals + one high, all pre-existing). Route-protection bypass in @clerk/nextjs + @clerk/shared; SSRF in @clerk/backend opt-in proxy. Upgrade all three to latest patched versions before launch. Verify auth guards behave unchanged post-upgrade via the existing verification harnesses (9+12+15 scenarios) before declaring clean.

- Trigger.dev transitive high-severity deps (4 entries): @trigger.dev/core, @trigger.dev/sdk, @opentelemetry/host-metrics, systeminformation. Acceptable at integration time — worker-runtime transitives, none on application request paths. systeminformation flaw is Windows-only (we deploy Linux). Monitor Trigger.dev SDK updates; upgrade when patched releases land.

- Add consecutive_sync_failures column to basiq_connections + update poll/force-sync to increment/reset it. Surface on bank-account feed panel when ≥2. Rule: 1 error shows only in Manage dialog; 2+ consecutive errors render an additional warning row on the feed panel itself ("⚠ Last {N} syncs failed — {translated error}"). Deferred from PP3-B to avoid a schema round-trip mid-UI work; the panel's translation helper already exists and can gain the counter branch without refactor.

- Feed-panel "Details" expandable for raw error text is present on states revoked/failed via a native `<details>`/`<summary>` element. Matches the existing audit-trail expandable in the ledger-entry drawer. Polish path (also tracked in Prompt 8): replace both with a shadcn-styled Collapsible for visual consistency.

- Pre-existing lint errors in unrelated files (20 as of the PP3-B commit): six `react-hooks/set-state-in-effect` hits in wizard/dashboard client components using the standard data-fetch-on-mount pattern; one `react-hooks/exhaustive-deps` warning; a cluster of `@typescript-eslint/no-explicit-any` in form.tsx + step-4-lots.tsx; `react-compiler/static-components` violation in phone-input.tsx (setState cascade) and document-manager.tsx. None introduced by Prompts 1–3. Triage individually before launch; most are five-minute refactors.

- Gap report "Arrears notifications suppressed until {timestamp}" copy renders as absolute timestamp without checking if past/future due to Server Component + React Compiler Date.now() constraints. Minor UX issue — add server-time-prop or Client Component wrapper to show correct past/future state.

- Gap report backfilled transactions uses date-window heuristic on source='basiq', not true lineage. Consider linked_gap_report_id column if precise audit required.

## From Prompt 4 (PP4-0 refactor)

- **Operational-sequence reference format overflow:** `next_reference_number` for operational prefixes (MTG, MIN, SLEV, INV, POL, CLM, MNT, CMP, ESC) uses `lpad(seq_val::TEXT, 6, '0')`. `lpad` only pads to the minimum width; it does not truncate past 999,999. At scale a seven-digit sequence value would silently produce `MSM-PREFIX-YYYY-NNNNNNN` (seven digits), breaking any regex that assumes exactly six digits. Before launch: decide whether to widen the pad to 7, pre-validate against the six-digit Zod regex in `src/lib/validations/`, or add a guard that raises when the sequence crosses 999,999 on a given prefix. Unlikely in practice for single-tenant MSM deployments but worth naming.

- **Legacy `msm_slev_seq` sequence:** Declared in `database-schema.sql` but has zero callers (`grep -rn "'SLEV'\|\"SLEV\"" src/` returns nothing). Special levies currently flow through the `LEV` prefix with `levy_type='special'`. Either wire up a caller (if we genuinely want distinct SLEV references for special levies) or drop the sequence. No functional issue today — pure dead weight.

- **Legacy `payments.reference_number` UNIQUE constraint:** PP4-0 deliberately skipped altering the `payments` table because it has zero active write paths in Prompts 1-3 and is slated for removal in Prompt 7. The old single-column UNIQUE is still in place. When Prompt 7 removes the table, the constraint goes with it; if Prompt 7 decides to keep `payments` and add new write paths, re-evaluate whether the constraint should become composite `(subdivision_id, reference_number)` to match the LEV/RCP tables.

## From Prompt 4 (PP4-A — auto-match orchestrator + walker)

- **Walker semantic locks at first customer data:** PP4-A switched `_walk_oldest_unpaid` from date-only ordering to `(allocation_priority, entry_date, created_at)`. Until customer data lands, this is freely changeable. Once an OC has any non-trivial mix of regular + special_levy + interest debits, the stored `oldest_unpaid_date_*` values reflect priority-aware allocation and any subsequent change to `allocation_priority` semantics requires a migration that re-walks every affected lot. Before launch, confirm the priority map is final.

- **Ground-truth MOD10V01 against real BPAY-issued CRNs:** `src/lib/reconciliation/bpay-crn.ts` implements MOD10V01 per public references (BPAY developer docs, node-bpay). PP4-A's verification only exercises round-trip self-consistency. Once a real OC registers a biller code with BPAY, validate ≥3 CRNs that BPAY itself issued — independent confirmation that our weighting / digit-summing / mod-arithmetic matches their interpretation byte-for-byte. If they diverge, fix the algorithm and regenerate `bpay_crn` for any in-flight notices.

- **`allocation_priority` not auto-set on RPC inserts:** PP4-A's schema delta backfilled existing rows from `category` but did NOT add a BEFORE-INSERT trigger or update the financial RPCs (`rpc_levy_debit`, `rpc_levy_batch_debit`, `rpc_ledger_adjustment`, `rpc_payment_credit`, `rpc_ledger_void`) to set the column. New rows inserted via these RPCs land with `allocation_priority = 2` (the column default) regardless of category, so production special_levy / interest debits inherit the wrong priority. Fix BEFORE launch via either (a) a `BEFORE INSERT` trigger that derives priority from category — single source of truth, ~10 lines of plpgsql — or (b) explicit priority field in each RPC's INSERT. Trigger is recommended (DRY). Verification scenario S10 worked around this by inserting directly with explicit priorities.

- **Stale-reference + other-strategy queue UI surface:** When auto-match falls through a stale reference (Strategy 1 detects `reconciliation.stale_reference_detected`) and then matches via a later strategy (BPAY/known-payer/etc), the audit log records both events but the queue UI doesn't surface the stale-ref hint. Address in PP4-D: queue row for matched txns should display `matched via {strategy} — note: this transaction also referenced {LEV-N} which was already paid`. Currently invisible to managers; only available via audit log.

- **`_walk_per_notice_status` snapshot timezone:** The void-snapshot filter (`voided_at::date > p_as_of_date`) uses session timezone (UTC for Supabase). Australian managers generating certificates "as of yesterday" could see off-by-one behaviour for voids made in late AEST evening hours (Australia/Melbourne is UTC+10/+11; a void at 22:00 AEST = 12:00 UTC same day). Precision upgrade: cast to `Australia/Melbourne` explicitly. Not blocking pre-launch but should be addressed before high-stakes certificate use (Prompt 7).

- **Remove deprecated `tryAutoMatchByReference` delegate:** `src/lib/reconciliation/auto-match.ts` is now a thin `@deprecated` delegate for any out-of-tree caller still using the pre-PP4-A signature. All in-tree callers (addManualBankTransaction, pollConnectionAsSystem) migrated to `tryAutoMatch` directly. Run `grep -rn "tryAutoMatchByReference" src/` once verification passes; if no callers remain (excluding the function definition itself and verification harnesses if any), delete the function and the file's `auto-match.ts` reduces to nothing — drop it.

- **Certificate generation must call `computeLevyPaymentStatus`:** Prompt 7 certificate templates MUST consult `src/lib/reconciliation/payment-status.ts::computeLevyPaymentStatus(lotId, asOfDate)`, NOT `levy_notices.status` directly. The `levy_notices.status` column captures the last explicit status transition (e.g. `written_off` from a void) but isn't snapshot-aware and doesn't reflect partial coverage. The walker is the single source of truth for "is this notice paid as of date X".

- **Orchestrator runs all 6 strategies on every Basiq credit-direction insert, including non-matchable ones.** PP4-A's `pollConnectionAsSystem` invokes `tryAutoMatch` unconditionally for every `signed > 0` Basiq transaction (was previously gated on `parsed.reference != null`). Each invocation runs Strategies 1–6 in sequence and writes one `reconciliation.auto_match_attempted` audit row, even when no strategy can match. Profile audit-log volume + RPC time at scale (>1000 txns/day) before launch; consider early-exit heuristics (e.g. skip strategies 3–5 when description has no alphabetic content, skip strategy 2 when bpay_biller_code is null at the orchestrator level rather than per-strategy) if cost becomes meaningful.

- **Orchestrator overwrites `bank_transactions.notes` on partial match.** Currently safe because notes is system-written-only in PP4-A. If pre-match manager-edit becomes possible (e.g. a "leave a note before matching" UI in PP4-D or later), change the orchestrator's partial-match branch to append-rather-than-overwrite, or store the auto-match warning in a separate column. Marked with a `TODO(pre-launch)` comment in `src/lib/reconciliation/orchestrator.ts` at the overwrite site.

## From Prompt 8

- **Audit trail in ledger entry drawer — pagination:** Query capped at 100
  entries per record. If >100 audit events on a single ledger record becomes
  common (e.g. heavily-contested payment repeatedly voided/re-applied), add a
  "Load older" button with cursor-based pagination. Unlikely in practice for
  strata management volumes.

- **Audit trail expandable metadata — native `<details>` element:** The
  before/after state diff and metadata sections use a native `<details>`/
  `<summary>` disclosure widget. Renders the browser's default triangle, which
  is inconsistent with the rest of the UI. Polish path: replace with a
  shadcn-styled Collapsible or a Chevron-icon toggle button for visual
  consistency.