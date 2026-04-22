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
- **Injection seam grep check:** symbols
  `__setUserIdResolverForVerification` and
  `__getUserIdResolverForVerification` must appear ONLY in `src/lib/auth.ts`
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
- **Audit all `__verification`-prefixed exports in `src/lib/auth.ts`** before
  launch and confirm each is called only from `*.verification.ts` — no
  application code paths. The convention is: any `__`-prefixed export in
  `auth.ts` is a testing-only seam; grep -rn the name and verify no hit
  lands in a non-verification file.
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