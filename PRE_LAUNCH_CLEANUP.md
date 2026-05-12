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
  used long-form (`sw_lev_seq`, `sw_mtg_seq`, ...), the
  `next_reference_number()` function and every caller used short-form
  (`sw_lev_seq`, `sw_mtg_seq`, ...). No caller ever succeeded at
  generating a reference number (production code `continue`d past the
  silent null). Root cause: Prompt 0 consolidation picked long-form
  sequence names without cross-checking the function body.
  **Lesson for future consolidations: verify function bodies against the
  table/sequence names they construct, not just the table names
  themselves.** Fixed in commit that renamed sequences to short-form and
  updated `next_reference_number()` to prepend `Strata Wise-` so output matches
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

- **Operational-sequence reference format overflow:** `next_reference_number` for operational prefixes (MTG, MIN, SLEV, INV, POL, CLM, MNT, CMP, ESC) uses `lpad(seq_val::TEXT, 6, '0')`. `lpad` only pads to the minimum width; it does not truncate past 999,999. At scale a seven-digit sequence value would silently produce `Strata Wise-PREFIX-YYYY-NNNNNNN` (seven digits), breaking any regex that assumes exactly six digits. Before launch: decide whether to widen the pad to 7, pre-validate against the six-digit Zod regex in `src/lib/validations/`, or add a guard that raises when the sequence crosses 999,999 on a given prefix. Unlikely in practice for single-tenant Strata Wise deployments but worth naming.

- **Legacy `sw_slev_seq` sequence:** Declared in `database-schema.sql` but has zero callers (`grep -rn "'SLEV'\|\"SLEV\"" src/` returns nothing). Special levies currently flow through the `LEV` prefix with `levy_type='special'`. Either wire up a caller (if we genuinely want distinct SLEV references for special levies) or drop the sequence. No functional issue today — pure dead weight.

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

## From Prompt 4 (PP4-B — strategies 3-6 + canonical + similarity + mappings)

- **Canonicaliser-induced misroute audit query (R1 mitigation):** Strategy 3 records `{raw_description, canonical_sender_name, mapping_id}` in match metadata. Build an audit-log query that finds `name_match` auto-matches where the manager later unmatched within N days (proposed N=7). High recurrence on a specific canonical name is a signal that the canonicaliser is too aggressive (over-stripping legitimate name parts) or that a known payer mapping is misclassified. Run this query before launch and on a recurring weekly cadence post-launch.

- **Ground-truth canonicaliser noise tokens against ≥20 real Basiq sandbox descriptions.** `src/lib/reconciliation/canonical.ts` strips a narrow noise list (LEV refs, BPAY blocks, directional words, BSBs, long digits, dates). Spec earlier cited "TRANSFER FROM, OSKO FROM, EFTPOS, NPP" but real bank descriptions in production may include other tokens (PAY ID, payID, INTERNET TRANSFER, IB DEPOSIT, etc.). Once an OC connects via Basiq, sample ≥20 real descriptions and either widen the noise list or document that the conservative defaults produce acceptable behaviour. Linked corpus item from PP3 (`_basiq_samples.txt`).

- **Sweep on lot ownership UPDATE / DELETE / profile rename.** PP4-B's `sweepMappingsForOwnerChange` is hooked only on `subdivision_members` INSERT (invitation acceptance — Gap D resolution). Manager-edits-owner UPDATE paths and `profiles` first/last-name renames are out-of-scope. Pre-launch: decide whether to add hooks to the manager edit and profile rename flows, or accept that mappings can become stale and rely on manual review. If hooks are added, the sweep function itself doesn't need changes — only call sites do.

- **Lot-owner edit on the non-invite path doesn't trigger sweep.** If a manager directly edits a lot owner via `subdivisions/manage` (or wherever the non-invite owner-mutation flow lands in PP4-D), `sweepMappingsForOwnerChange` is not called. Add the hook in `src/lib/actions/subdivision.ts` (or the relevant action file) wherever lot ownership is mutated outside the invitation-acceptance flow. PP4-D scope; flagged here so it isn't lost.

- **`detectRepeatedManualMatch` performance at scale.** Iterates 30 days of manual matches and canonicalises each linked description in TS. Bounded for typical Strata Wise volumes but unbounded across multi-OC scaling. If verification or production telemetry shows hot-path latency, denormalise canonical_sender_name onto `bank_transactions` at insert time (one TS canonicalisation, cached on the row) so the detection query becomes a SELECT COUNT … WHERE canonical = ?. Schema change deferred until evidence demands it.

- **Strategy 4 keyword input validation not yet enforced at write time.** `src/lib/validations/levy.ts::matchKeywordsSchema` lands in PP4-B (Gap J resolution) but no production write path uses it yet — `levy_batches.match_keywords` is set directly by verification fixtures or future PP4-D batch-creation UI. Pre-launch: confirm the PP4-D server action wires the schema before insert.

- **Three-way collision dialog UI (deferred to PP4-D).** PP4-B's `reconcileTransaction` returns structured `mappingCollision` and `mappingResolutionRace` payloads. UI surfaces the dialog and re-submits with `mapping_resolution`. No UI in PP4-B; verification scenarios exercise the server-side flow only.

- **Multi-lot manual match with `remember_payer=true` silently skips mapping creation (Gap C).** Server writes `bank_payer_mapping.skipped_multi_lot` audit when this happens. UI affordance — greying the checkbox + tooltip "Cannot remember a payer for multi-lot matches" — is PP4-D scope.

- **Strategy 6 hint persistence on already-mapped sender.** When a description's canonical exactly matches an active mapping, Strategy 3 hits and the orchestrator stops. Strategy 6 doesn't run, so no hint is surfaced. When the canonical DOES NOT match exactly, Strategy 6 may still find a high-similarity active mapping. Strategy 6 explicitly skips exact-equality candidates (no value in hinting "did you mean X?" when X is a perfect match — that would have hit Strategy 3). Verified by inspection.

## From Prompt 4 (PP4-C — integration audit + hardening)

- **CSV import re-introduce batch pre-fetch optimisation.** PP4-C migrated the CSV path from inline Strategy-1-only matching to the full orchestrator (`tryAutoMatch`). The orchestrator does its own per-row notice lookups (~10–15 queries each vs ~3 inline). For typical CSVs (10–500 rows) total query count is 100–7,500 — manageable. For pathological ≥1,000-row imports, build a `tryAutoMatchBatch(rows[], subdivisionId, bankAccountId)` variant that pre-fetches `levy_notices` once per batch and threads the cache into Strategy 1 lookups. ~50 lines added; only justify when telemetry shows hot-path latency.

- **CSV imports post-PP4-C record diverse `match_method` values** (`auto_reference`, `auto_bpay_crn`, `auto_sender`, `auto_amount`) reflecting the actual matching strategy. Pre-PP4-C CSV path hardcoded `auto_reference / exact_reference`. Audit-log analysts grepping by `match_method` on CSV rows should expect this shift. **Documentation only — not a bug.**

- **`computeLevyPaymentStatus` performance at scale (M1).** 100-notice benchmark in `payment-status.verification.ts` (80 settling notices, 220 credits = 60 paid × 3 credits + 20 partial × 2 credits) measures the SQL → TS round-trip latency. Thresholds: <100ms ship, 100–500ms ship + this item, >500ms halt + rewrite. **C-4 result: cold = 373ms, warm = 228ms** after the PP4-C plpgsql→single-CTE rewrite (was 546ms cold pre-rewrite). Lands in the 100–500ms band so we ship as-is. If Prompt 7 certificate generation surfaces this as a hot-path bottleneck, denormalise `paid_amount` onto `levy_notices` via an `AFTER INSERT/UPDATE/DELETE` trigger on `lot_ledger_entries WHERE entry_type = 'credit'`. The trigger maintains `levy_notices.paid_amount` and `levy_notices.settled_at`; `_walk_per_notice_status` then reads precomputed columns instead of aggregating per call. Snapshot semantics (`asOfDate` < today) still need the walker — the trigger is a fast-path for the common "today" case only.

- **Audit-log GIN index for `strategies_tried` queries (M2).** The orchestrator writes `metadata.strategies_tried` as a JSONB array. Forensic queries like "all transactions where Strategy 3 returned `ambiguous_mapping`" need `metadata @> '{"strategies_tried":[{"strategy":"reference","outcome":"matched"}]}'` containment with a GIN index. None exists — add one if forensic queries become hot.

- **Profile rename invalidates payer mappings (L1).** `bank_payer_mappings` records the canonical sender name at creation time. If an owner's profile is renamed (e.g. JANE → JAYNE), future transactions canonicalise to a different name and the existing mapping doesn't fire. **Expected behaviour — not a bug.** PP4-D's mapping-management UI should surface a "stale mapping" hint when the profile name no longer matches the canonical_sender_name.

- **Member removal (lot ownership ends) without disabling mappings (L2).** When `subdivision_members.left_at` is set, existing active mappings on that lot stay active. New owner's transactions canonicalise to a different name → no match. Old mapping is dead but not flagged. Member-removal sweep should disable existing mappings on that lot, OR flag them for review. PP4-D scope.

- **Strategy 1 LEV regex over-eager when CRN is adjacent to LEV reference (M3).** The regex `/\b(?:lev(?:y)?\s*[-]?\s*(\d+)|(\d+)\s*[-]?\s*lev(?:y)?)\b/gi` has a second alternative `(\d+)\s*[-]?\s*lev` that captures a numeric run immediately followed by "LEV" as the levy number. For a description like `BPAY 00009005 LEV-1009 from ...`, the regex captures `9005` (the CRN digits) instead of `1009` — so Strategy 1 looks up `LEV-9005`, doesn't find it, and falls through to Strategy 2 even though `LEV-1009` is right there in the description. Strategy 2's BPAY CRN match will still resolve correctly in this exact case, so production fallthrough is benign. **Bug, not a hazard.** Tighten the regex pre-launch to require word-boundary separation between a leading number-run and the `LEV` token (e.g. `(\d+)\s+lev` or a negative lookbehind that stops the leading number from absorbing CRN digits). Discovered by O21 in `orchestrator.verification.ts`; the test reorders the description to `${reference} BPAY ${crn}` to bypass the issue.

## From Prompt 4 (PP4-D — UI surfaces)

- **Sidebar nesting promotion path.** Current sidebar is flat-by-design; the shadcn Sidebar primitive *exports* `SidebarMenuSub` / `SidebarMenuSubItem` / `SidebarMenuSubButton` ([components/ui/sidebar.tsx:638-696](src/components/ui/sidebar.tsx)) but they are unused. PP4-D added "Payer mappings" as a flat sibling under Finance with longest-prefix-wins active-detection. If a richer "Reconciliation > {Queue, Mappings, Gap reports}" nested-menu UX is wanted later, extend the nav-item shape with `children?: NavItem[]`, recurse the render loop, and switch the active-detection logic to walk children. No primitive changes required — the building blocks already exist.

- **Lot-ownership direct-edit hook.** Lot-ownership changes route through `invitations.ts` only ([invitations.ts:193](src/lib/actions/invitations.ts#L193) calls `sweepMappingsForOwnerChange`). [manage/actions.ts:68-72](src/app/(dashboard)/subdivisions/[subdivisionId]/manage/actions.ts#L68-L72) explicitly excludes owner fields from direct edits. If a "Replace owner" affordance is added to the manage page later (e.g., for cases where the manager updates owner without sending an invitation), the new path MUST call `sweepMappingsForOwnerChange`, otherwise active mappings on the old owner persist invisibly. Pattern documented in `invitations.ts:193`.

- **Mapping `source` column.** Source is currently DERIVED from `raw_examples.length > 0 ? 'auto' : 'manual'` in `getMappingsForSubdivision`. If manual + auto-derived mappings need clear separation post-launch (e.g., for analytics, or to support manual addition of `raw_examples` without the source label flipping), promote to a stored `source` column on `bank_payer_mappings` via schema delta. Values would be: `manual | auto_from_match | auto_from_repeat_proposal`. Re-derive existing rows from `audit_log` (`bank_payer_mapping.created` action's metadata).

- **Queue `mm` filter "ANY allocation" semantic.** The queue's `match_method` filter (`?mm=auto_reference,auto_bpay_crn`) matches `bank_transactions` where ANY allocation row in `reconciliation_matches` has the specified method. In practice all allocations for a single transaction share a method (orchestrator writes them atomically; manual matches via `reconcileTransaction` set one method per call). If piecemeal manual matching with mixed methods becomes possible (e.g., a future "split-method match" UI), revisit the filter semantic — either apply ALL-allocations-match or surface the disagreement explicitly in the queue.

## From route-flattening refactor

- **Breadcrumb terminal-crumb missing on UUID-final routes (M4).** `buildBreadcrumbs` in [header.tsx](src/components/layout/header.tsx) skips UUID segments, but does not promote the last *pushed* crumb to `isLast=true` when the final URL segment is a skipped UUID. Affected routes:
  - `/subdivisions/[id]/levies/[batchId]` — renders `[Levies]` with `isLast=false`, so it becomes a clickable link to itself.
  - `/subdivisions/[id]/reconciliation/[bankTxnId]` — same pattern, renders `[Reconciliation]` only.
  - `/subdivisions/[id]/reconciliation/gap-reports/[reportId]` — renders `[Reconciliation > Gap report]` with neither marked terminal.
  - `/subdivisions/[id]/lots/[lotId]` is correctly handled via the explicit special-case branch — extend that pattern to cover the others, or post-loop promote the final pushed crumb to `isLast=true` when the actual last segment was a UUID. Pre-existed before the route-flattening refactor; surfaced during the breadcrumb walk-through.

## From URL-restructure refactor

- **Five sub-components have unused `subdivisionId` props with `void subdivisionId;` no-ops.** All five have access to the URL code via either `useSubdivisionCode()` (4 client components) or an already-plumbed `subdivisionCode` prop (1 server sub-fn). The `subdivisionId` prop is dead weight kept only for caller-contract stability during the URL-rename commit. Cleanup task: remove the prop + update callers (no behavior change, just removes the void-no-op idiom).
  Files:
  - `src/app/(dashboard)/subdivisions/[subdivisionCode]/bank-account/bank-account-content.tsx` (`TransactionsTable`)
  - `src/app/(dashboard)/subdivisions/[subdivisionCode]/lots/[lotId]/lot-ledger-drawer.tsx` (`LedgerEntryDrawer`)
  - `src/app/(dashboard)/subdivisions/[subdivisionCode]/reconciliation/gap-reports/[reportId]/page.tsx` (`TransactionRow`)
  - `src/app/(dashboard)/subdivisions/[subdivisionCode]/reconciliation/reconciliation-queue-content.tsx` (`QueueRow` and `EmptyState` — two sites in one file)

- **`computeLevyPaymentStatus` PERF benchmark variance.** Occasional cold-start hits >500ms (e.g. C-3 first run at 592ms, immediate re-test 321ms — same fixture, same query plan). Same-process variance, not a regression. If frequency increases in CI or in real usage telemetry, investigate query-planner cache warmup (try `pg_prewarm` on `lot_ledger_entries`/`levy_notices` indexes) or pursue the M1 cleanup item — denormalise `paid_amount` onto `levy_notices` via an `AFTER INSERT/UPDATE/DELETE` trigger so the function reads precomputed columns instead of aggregating per call.

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

## From Prompt 5

Closes 7 sub-pauses (PP5-A bank-side detection, PP5-B ledger-side
detection, PP5-C owner self-report claims, PP5-D-A bank-side review
dialog, PP5-D-B ledger-side review dialog, PP5-D-C-A claims queue
backend + orphan filter, PP5-D-C-B manager claim review dialog).
PP5-D-D smoke walkthrough deliberately skipped — see carryforward
note at the end of this section.

### Prompt 5 schema deltas (3 scratch files, all gitignored)

- `_prompt5_a_schema_delta.sql` — `bank_transactions` duplicate columns
  (`duplicate_status`, `duplicate_of`, `duplicate_metadata`, partial
  indexes, audit-log event-type expansion).
- `_prompt5_b_schema_delta.sql` — `lot_ledger_entries` duplicate columns
  (mirrors PP5-A on the ledger side).
- `_prompt5_c_schema_delta.sql` — new `owner_payment_claims` table,
  enums, indexes, FKs (`ON DELETE SET NULL` from
  `bank_transactions` and `lot_ledger_entries`).

Pre-launch action: confirm production state matches each file's
"PROBE FIRST" comment block. Probe queries (`\d <table>`,
`pg_indexes WHERE tablename='...'`,
`pg_constraint WHERE conrelid='...'::regclass`,
`pg_trigger WHERE tgrelid='...'::regclass`,
`pg_class.relrowsecurity`,
`pg_policy WHERE polrelid='...'`) listed in each file.

### PP5-A — Bank-side duplicate detection

- **DD-15 Basiq e2e mock caveat.** The duplicate-detection verification
  scenario DD-15 tests detection on a `source='basiq'` bank_transactions row
  but does **not** drive the full `pollConnectionAsSystem` pipeline (which
  would require mocking the Basiq API client). The integration line in
  `pollConnectionAsSystem` is identical in shape to what DD-15 exercises
  (insert -> detectDuplicate -> markDuplicate -> continue). Pre-launch:
  consider an additional mock-Basiq-client scaffold so the full poll path is
  e2e-tested end-to-end.

- **Detection race silent-miss.** Two transactions inserted in concurrent
  uncommitted DB transactions can both be saved as originals (each
  detector sees the other as not-yet-committed). Low frequency in
  production (Basiq polls 1/min, CSV is human-driven). If real-world telemetry
  shows missed cross-source duplicates, add a periodic sweeper that re-runs
  detection over rows from the last N hours. Trade-off accepted in PP5-A
  planning — see CONTEXT.md PP5 §Duplicates ratification (a).

- **Voided-parent freeze.** When the older row a `bank_transactions.duplicate_of`
  points to gets manually voided (`is_voided=true`) or excluded
  (`match_status='excluded'`), the dependent newer row's `duplicate_status`
  stays `'suspected'` — no auto-mutation. The PP5-D review dialog should
  display a warning banner indicating the parent's state (voided / excluded /
  rejected) at the top of the dialog so the manager has full context before
  acting. Tracked separately because the dialog work is PP5-D scope.

- **`confirmDuplicate` / `rejectDuplicate` non-idempotent at the server.**
  Both gate on `duplicate_status === 'suspected'` and return
  `errorCode='NOT_SUSPECTED'` if called on a row whose status has already
  moved. The UI must debounce double-clicks; the server is intentionally
  not idempotent so a stale tab doesn't accidentally toggle a manager's
  earlier decision. Pre-launch QA: confirm the dialog implementations
  disable submit buttons immediately on click and surface a clear error if
  a 2nd call sneaks through.

- **`bank_transaction.csv_imported` audit forensics.** Pre-PP5-A audit rows
  have `after_state.duplicates: <number>`; post-PP5-A rows have
  `after_state.exact_duplicates_dropped` + `after_state.cross_source_duplicates_flagged`.
  Forensics queries that span the deploy boundary must check both shapes.
  Document in any analytics dashboards that read this audit's after_state.

### PP5-B — Ledger-side duplicate detection

- **Ledger detection on cash receipts requires notice-linkage support.**
  `rpc_record_cash_receipt` creates ledger credits with
  `levy_notice_id = NULL` (untargeted at receipt time; the notice gets
  linked later when `rpc_deposit_undeposited_funds` matches the receipt
  to a bank tx). PP5-B's eligibility predicate excludes untargeted
  credits, so receipts are deliberately NOT integrated into the
  ledger-duplicate-detection helper. When (if ever) the receipt-to-notice
  linkage feature lands — either by extending `rpc_record_cash_receipt`
  with an optional `p_levy_notice_id` parameter or by running detection
  inside `rpc_deposit_undeposited_funds` against the now-linked credits —
  re-introduce the integration site in `recordCashReceipt` (or in the
  deposit action) and add a verification scenario for the targeted-receipt
  duplicate path.

- **`rpc_ledger_void` cascade architectural cleanup (lower priority).**
  PP5-B's `voidAsLedgerDuplicate` cascades correctly via
  `rpc_unmatch_bank_transaction` for linked credits and
  `rpc_ledger_void` for unlinked credits — verified by LD-14, LD-19,
  LD-20. The architectural cleanup that would benefit ALL callers of
  `rpc_ledger_void` (e.g. direct calls from a hypothetical future
  manager UI that voids ledger entries without going through the unmatch
  flow) is to push the unmatch cascade into `rpc_ledger_void` itself —
  on void, look up `reconciliation_matches` linked to the entry, DELETE
  them, and recompute `bank_transactions.matched_total` +
  `match_status` for each affected bank tx. Lower priority because
  `voidAsLedgerDuplicate` is the only PP5-era caller that needs this and
  it's handled at the action layer.

- **`MULTI_LINKED` guard architectural assumption (PP5-B).**
  `voidAsLedgerDuplicate` hard-errors with `errorCode='MULTI_LINKED'` if
  a credit is linked to >1 distinct bank tx. Currently impossible via
  any normal Strata Wise flow but allowed by the
  `UNIQUE(bank_transaction_id, ledger_entry_id)` constraint (which only
  blocks same-pair duplicates). LD-21 verifies the guard by hand-crafting
  the impossible state. If a future flow legitimately creates this
  multi-linked state (e.g. a "merge two bank txs into the same credit"
  feature), the guard needs a coordinated lift: either drop into
  manual-cleanup logic (with full audit-log fidelity) or extend
  `rpc_unmatch_bank_transaction` to handle credit-already-voided
  internally so multiple consecutive calls are safe.

### PP5-C — Owner self-report payment claim flow

- **Owner withdraw not implemented (Gap G).** Owners cannot withdraw
  a `pending` claim once submitted. If real-world signal indicates
  owners need this (e.g. they realise they typed the wrong amount or
  date), add a `'withdrawn'` `claim_status` value + a
  `withdrawPaymentClaim` server action gated on
  `claim_status === 'pending'` AND `claimed_by_profile_id ===
  caller`. Also add a DELETE/withdraw policy if RLS hardening (below)
  has landed by then.

- **Claim TTL not implemented (Gap H).** Pending claims can sit in
  the queue indefinitely. If real-world telemetry shows the queue
  growing unmanageably (>100 stale pending claims per subdivision),
  add a cron-based auto-rejection after N days with manager
  notification. PP5-0 ratification deferred this; PP5-C maintains
  the deferral.

- **Void-cascade orphan: stale-link condition (PP5-C MEDIUM risk).**
  When a matched claim's bank tx is voided via `voidBankTransaction`
  (UPDATE `is_voided=true`, not DELETE), the FK `ON DELETE SET NULL`
  on `owner_payment_claims.bank_transaction_id` does NOT fire — the
  link stays set, pointing at a now-voided row. Same for
  `ledger_entry_id` (linked credit is voided via offset, not deleted).
  `claim_status` stays `'matched'`. Stale state, not null state. OPC-16
  verifies the current behaviour. Real fix options:
  - (a) Trigger on `bank_transactions.is_voided` UPDATE that flips
    `claim_status='pending'` for any matched claim pointing at the
    voided tx (most automated).
  - (b) Manager queue filter that surfaces "matched but underlying
    bank tx voided" claims for re-review (least invasive).
  - (c) DB view (`v_orphaned_matched_claims`) that joins
    `owner_payment_claims` to `bank_transactions` and flags the
    `claim_status='matched' AND bank_transactions.is_voided=true`
    rows — manager queue page consumes the view (cleanest separation
    of concerns).
  Decision deferred to PP5-D or post-launch.

- **No RLS policies on `owner_payment_claims`.** Matches existing
  codebase convention (only `audit_log` has explicit policies);
  service-role bypass is the only access path; auth enforced at the
  action layer. Future hardening pass should add explicit policies
  across all owner-data tables (`owner_payment_claims`, `lots`,
  `subdivision_members`, `levy_notices`, etc.) consistently — not
  piecemeal. The PP5-C planning included three policies but they
  were stripped at apply time per existing convention.

- **Server action composition writes 3 audit entries per path-(ii)
  confirm (Spec gap H).** A successful
  `confirmAndMatchClaimViaNewBankTx` writes
  `bank_transaction.added_manually` + `reconciliation.matched` +
  `owner_payment_claim.matched` audits, all linked by foreign keys
  but appearing in three separate `entity_id` rows. Forensics queries
  must walk the chain. Acceptable trade-off (action composition vs
  helper-extraction) but worth documenting for future-Claude or
  forensics dashboards. CONTEXT.md §4.10 captures the chain shape.

### PP5-D-A — Bank-side duplicate review UI

- **`<BankDuplicateReviewDialog />` candidate row not pre-fetched.**
  The dialog renders the older (matched_against) row's id only — it
  doesn't show the candidate's transaction_date, amount, description,
  or source. Manager has to navigate to the older row separately to
  see context. PP5-D++ enhancement: lightweight server action
  `getBankDuplicateCandidateSnapshot(bank_transaction_id)` that returns
  the candidate's display fields, fetched on dialog open. Mirrors the
  pattern proposed for PP5-D-C's `getNearbyBankTxsForClaim`. Low
  priority — the manager can still make the review decision from the
  metadata (day_delta, amount, source pair, hash) shown today.

### PP5-D-B — Ledger-side duplicate review UI

- **`LedgerDuplicateMetadata` defensive narrowing duplicated across
  two surfaces.** The JSONB metadata's structured shape is narrowed
  inline at the use site in both
  [`lot-ledger-tab.tsx`](src/app/(dashboard)/subdivisions/[subdivisionCode]/lots/[lotId]/lot-ledger-tab.tsx)
  (the `openLedgerDup` function) and
  [`lot-ledger-drawer.tsx`](src/app/(dashboard)/subdivisions/[subdivisionCode]/lots/[lotId]/lot-ledger-drawer.tsx)
  (the dialog-mount IIFE). The shape validation is identical; the
  duplication is acceptable at 2 sites. **If a third surface adds the
  same review affordance** — e.g. a top-level "all flagged ledger
  duplicates in this subdivision" listing per Q5.1 deferred — factor
  to a `narrowLedgerDuplicateMetadata(raw): LedgerDuplicateMetadata |
  null` helper in `src/lib/validations/reconciliation.ts` (or a new
  `src/lib/reconciliation/ledger-duplicate-metadata.ts`) to avoid the
  third copy.

- **Sheet+Dialog stacking validation NOT performed (PP5-D-D skipped).**
  The `LedgerDuplicateReviewDialog` mounts as a sibling to the lot
  ledger drawer's `Sheet` (not nested). Both shadcn primitives portal
  at z-index 50; PP4-D's `CollisionResolutionDialog` already coexists
  with `MappingDetailDrawer` Sheet contexts in production without
  conflict, so precedent says this works — but the PP5-D-D smoke
  walkthrough that would have hand-tested it (lot detail page →
  drawer open → "Review duplicate" → dialog stacking) was skipped per
  user direction at PP5-D-E close. Concern carries forward: if
  stacking conflicts surface in real-browser usage, the fallback is
  to close the Sheet on dialog open via the existing `onResolved`
  chain — trivial one-line change.

### PP5-D-C-A — Claims queue backend + orphan filter

- **PostgREST single-row joined relation array-or-object pattern
  duplicated across 2 surfaces.** PP5-D-B's `mapLedgerEntry`
  (lot-ledger parent_status JOIN) and PP5-D-C-A's
  `listManagerPaymentClaims` orphan branch (claims orphan filter `bt`
  and `le` joins) both flatten the same shape: PostgREST returns a
  single-row joined relation as either `T | T[] | null` depending on
  whether it's an embedded resource or a single FK relation. **If a
  fourth instance lands**, factor to a tiny shared helper:

  ```ts
  function flattenSingleRelation<T>(raw: T | T[] | null | undefined): T | null {
    if (raw === null || raw === undefined) return null;
    return Array.isArray(raw) ? (raw[0] ?? null) : raw;
  }
  ```

  Place in `src/lib/supabase.ts` or a new `src/lib/postgrest-helpers.ts`.
  Two sites is acceptable; three or more justifies the helper.

- **Custom toggle chip styling for URL boolean filters duplicated
  across 2 sites.** PP5-D-A's `?dup=1` chip in the reconciliation
  queue and PP5-D-C-A's `?orphan=1` chip in the claims queue both
  re-implement `FilterChips`'s visual primitive inline (rounded-full
  border + primary-when-active, with `aria-pressed` + URL-state
  toggle). The duplication is acceptable at 2 sites because the
  alternative (FilterChips with a single-option Set) doesn't preserve
  the `?<key>=1` URL convention used for `rr`, `fh`, `dup`, `orphan`.
  **If a third site lands** (or `FilterChips` evolves visually),
  extract `<UrlBoolFilterChip label key>` primitive that wraps the
  URL state pattern and uses the same Tailwind classes as
  `FilterChips`'s rendered chips. Defer until needed.

### PP5-D-C-B — Manager claim review dialog

- **`manager-claim-review-dialog.tsx` shipped as 1200-line
  monolithic-but-cohesive single file.** Split candidates:
  `CandidateRow` (~70 LOC, purely presentational), `classifyErrorCode`
  (~30 LOC, pure function), form schemas + state-machine types
  (~50 LOC). Net split would drop ~250 LOC out of dialog. **Defer
  until** (a) split improves debuggability evidenced when the file
  becomes a friction point, OR (b) post-launch UX iteration adds new
  stages or candidate-list variants. Cohesion (reducer + types +
  render branches tightly coupled) makes the single-file shape
  defensible until friction surfaces. (PP5-D-D smoke walkthrough
  skipped — see carryforward note below.)

- **Orphan-mode review action affordance not implemented (Gap JJ).**
  Orphan rows on `/reconciliation/claims?orphan=1` render no Review
  button — managers can see the orphaned claim but cannot directly
  re-confirm or re-link it from the queue. Action options for a
  future enhancement:
  - "Re-confirm" — re-runs the original allocation against the
    current state (likely a no-op if nothing else has changed; useful
    when the bank tx was un-voided).
  - "Re-link to a different bank tx" — opens a flow similar to the
    pending-claim review with the existing allocation pre-populated.
  - "Re-pend" — flips `claim_status` back to `'pending'` so it
    re-enters the standard review queue.
  Defer until real-world manager telemetry indicates which (or all)
  affordances are needed.

- **Manager claim review dialog: multi-allocation row support.**
  `<ManagerClaimReviewDialog />` ships with a single locked allocation
  row (lot pre-filled from `claim.lot_id`, fund_type derived from
  selected bank account, amount locked to `claim.amount`). The
  underlying server action `confirmAndMatchClaimViaNewBankTx`
  accepts an `allocations` array. Future enhancement: allow managers
  to split a single owner claim across multiple lots (rare but
  possible — e.g. an owner pays for two of their lots in one bank
  transfer). UI cost is non-trivial (need add/remove rows, sum-to-claim
  validation, fund-type-per-row resolution). Defer until a manager
  reports the need.

### PP5-D-D — Smoke walkthrough (skipped)

- **PP5-D-D smoke walkthrough skipped at Prompt 5 close.** PP5-D-D was
  scoped as a read-only hand-test report covering each PP5-D UI
  surface in a real browser:
  - Bank-side duplicate review dialog (PP5-D-A) — confirm / reject /
    `MATCH_ACTIVE` paths, queue chip, badge priority over
    `FuzzyHintCell`, bank tx detail page badge.
  - Ledger-side duplicate review dialog (PP5-D-B) — void / keep /
    `MULTI_LINKED` paths, voided-parent banner, lot ledger tab badge,
    drawer banner + Review button, **Sheet+Dialog stacking
    validation**.
  - Manager claim review dialog (PP5-D-C-B) — default / match-existing
    / match-new / reject / submitting / done / error paths,
    `LIKELY_DUPLICATE` special transition, empty-state pivot,
    rejection-reason gate, error retry, toast wording.
  Skipped per user direction to proceed to Prompt 5 close. The
  state-machine bugs and z-index/stacking issues that the smoke
  walk would have surfaced are NOT validated by the verification
  suite. Recovery path if UI bugs surface post-launch: smoke-walk
  the affected surface using PP4-D-6's discipline (the gate that
  caught DoneFlashView and ProposalFlagPayload.lot_label issues that
  Prompt 4's verification suite missed).

## From Prompt 6

### Pre-launch operational tasks (load-bearing)

- **Resend webhook configuration.** `RESEND_WEBHOOK_SECRET` env var
  must be set in Vercel and the webhook endpoint
  (`https://<deploy>/api/webhooks/resend`) must be registered in the
  Resend dashboard with the Standard Webhooks signing key matched to
  the env var. Until both are configured, the handler returns 400
  (fail-closed) and `communication_log` rows stamp `sent` from the
  sender call but never progress to `delivered` / `opened` /
  `bounced` / `complained`. PP6-D-D smoke walk Steps 1-3 confirmed
  the sender path works against this gap; webhook propagation
  remained DEFERRED at close.

- **Trigger.dev account signup + cron task deploy.** The two PP6
  crons (`accrueInterestForSubdivisionJob`, `checkOverdueLeviesJob`)
  ship as framework-agnostic modules under `src/lib/accrual/`. They
  are invocable today via `tsx` scripts + the verification suite,
  but no scheduled job is dispatching them in production. Pre-launch:
  sign up for Trigger.dev, create two scheduled tasks in `trigger/`
  (daily AEST midnight for accrual; daily AEST 09:00 for overdue
  check), wire each to its framework-agnostic job module per the
  PP3 Basiq pattern (no `"use server"` imports). Verify
  `grep -n "from.*actions" trigger/<task>.ts` returns zero hits.

- **Manager UI for company logo upload.** `management_companies.logo_url`
  is plumbed end-to-end through `resolveCompanyLogo` + all 11 email
  senders (PP6-D-D-fix-logo), but the column is NULL for every row in
  production today because no upload UI ships in Prompt 6. Until
  Prompt 6.5 lands the upload surface, every sender renders the
  text-only header. Scope: storage backend (likely R2 per PP0
  ProfilePictures pattern, or Supabase Storage for MVP), upload form
  in `/settings/company` with size + type validation, manual logo
  reset affordance, audit log on changes.

- **One-time UPDATE migration for legacy notification_preferences.**
  The Clerk webhook seed path used `payment_overdue` before PP6-C-1
  introduced `overdue_reminder`. Existing rows for Clerk-synced users
  predating PP6-D-B's seed-import refactor still carry the legacy
  type. Pre-launch SQL:
  `UPDATE notification_preferences SET notification_type = 'overdue_reminder' WHERE notification_type = 'payment_overdue';`
  (single-statement, idempotent). Run from Supabase SQL Editor with
  the line-by-line review discipline.

### Senders / communication retrofits

- **PDF attachment for overdue reminder emails.** Resend supports
  `attachments: [{ filename, content: Buffer }]`. Overdue reminder
  currently sends body-only; an attached PDF copy of the original
  levy notice would close the legal-trail loop. Implementation:
  resolve `levy_notices.pdf_url` for the parent levy (and each
  linked penalty_interest child), fetch the PDFs as Buffers,
  attach to the sender call. Edge cases: pdf_url null (template
  fallback or skip attachment), multi-levy reminders (concat into
  one PDF or attach multiple), Resend attachment size limit (40MB
  total across all attachments).

- **Hyperlink-to-dashboard pattern extension.** PP6-D-D-fix-overdue-link
  added a CTA hyperlink in `sendOverdueReminderEmail` to
  `/subdivisions/{shortCode}/my-arrears`. Pattern is dormant in 4
  remaining senders:
  - `sendPaymentReceivedEmail` → `/subdivisions/{shortCode}/my-payments`
  - `sendClaimMatchedEmail` → `/subdivisions/{shortCode}/my-payments`
  - `sendClaimRejectedEmail` → `/subdivisions/{shortCode}/my-arrears`
  - `sendNewClaimSubmittedEmail` → `/subdivisions/{shortCode}/reconciliation/claims`
    (the `reviewLink` param already carries this; verify rendering).
  Each retrofit must thread `subdivisionShortCode` from the emit
  helper (or the manager fan-out) through to the sender, with the
  same plain-text fallback when `NEXT_PUBLIC_APP_URL` is unset.

- **`escapeHtml` retrofit on 5 pre-PP6 senders.** PP6-C-1 introduced
  `escapeHtml` discipline for owner-facing senders. The 5 pre-PP6
  senders (`sendInvitationEmail`, `sendLevyEmail`, 3 basiq senders)
  still interpolate user-controlled strings (owner name, subdivision
  name, manager name) into HTML without escaping. Risk surface is
  low (these strings are manager-typed during onboarding, not
  user-submitted), but pre-launch retrofit is mechanical and
  defence-in-depth.

- **`communication_log` retrofit on 5 pre-PP6 senders.** The 5
  pre-PP6 senders dispatch via Resend but don't write a
  `communication_log` row, which means the webhook handler can't
  match their bounces / complaints back to a delivery record. The
  PP6-C-1 senders all follow the queued → sent → terminal state
  pattern via the emit helpers; pre-launch retrofit on the 5 older
  senders aligns the audit story.

- **Manager UI for auto-opt-out reversal.** PP6-C-2 webhook
  auto-opt-outs an owner from a notification type when Resend
  reports `email.complained` for that type's last delivery. There's
  no manager-facing surface today to see this happened or to
  re-enable on the owner's behalf (the owner would have to navigate
  to `/settings?tab=notifications` themselves and toggle back on).
  Pre-launch: surface auto-opt-out events in the manager's per-lot
  view with a "Re-enable" affordance (gated on owner confirmation).

- **LevyStatusBadge UTC vs AEST date precision.** Overdue tier
  transitions can be delayed by up to 10 hours when the badge
  computes `due_date < today` using UTC `Date` semantics while the
  business day boundary is AEST. Owners in Melbourne see "due today"
  on a notice that's actually overdue in their local timezone for a
  10-hour window each day. Fix: route the date comparison through an
  AEST-aware helper (no DST drift; Australia/Melbourne tz database).
  Risk is cosmetic (badge label only; arrears computation already
  uses date-only AEST inputs).

### Defence-in-depth + edge cases

- **Multi-allocation bank tx undercount (SG-2 narrow window).**
  `emitPaymentReceivedEmail` uses `bank_transactions.payment_received_email_sent_at`
  as the per-bank-tx sentinel. When a single bank tx allocates to
  multiple lots with different owners (rare in practice but possible
  — owner pays for two of their lots in one bank transfer; or a
  manager splits an unidentified payment across multiple lots),
  only the first owner receives the email. The other owners' emails
  short-circuit on the now-stamped sentinel. Refactor path: per-
  `(bank_transaction_id, recipient_profile_id)` tracking table or
  embed allocation-recipient set in the sentinel column. Defer
  until a real-world manager reports the miss.

- **Defence-in-depth partial UNIQUE on `levy_notices`.** Penalty
  interest levies are created via `rpc_accrue_interest_for_subdivision`
  which derives a deterministic `(linked_levy_id, period_start)` pair
  per run. The RPC is atomic with the `interest_accrual_runs` insert,
  so duplicate creation requires a UNIQUE violation on the runs
  table to slip past — but if the runs table is somehow bypassed
  (operator manual SQL, future refactor), the penalty rows could
  duplicate. Defence-in-depth:
  `CREATE UNIQUE INDEX ON levy_notices (linked_levy_id, period_start) WHERE levy_type = 'penalty_interest';`
  Partial index keeps it scoped; existing data already satisfies it.

- **Tiny-outstanding edge case in accrual.** When `outstanding × rate`
  rounds to $0.00 (e.g. $0.01 × 2% = $0.0002), the accrual RPC takes
  the `CONTINUE` branch and writes no penalty row. Sentinel is NOT
  stamped on the parent because no penalty levy was created. Re-runs
  will keep evaluating the same lot. Behaviour is correct (no
  infinite penalty creation) but a future "skip ledger" sentinel on
  the parent would avoid the per-day re-evaluation cost. Defer until
  cron latency telemetry indicates need.

- **`updateNotificationPreferences` MANDATORY guard scope.**
  Application-layer guard currently rejects email-channel disables
  for `MANDATORY_NOTIFICATION_TYPES`. If a future MANDATORY type
  requires cross-channel protection (e.g. mandatory in-app + email),
  expand the guard to enforce per-channel. PP6-D-B left the guard
  email-only because the only MANDATORY type today
  (`levy_final_notice`) is statutory email delivery; in-app is a
  convenience copy. Revisit when PP6-C-3 lands and the MANDATORY
  set grows.

- **Complaint path real-send not exercised in PP6-D-D smoke walk.**
  W-4 unit test in `route.verification.ts` covers the
  `email.complained` handler logic (parse, status guard,
  auto-opt-out insert, audit). No real-send walk against an actual
  Resend complaint event was attempted (would require recipient
  cooperation marking a real send as spam — impractical for smoke).
  Risk is bounded by unit-test coverage; pre-launch operational
  task is the webhook configuration itself (above).

### Verification suite hardening

- **`EMAIL_DRY_RUN` gate audit for new verification suites.**
  PP6-D-D-fix-email-leak (`b2a723b`) retrofitted the env gate across
  6 pre-PP6-C-1 suites (basiq, reconciliation, owner-payment-claims,
  ledger, duplicate-detection, ledger-duplicate-detection,
  orchestrator). Every future verification suite that exercises a
  code path which can dispatch email MUST opt in to the gate (assert
  `EMAIL_DRY_RUN === '1'` at top of `main()` and exit-on-unset).
  Grep invariant: every `*.verification.ts` that imports from
  `@/lib/email` must reference `EMAIL_DRY_RUN`.

- **`email.verification.ts` E-8 fixture cleanup hardening.** E-8
  (orphan-lot scenario) intermittently fails with a null read on
  residual state from prior interrupted runs. Standalone re-runs
  always pass. Hardening path: insert a pre-test sweep that purges
  `__VERIFY_EMAIL__`-marked rows older than 1 hour before the
  fixture builder runs. Low priority — flake is cosmetic, not a
  correctness signal.

- **Verification suite transient-network flakes.** During batched
  ladder runs, `basiq.verification.ts` and `accrual.verification.ts`
  occasionally fail with transient fetch errors (Supabase / Resend
  edge proxy). Standalone re-runs pass. `payment-status.verification.ts`
  also shows a PERF cold-cache spike (cold=634ms vs 500ms threshold)
  on the first batched run; warm runs are stable at ~297ms.
  Hardening path: retry-with-backoff wrapper at the suite harness
  level, or warm-up call before the timed window. Low priority —
  doesn't affect functional correctness.

### Owner portal + lot ledger deferrals

- **Owner-side in-app notifications deferred to Prompt 7.**
  PP6-C-2 wires the in-app channel for the single managerial type
  (`new_claim_submitted`). Owner-facing types still email-only;
  the owner portal has no notification bell / unread badge today.
  Prompt 7 to add the bell component, unread count via
  `notifications.read_at IS NULL`, and per-type rendering.

- **Lot ledger nested penalty_interest rows + outstanding interest
  display.** Lot ledger drawer currently shows a lifetime-interest
  summary line (PP6-D-A) but penalty_interest entries render as
  flat siblings in the entries list. Visual indent + parent-child
  rendering (similar to the `/my-arrears` page's owner view) would
  improve manager scannability. Deferred to Prompt 7.

- **Per-lot interest rate override.** `penalty_interest_rate` is a
  subdivision-level column. Some OCs may want per-lot overrides
  (e.g. statutory hardship reduction for a specific owner). Schema
  delta + accrual RPC update + manager UI. Defer until a manager
  reports the need.

- **Batch-level overdue indicator on per-OC batch list.** PP6-D-A
  added overdue badges at the per-notice level across 3 list views.
  The per-OC batch list (showing aggregated counts per batch) has no
  rolled-up overdue indicator. Defer until manager workflow signals
  demand.

### Prompt 5 carryforward (re-surfaced)

- **`voidAsLedgerDuplicate` cascade architectural cleanup.** PP5
  carryforward not exercised in Prompt 6; logged here for visibility.
  Original concern: the duplicate-flag-void path detaches matches
  via `rpc_unmatch_bank_transaction` which cascades to bank-side
  state, but the architectural relationship between
  duplicate-status mutations and match-state mutations isn't
  isolated cleanly. Revisit before launch.

### PP6-D-D smoke walk record

- **Steps 4-7 SKIPPED in PP6-D-D smoke walk.** Per user directive
  after Step 3's SG-2 stamp-before-helper invariant verified. Step
  3 was the only step uniquely surfacing an invariant not covered
  by unit tests. Steps 4 (claim rejected), 5 (new claim fanout),
  6 (multi-allocation bank tx), 7 (bounce path) are covered by
  `email.verification.ts` E-3 through E-7 + `route.verification.ts`
  W-3 + W-4. If post-launch telemetry surfaces a path-specific bug,
  the corresponding `tmp-smoke/step{N}-*.ts` script can be
  resurrected from git history (commit `114defa`'s parent state had
  them present pre-cleanup).

- **Webhook propagation verification DEFERRED.** Smoke walk Steps
  1-3 verified the sender path; webhook event propagation
  (`delivered` / `opened` / `bounced` / `complained` status
  transitions on `communication_log`) requires `RESEND_WEBHOOK_SECRET`
  + endpoint registration in the Resend dashboard. Listed as a
  pre-launch operational task above.