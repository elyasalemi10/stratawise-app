# CONSOLIDATION PLAN — Prompt 0 (Part 1: Recon & Plan)

**Status:** Draft for review. **DO NOT EXECUTE** until explicitly approved.
**Scope:** Database schema only. UI/dead-code files are out of scope for this prompt.
**Data safety:** Confirmed — the DB contains no data that must be preserved. Rebuild from scratch is acceptable.

---

## Summary of the drift

- Base schema (`database-schema.sql`) is **not** authoritative.
- 9 `database-migration-*.sql` files patch/extend it.
- Several migrations conflict with the base (notably `notifications`, `calculate_oc_tier`).
- Some migrations add columns the code depends on (`insurance_policies.document_url`, `levy_notices.batch_id`, `subdivisions.street_name` etc.) — these are load-bearing and stay.
- Some tables/columns exist in the schema with **zero** code references — dead weight, drop.
- Some tables with `updated_at` columns are missing the `update_updated_at()` trigger.

---

## Section A — Every table in the final schema

Ordering is dependency order. For each table, **Source** describes what survives; **Drop** / **Add** describe changes against the base schema.

### 1. `management_companies` — **hybrid** (base + certificate-fields migration)
- Columns: `id`, `name`, `abn`, `address`, `phone`, `email`, `logo_url`, `subscription_status`, `registered_name`, `signature_url`, `created_at`, `updated_at`
- **Drop:** `stripe_customer_id` (zero code refs; Stripe Connect is not on the current roadmap)
- **Add:** `registered_name`, `signature_url` (from certificate-fields migration — used in settings + reports)

### 2. `profiles` — **base**
- Columns: `id`, `auth_user_id`, `email`, `first_name`, `last_name`, `phone`, `postal_address`, `avatar_url`, `role`, `company_role`, `management_company_id`, `status`, `deactivated_at`, `anonymised_at`, `created_at`, `updated_at`
- No changes. Base schema already correct. `company_role` already exists — the `database-migration-company-roles.sql` file is redundant.

### 3. `user_consents` — **base**
- No changes.

### 4. `notification_preferences` — **base**
- No changes.

### 5. `subdivisions` — **hybrid** (base + certificate-fields + subdivision-wizard migrations)
- Columns: base schema plus `common_seal_text`, `inspection_address`, `manager_appointed`, `administrator_appointed`, `subdivision_type`, `management_start_date`, `levy_year_start_month`, `levies_per_year`, `bank_connection_type`, `street_number`, `street_name`, `suburb`, `setup_step`
- **Add:** all of the above (from migrations — used throughout the subdivision wizard, settings, and reports)
- Includes all CHECK constraints from subdivision-wizard migration

### 6. `lots` — **base minus owner_* denormalisation, plus unit_number**
- Columns: `id`, `subdivision_id`, `lot_number`, `unit_number`, `lot_entitlement`, `lot_liability`
- **Drop:** `owner_name`, `owner_email`, `owner_phone`, `owner_type`, `owner_occupied` (per user directive — ownership is modelled via `subdivision_members` + `profiles`; `owner_occupied` is not a real concept in VIC strata, was noise from the wizard)
- **Add:** `unit_number` (from subdivision-wizard migration — used in lot detail, levy notices, reports)
- **Drop constraint:** `chk_owner_type`

### 7. `subdivision_members` — **base**
- No changes. This is the canonical source of lot ownership.

### 8. `state_compliance_rules` — **base**
- No changes.

### 9. `invitations` — **base**
- No changes. Already carries `email`, `name`, `phone` for pre-acceptance identity.

### 10. `budget_categories` — **base**
- No changes.

### 11. `budgets` — **base**
- No changes.

### 12. `budget_items` — **base**
- No changes. (FK to `charge_groups` still added after its table creation.)

### 13. `levy_batches` — **migration-only → promoted**
- From `database-migration-levy-batches.sql`. Promoted to first-class citizen in the consolidated schema. Used in levy generation flow.

### 14. `levy_notices` — **base + levy-batches migration**
- **Add:** `batch_id` (FK to `levy_batches`), `pdf_url`
- Partial index `idx_levy_notices_batch` added.

### 15. `levy_notice_items` — **migration-only → promoted**
- From levy-batches migration. Per-line items within a levy notice.

### 16. `payments` — **base**
- No changes. FK to `bank_transactions` retained.

### 17. `bank_accounts` — **hybrid**
- **Drop:** `stripe_account_id` (zero code refs; Stripe Connect out of scope for this phase)
- **Keep:** `basiq_user_id`, `basiq_connection_id`, `last_poll_at` (Basiq integration is the next phase)
- **Add trigger:** `trg_updated_at_bank_accounts` (currently missing)

### 18. `bank_transactions` — **base**
- No changes. `basiq_transaction_id` UNIQUE constraint stays.

### 19. `meetings` — **base**
- No changes.

### 20. `agenda_items` — **base**
### 21. `votes` — **base**
### 22. `meeting_minutes` — **base**
### 23. `proxies` — **base**
### 24. `proxy_directions` — **base**
### 25. `committee_nominations` — **base**
- No changes to any of the above.

### 26. `insurance_policies` — **hybrid**
- **Add:** `document_url` (from insurance migration — used for certificate-of-currency uploads)
- **Add trigger:** `trg_updated_at_insurance_policies` (currently missing)

### 27. `insurance_claims` — **base**
- No changes.

### 28. `maintenance_requests` — **base**
### 29. `announcements` — **base**

### 30. `documents` — **base + documents-lots migration**
- **Add:** `lot_id` (nullable FK to lots for lot-scoped documents)
- **Add:** partial indexes `idx_documents_lot_id` (WHERE lot_id IS NOT NULL) and `idx_documents_subdivision_no_lot` (WHERE lot_id IS NULL)

### 31. `communication_log` — **base**
- No changes.

### 32. `complaints` — **base**
- No changes.

### 33. `notifications` — **RESOLVED from hybrid**
- **Chosen shape** (matches runtime code in `src/lib/actions/notifications.ts`):
  - `id`, `profile_id` (FK profiles, ON DELETE CASCADE), `subdivision_id` (FK subdivisions, ON DELETE CASCADE, nullable), `type` TEXT NOT NULL, `title`, `body`, `link`, `read_at`, `created_at`
- **Discarded from migration:** `recipient_id` (wrong name), `message` (wrong name). The base schema was already correct on `profile_id` / `body` / `title` / `link` / `read_at`. The migration file's column names never actually matched runtime code — it was a dead migration.
- **Indexes:** `idx_notifications_profile`, `idx_notifications_unread` (partial, WHERE read_at IS NULL), `idx_notifications_subdivision`
- **NOTE on `read` boolean:** the base schema has a redundant `read BOOLEAN` column which the code writes in `markAsRead` but never queries (only `read_at IS NULL` is checked). See Section G, question 1.

### 34. `audit_log` — **base**
- No changes. INSERT-only RLS policies retained.

### 35. `escalation_workflows` — **base**
### 36. `escalation_workflow_steps` — **base**
### 37. `escalation_instances` — **base**
- No changes.

### 38. `charge_groups` — **base**
### 39. `charge_group_lots` — **base**
### 40. `contractors` — **base**
### 41. `payment_plans` — **base**
### 42. `reserve_fund_items` — **base**
### 43. `chat_messages` — **base**
### 44. `chat_attachments` — **base**
### 45. `chat_read_status` — **base**
- No changes.

---

## Section B — Tables being dropped entirely

| Table | Why |
|---|---|
| `bank_reconciliation_sessions` | Defined in base schema, **zero code references** anywhere in `src/`. Confirmed by `grep -rn "bank_reconciliation_sessions" src/` → no hits. The upcoming reconciliation build will introduce a new set of tables (see Part 3 CONTEXT.md handoff) that are intentionally different. |
| `lot_financial_summary` (MATERIALIZED VIEW) | Defined, never refreshed outside the unused helper, never queried anywhere in `src/`. Confirmed zero hits. |

No other candidates for deletion found.

---

## Section C — Functions, triggers, sequences

### Functions kept
- `next_reference_number(prefix TEXT)` — reference number generator
- `calculate_oc_tier()` — **updated** to VIC-legal thresholds (≤2→T5, ≤12→T4, ≤50→T3, ≤100→T2, else T1). Base schema had ≤9→T4 (wrong); migration corrected it; consolidated version is correct.
- `calculate_next_agm_due()` — AGM + 15 months
- `update_updated_at()` — generic timestamp trigger function

### Functions REMOVED
- `refresh_lot_financial_summary()` — dies with the materialised view.

### Triggers kept (existing)
- `trg_calculate_oc_tier` on `subdivisions`
- `trg_calculate_next_agm_due` on `subdivisions`
- All existing `trg_updated_at_*` triggers

### Triggers ADDED
- `trg_updated_at_bank_accounts`
- `trg_updated_at_insurance_policies`
- `trg_updated_at_levy_batches` (new table, has `created_at` only currently but we'll leave as-is — no `updated_at` column on the migration-defined levy_batches table, so no trigger needed)

*Actually `levy_batches` as defined in the migration only has `created_at`, no `updated_at`. We keep it that way — no trigger needed.*

### Sequences kept
All 11 existing sequences: `sw_lev_seq`, `sw_slev_seq`, `sw_pay_seq`, `sw_mtg_seq`, `sw_min_seq`, `sw_pol_seq`, `sw_clm_seq`, `sw_mnt_seq`, `sw_inv_seq`, `sw_cmp_seq`, `sw_esc_seq`.

### Sequences ADDED
- `sw_levy_batch_seq` (from levy-batches migration — promoted)

---

## Section D — Structural fixes (summary of all structural changes)

| # | Change | Rationale |
|---|---|---|
| 1 | Drop `lots.owner_name`, `owner_email`, `owner_phone`, `owner_type`, `owner_occupied` | Per user. Canonical source is `subdivision_members` + `profiles`. |
| 2 | Add `lots.unit_number` to schema | Used in UI/PDFs; was in migration only. |
| 3 | Resolve `notifications` → use base-schema shape (`profile_id`, `title`, `body`, `link`, `read_at`) | Matches runtime code. |
| 4 | Fix `calculate_oc_tier()` → VIC-legal thresholds | Per user; migration-corrected version wins. |
| 5 | Add missing `trg_updated_at` on `bank_accounts`, `insurance_policies` | Per user. |
| 6 | Promote `levy_batches`, `levy_notice_items`, `sw_levy_batch_seq`, `levy_batch_status` enum, `levy_notices.batch_id/pdf_url` from migration to consolidated schema | Used throughout levy flow. |
| 7 | Drop `management_companies.stripe_customer_id` | Zero code refs, Stripe Connect deferred. |
| 8 | Drop `bank_accounts.stripe_account_id` | Same. |
| 9 | Keep `bank_accounts.basiq_user_id/basiq_connection_id/last_poll_at` | Basiq is the next build phase. |
| 10 | Drop `bank_reconciliation_sessions` table | Zero refs. |
| 11 | Drop `lot_financial_summary` materialised view + `refresh_lot_financial_summary()` | Zero refs. |
| 12 | Add `registered_name`, `signature_url` on `management_companies` | Used in settings + reports. |
| 13 | Add `common_seal_text`, `inspection_address`, `manager_appointed`, `administrator_appointed` on `subdivisions` | Used in OC Certificate generation. |
| 14 | Add all subdivision-wizard columns on `subdivisions` + CHECK constraints | Used throughout wizard + settings. |
| 15 | Add `documents.lot_id` + partial indexes | Used for lot-scoped docs. |
| 16 | Add `insurance_policies.document_url` | Used for certificate-of-currency uploads. |

---

## Section E — Enums

| Enum | Values | Status |
|---|---|---|
| `profile_role` | `super_admin`, `strata_manager`, `lot_owner` | unchanged |
| `profile_status` | `active`, `deactivated`, `anonymised` | unchanged |
| `company_role` | `admin`, `manager`, `viewer` | unchanged (the company-roles migration is redundant) |
| `subdivision_status` | `active`, `archived`, `suspended` | unchanged |
| `subscription_status` | `active`, `suspended`, `cancelled` | unchanged |
| `fund_type` | `administrative`, `capital_works` | unchanged |
| `member_role` | `strata_manager`, `lot_owner` | unchanged |
| `invitation_status` | `pending`, `accepted`, `expired`, `revoked` | unchanged |
| `budget_status` | `draft`, `approved` | unchanged |
| `levy_status` | `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `written_off` | unchanged |
| `levy_type` | `regular`, `special`, `penalty_interest` | unchanged |
| `levy_batch_status` | `draft`, `sent`, `partially_sent` | **promoted from migration** |
| `payment_method` | `bpay`, `eft`, `cash`, `cheque`, `direct_debit`, `stripe_card`, `other` | unchanged |
| `match_confidence` | `exact_reference`, `amount_match`, `name_match`, `manual`, `auto_portal`, `basiq_auto` | unchanged (will be extended by the reconciliation prompts in a later step) |
| `transaction_source` | `manual`, `csv`, `basiq` | unchanged (correct as-is) |
| `meeting_type` | `agm`, `sgm`, `committee` | unchanged |
| `meeting_status` | `draft`, `notice_sent`, `in_progress`, `completed`, `cancelled` | unchanged |
| `resolution_type` | `ordinary`, `special`, `unanimous`, `information` | unchanged |
| `vote_choice` | `for`, `against`, `abstain` | unchanged |
| `maintenance_priority` | `low`, `medium`, `high`, `urgent` | unchanged |
| `maintenance_status` | `submitted`, `under_review`, `approved`, `in_progress`, `completed`, `rejected` | unchanged |
| `complaint_status` | `open`, `under_review`, `resolved`, `escalated`, `closed` | unchanged |
| `communication_channel` | `email`, `sms`, `voice`, `letter`, `in_app` | unchanged |
| `communication_status` | `queued`, `sent`, `delivered`, `opened`, `bounced`, `failed` | unchanged |
| `escalation_status` | `active`, `paused`, `completed`, `resolved`, `escalated_manual` | unchanged |
| `payment_plan_status` | `active`, `completed`, `defaulted`, `cancelled` | unchanged |
| `reserve_priority` | `critical`, `high`, `medium`, `low` | unchanged |
| `reserve_status` | `planned`, `in_progress`, `completed` | unchanged |
| `contractor_status` | `active`, `inactive` | unchanged |

---

## Section F — Rename register

Per the instruction "minimise renames; only rename where the current name is actively confusing or wrong", this register is intentionally empty. No renames are being proposed. Everything is either kept as-is, added, or dropped.

*(If you'd prefer any renames — e.g. `notifications.body` → `notifications.message` to match the runtime interface name — flag it now and I'll add it to this register. My recommendation is keep `body` and leave the mapping in `notifications.ts`; renaming the DB column forces a second code sweep for no user-visible benefit.)*

---

## Section G — Open questions

1. **`notifications.read` boolean column** — The base schema has both `read BOOLEAN` and `read_at TIMESTAMPTZ`. The code writes both in `markAsRead`, but only `read_at IS NULL` is ever queried. Two options:
   - **(A)** Keep `read` boolean in the schema (no code change needed).
   - **(B)** Drop `read`, adjust `markAsRead` / `markAllAsRead` in `src/lib/actions/notifications.ts` to stop writing it (cleaner; single source of truth).
   - **My recommendation: (B).** Cleaner schema, tiny code change. *Awaiting your call.*

2. **`notifications.subdivision_id` index** — The migration file had an index `(recipient_id, read_at) WHERE read_at IS NULL`. The base had separate indexes on `profile_id` and `read`. I'll add: `idx_notifications_profile(profile_id)`, `idx_notifications_unread(profile_id, read_at) WHERE read_at IS NULL`, `idx_notifications_subdivision(subdivision_id)`. Any objection?

3. **`invitations.name` + `invitations.phone`** — These exist on the base `invitations` table and are used to pre-populate the profile on acceptance. Keeping as-is. *Confirming you don't want them folded elsewhere.*

4. **`lots.lot_entitlement` + `lots.lot_liability`** — Kept on lots (not on subdivision_members) because they belong to the lot not the owner. Confirming this is the intended model.

5. **Dead UI files (`src/components/ui/spinner.tsx`, `src/components/ui/select.tsx`)** — Per user: out of scope for this prompt. Leaving them alone.

6. **Archive or delete the old migration files?** — The prompt says to delete them after the new schema is verified. I'll `git rm` them in Part 2 Step 2. Confirming that's the intent and you don't want them kept as a historical `migrations/` archive.

---

## Section H — Risk register

| Risk | Mitigation |
|---|---|
| **R1.** 16 files reference `lots.owner_name/owner_email/owner_phone/owner_type/owner_occupied`. Dropping these columns will require rewriting every one. | **LARGE BLAST RADIUS — flagged for explicit approval per the prompt's >15-file threshold.** Exhaustive file list below. I have a clear rewrite strategy: join `lots` → `subdivision_members` (left join, active members where `left_at IS NULL`) → `profiles`, falling back to pending `invitations` for display-only "unassigned" cases. Inline-edit of owner details in `lots-tab.tsx` / `lot-detail-content.tsx` becomes edit-profile-via-invitation flows or is removed (likely removed — the member row is the canonical record). |
| **R2.** `database-migration-notifications.sql` has a conflicting shape. If anyone ever ran it, the live DB might actually have a `recipient_id` / `message` table, not `profile_id` / `body`. | The user has confirmed the DB can be rebuilt from scratch. Part 2 Step 5 produces `REBUILD_INSTRUCTIONS.md` for a full drop+recreate. This eliminates the risk. |
| **R3.** `calculate_oc_tier` correction changes tier thresholds. | No live data to migrate. Function recreated clean. |
| **R4.** `levy_batches` / `levy_notice_items` promoted but their RLS `ENABLE ROW LEVEL SECURITY` must be added (the migration didn't include them). | Added in consolidated schema. Noted. |
| **R5.** FK ordering in the consolidated schema file must be correct (payments→bank_transactions, budget_items→charge_groups, maintenance_requests→contractors, levy_notices→levy_batches). | Addressed via `ALTER TABLE ... ADD CONSTRAINT` statements deferred to end of schema, mirroring the current base-schema pattern. |
| **R6.** `src/lib/actions/invitations.ts:181` currently updates `lots.owner_email` on invitation acceptance. | Remove this update entirely — member creation in `subdivision_members` is the source of truth. |
| **R7.** Reports PDF template reads denormalised owner fields. | Rewrite to accept owner data passed in from the caller (which will fetch via `subdivision_members` join in the server action). |
| **R8.** Subdivision wizard step 4 (`step-4-lots.tsx`) collects owner details per lot. | Rewrite: either (a) remove owner fields from the wizard entirely (lots are created without owners, invitations are sent separately), or (b) have the wizard create an `invitations` row per populated lot instead of writing to `lots.owner_*`. **Recommendation: (b)** — most natural for the wizard flow and preserves UX. *Flagging for your call.* |

### Full file list affected by R1 (16 files)

1. `src/lib/actions/subdivision.ts`
2. `src/lib/actions/invitations.ts`
3. `src/lib/actions/levy.ts`
4. `src/lib/actions/reports.ts`
5. `src/lib/validations/subdivision-wizard.ts`
6. `src/lib/pdf/templates/report.tsx`
7. `src/app/(dashboard)/dashboard/page.tsx`
8. `src/app/(dashboard)/subdivisions/new/actions.ts`
9. `src/app/(dashboard)/subdivisions/new/steps/step-4-lots.tsx`
10. `src/app/(dashboard)/subdivisions/[subdivisionId]/dashboard/page.tsx`
11. `src/app/(dashboard)/subdivisions/[subdivisionId]/manage/actions.ts`
12. `src/app/(dashboard)/subdivisions/[subdivisionId]/manage/lots-tab.tsx`
13. `src/app/(dashboard)/subdivisions/[subdivisionId]/lots/[lotId]/lot-detail-content.tsx`
14. `src/app/(dashboard)/subdivisions/[subdivisionId]/reports/reports-content.tsx`
15. `src/app/(dashboard)/subdivisions/[subdivisionId]/generate/generate-levies-form.tsx`
16. `src/app/(dashboard)/subdivisions/[subdivisionId]/levies/[batchId]/batch-detail-content.tsx`

---

## Checklist before approval

Before I start Part 2 I need explicit answers to:

- [ ] **G1.** Drop `notifications.read` boolean (recommended) — yes / no?
- [ ] **G2.** Notification index set proposed in G2 — OK?
- [ ] **G6.** Delete migration files (vs archive them) — confirm delete.
- [ ] **H8.** Wizard step-4 owner handling — rewrite to create `invitations` per populated lot (recommended), or strip owner fields entirely?
- [ ] **R1 (16 files).** Approved to proceed with full rewrite of every `lots.owner_*` reference.
- [ ] General: Plan is accepted, proceed to Part 2.

Once you confirm, I'll write the new `database-schema.sql`, delete the migration files, refactor the 16 code files, run `npx tsc --noEmit` + `npm run lint`, then produce `REBUILD_INSTRUCTIONS.md` and `CONTEXT.md`, then commit + push.
