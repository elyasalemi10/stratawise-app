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