# Pre-Launch Cleanup

Small fixes to batch before going live. Non-blocking for feature work.

## From Prompt 0

- [ ] Fix pre-existing lint in `step-4-lots.tsx` (unused `eslint-disable-next-line`, `initialData: any[]`)
- [ ] Update `getSubdivisionWizardData()` to join pending invitations per lot; update `step-4-lots.tsx` to render pre-filled invitation data on re-edit so managers don't create duplicate invitations
- [ ] Update `REBUILD_INSTRUCTIONS.md` drop step to use `DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;` — current instructions leave stale types behind
- [ ] `CONTEXT.md` Section 2 says Next.js 15; `package.json` is 16.1.7. Update.

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