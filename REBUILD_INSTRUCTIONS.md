# Rebuild Instructions — Fresh Database After Consolidation

The schema has been consolidated into a single authoritative file:
[database-schema.sql](database-schema.sql). The old `database-migration-*.sql`
files have been removed. To bring the live Supabase database in line:

## 1. Drop the existing schema

Run this in the Supabase SQL editor (project → SQL → New query). It nukes
the `public` schema and recreates it empty. **All data is destroyed** — the
plan confirmed there is nothing worth preserving.

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO service_role;
```

> If you have Supabase-managed policies, functions, or extensions outside
> `public` (e.g. `auth`, `storage`), they are untouched by the drop.

## 2. Apply the consolidated schema

Paste the entire contents of [database-schema.sql](database-schema.sql) into
a new SQL editor tab and run it. It creates, in order:

- Extensions (`uuid-ossp`, `pgcrypto`)
- All 29 enum types
- 12 global sequences + `next_reference_number()`
- 45 tables (management_companies → chat_read_status)
- 3 trigger functions + 15 triggers
- 42 `ENABLE ROW LEVEL SECURITY` statements + audit_log immutability policies
- Seed data: 14 VIC compliance rules, 23 budget categories, 1 default
  escalation workflow with 3 steps

Running the file should produce zero errors on a fresh, empty public schema.

## 3. Verification checklist

After the rebuild, run each query in the SQL editor and confirm the result:

| # | Query | Expected |
|---|-------|----------|
| 1 | `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';` | **45** |
| 2 | `SELECT COUNT(*) FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typtype = 'e';` | **29** |
| 3 | `SELECT COUNT(*) FROM information_schema.sequences WHERE sequence_schema = 'public';` | **12** |
| 4 | `SELECT COUNT(*) FROM state_compliance_rules WHERE state = 'VIC';` | **14** |
| 5 | `SELECT COUNT(*) FROM budget_categories;` | **23** |
| 6 | `SELECT COUNT(*) FROM escalation_workflows WHERE is_default;` | **1** |
| 7 | `SELECT COUNT(*) FROM escalation_workflow_steps;` | **3** |
| 8 | `SELECT column_name FROM information_schema.columns WHERE table_name = 'lots' ORDER BY ordinal_position;` | Exactly: `id, subdivision_id, lot_number, unit_number, lot_entitlement, lot_liability` — **no `owner_*` columns** |
| 9 | `SELECT column_name FROM information_schema.columns WHERE table_name = 'notifications' ORDER BY ordinal_position;` | `id, profile_id, subdivision_id, type, title, body, link, read_at, created_at` — **no `read` boolean, no `recipient_id`, no `message`** |
| 10 | `SELECT tgname FROM pg_trigger WHERE tgrelid IN ('bank_accounts'::regclass, 'insurance_policies'::regclass) AND tgname LIKE 'trg_updated_at_%';` | 2 rows |
| 11 | Lot-count sanity: `SELECT CASE WHEN (SELECT 1) <= 2 THEN 5 WHEN (SELECT 1) <= 12 THEN 4 ELSE 1 END;` / `INSERT INTO management_companies(name) VALUES ('TC') RETURNING id;` then `INSERT INTO subdivisions(management_company_id, name, plan_number, address, total_lots) VALUES (..., 'T', 'T', 'T', 12) RETURNING oc_tier;` | **4** (12 lots → tier 4 per VIC thresholds) |
| 12 | `SELECT NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name IN ('bank_reconciliation_sessions', 'lot_financial_summary'));` | **true** |

If any row differs from the expected value, stop and diff against
`database-schema.sql`.

## 4. Reset the reference-number sequences

The schema creates all sequences starting at 1, so no further action is
needed. (Previously `database-migration-reference-numbers.sql` restarted
`msm_levy_seq` — that behaviour is now baked in.)

## 5. Seed development profiles (optional)

Profiles are created on demand by `ensureProfile()` on first sign-in. No
manual seeding is required. If you want a super_admin for testing, run:

```sql
UPDATE profiles
SET role = 'super_admin', company_role = 'admin'
WHERE email = 'your-test-email@example.com';
```

## 6. Confirm the app runs

```bash
npx tsc --noEmit
npm run dev
```

Open http://localhost:3000, sign in, and walk through:
- Subdivision setup wizard (steps 1–5) — step 4 creates pending invitations,
  step 5 dispatches the emails.
- Manage page → lots tab — owners display from `subdivision_members` or
  pending invitations. Owner name/email/phone are read-only.
- Lot detail page — owner card shows status + contact info from the helper.
- Levy generation + batch detail — preview and batch lists pull owner info
  via the shared helper rather than denormalised lot columns.
