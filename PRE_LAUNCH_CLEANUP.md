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
    - Exactly ONE file with the definition: `src/lib/auth.ts`.
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

- **Pre-launch grep audit:** no exported server action should accept performedBy from the caller. Auth guards must resolve the performer identity server-side, not trust a client-supplied UUID.

  Known live finding (as of commit that split basiq cron paths):
  `src/lib/actions/reconciliation.ts` exports `tryAutoMatchByReference(args: AutoMatchArgs)` from a `"use server"` module, and `AutoMatchArgs` contains `performedBy: string`. A client could therefore import and call it with an arbitrary UUID. Triage options: (a) move to a non-`"use server"` shared module (mirrors the `src/lib/basiq/jobs.ts` pattern), (b) add `requireCompanyRole()` inside it and ignore the caller-supplied performer, (c) keep but document the intended non-client callers only. Decision deferred; does not block Prompt 3.

- **Bank parser verification (src/lib/basiq/parsers.ts):** every per-bank function is currently a thin wrapper around `parseGeneric` with a `TODO(pre-launch)` note. Confirm the actual description format for CBA, NAB, ANZ, Westpac, Macquarie, ING, and Bendigo & Adelaide against real sandbox transactions before launch, and replace the wrapper bodies with bank-specific handling. Also verify `BASIQ_INSTITUTION_IDS` map against the live `GET /institutions` response — the current values are best-effort placeholders.

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