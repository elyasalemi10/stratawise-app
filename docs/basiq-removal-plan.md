# Basiq removal + Macquarie DRN / CSV reconciliation plan

You want to drop Basiq entirely and replace bank-feed-driven reconciliation
with two inputs:

1. **Macquarie DRN-tagged feeds** (live integration — Macquarie's bank-statement
   API where every transaction carries the OC's Direct Reference Number),
2. **Manager CSV uploads** (Macquarie bank-statement export as a fallback /
   primary for non-Macquarie OCs).

This doc captures the demolition list, the replacement design, and the open
questions I need your call on before executing.

---

## Demolition list — files / tables / jobs to delete

Tables (data is empty across all of them, so a plain DROP is safe):

- `basiq_connections`
- `basiq_gap_reports`
- `basiq_reauth_notifications`

Columns to drop / change:

- `owners_corporations.bank_connection_type` (values `basiq` | `manual`) →
  replace with `bank_provider` (`macquarie` | `manual_csv`) and add
  `macquarie_drn TEXT` for the OC's reference number.
- `bank_transactions.basiq_*` columns (basiq_id, basiq_metadata) → drop.

Files / directories:

- `trigger/basiq-jobs.ts` (all polling + reauth jobs)
- `src/lib/basiq/*` (client, reauth, gap-report logic)
- `src/app/api/basiq/webhook/route.ts` (Basiq inbound webhook)
- All references in `src/app/(dashboard)/ocs/[ocCode]/reconciliation/` that
  trigger Basiq or render Basiq gap reports
- `src/app/(dashboard)/ocs/[ocCode]/bank-account/bank-feed-panel.tsx` —
  "connect via Basiq" UI
- `BASIQ_*` env vars in `.env.local.example`
- `notification_preferences` rows of type `basiq_reauth` / `basiq_gap`

Routes that need rewriting (not deletion):

- Bank account page — show Macquarie DRN + CSV upload instead of "Connect via
  Basiq"
- Reconciliation page — feed comes from `bank_transactions` populated by
  Macquarie sync OR CSV import; the matching engine itself stays (it doesn't
  know where transactions came from)
- Gap reports — concept morphs to "transactions we ingested but couldn't
  match to a known lot/levy" — same UI, different source

---

## Replacement design

### Two ingest paths into `bank_transactions`

```
[Macquarie API]                [CSV upload]
       │                            │
       │ daily cron / webhook       │ manager UI
       ▼                            ▼
   sync_macquarie_for_oc        import_csv_for_oc
       │                            │
       ▼                            ▼
   bank_transactions (existing table — add `source` enum)
       │
       ▼
   existing reconciliation engine (unchanged)
       │
       ▼
   matched: lot_ledger_entries credit
   unmatched: surfaced in reconciliation UI
```

`bank_transactions.source` enum: `macquarie_api` | `manual_csv`. Lets us
distinguish trust in matching (Macquarie comes with DRN, almost always 1:1
match; CSV needs more inference).

### Macquarie DRN matching

When Macquarie delivers a transaction, it includes:

- DRN (which OC trust account it landed in)
- Customer reference (free text — usually the lot's BPAY CRN or the levy
  reference number)
- Amount, date, narrative

Match cascade:

1. `customer_reference` matches a `levy_notices.bpay_crn` → credit that lot.
2. `customer_reference` matches a `levy_notices.reference_number` → same.
3. Narrative fuzzy-match against `bank_payer_mappings` for the OC → same.
4. Otherwise → unmatched, surfaces in reconciliation queue.

DRN per OC stored as `owners_corporations.macquarie_drn` (NOT NULL once the
manager picks "macquarie" as the bank provider).

### CSV upload flow

Manager uploads a Macquarie-style CSV (Date, Description, Debit, Credit,
Balance). We parse with a small header-detector (Macquarie has 3 known
column layouts; CBA / NAB / Westpac if they use those banks). For each row:

- Compute a dedup key from `(oc_id, date, amount, normalised_description)`
- Skip rows already imported (idempotent re-upload is safe)
- Run the same match cascade as Macquarie API
- Show preview before commit: "X new transactions, Y duplicates skipped"

CSV import is a **server action with a `csv` File field** — same
50MB-bumped limit. Bank statement CSVs are typically <500KB.

---

## Trigger-side changes

### Today (with Basiq):
- Daily poll: Basiq pulls transactions → reconcile
- Reauth job: warn manager when Basiq consent expires (90 days)
- Gap report job: detect missing-balance periods

### After Basiq removal:
- Daily Macquarie sync (only for OCs with `bank_provider='macquarie'`)
- No reauth — Macquarie API uses long-lived OAuth tokens (assumption — please
  confirm with their API docs)
- No gap reports — instead, surface "no transactions in the last N days"
  warning per OC on the dashboard

### When do levies fire?

These are **date-driven, not bank-feed-driven** — so they don't need
Basiq/Macquarie at all:

- **Levy issuance**: cron on the 1st of each quarter (or whatever cadence the
  OC chose). Generates `levy_notices` rows, sends notice emails.
- **Overdue notices**: cron daily; for each `levy_notices` with
  `due_date < today - grace_period AND effective_status = 'overdue'`, emit a
  reminder email. The `effective_status` calculation is already a view
  (`v_levy_notice_status`) — it joins against credits, so it works whether
  credits came from Macquarie or CSV.
- **Interest accrual**: cron monthly on the OC's `interest_accrual_day`. Already
  date-driven; no Basiq dependency.

**Key insight**: levies and overdues already work without bank feeds. The bank
feed is purely for *crediting* payments. Until a CSV is uploaded (or Macquarie
syncs), the system rightly considers payments as not received → overdue
notices fire. This is the correct behaviour.

The "wait for CSV" concern you raised is actually a *user-side* concern —
managers who don't upload weekly will get unnecessary overdues going out. We
should mitigate with:

- **Pre-overdue grace window** (configurable per OC, default 7 days past
  due_date) so managers have time to upload Friday's CSV before Monday's
  overdues go out.
- **Manager confirmation step** before bulk overdue emails fire — daily cron
  generates a *draft* batch; manager has 24h to review and either click
  "Send" or upload an updated CSV that auto-cancels rows now paid. This is
  a UX change to the existing overdue flow.

---

## Open questions before I execute

1. **Macquarie API access** — do you have a dev account / sandbox? Without
   API docs I'm guessing at the DRN delivery format. If you don't have access
   yet, I'll ship the manual_csv path fully and stub the Macquarie sync
   behind a "Connect" button that's wired-up-but-disabled.

2. **CSV format** — should we restrict to Macquarie's CSV layout only, or
   also support CBA / NAB / Westpac out of the box? (Each is a 30-min parser
   to add; rolling generic CSV with column-mapping UI is a few hours more.)

3. **Pre-overdue grace + manager review step** — happy with the design above
   (draft batch, 24h to send / cancel)? Or do you want overdues to fire
   *automatically* and rely on managers to upload CSV more frequently?

4. **DRN per OC** — should we generate the DRN ourselves at OC creation (10-
   digit numeric, our own counter), or does Macquarie assign it when the
   trust account is opened? If they assign it, the wizard's bank-account
   step needs a "Paste your DRN from Macquarie" input.

5. **Bulk historical CSV** — when onboarding a new OC, does the manager need
   to import 12 months of past statements to establish opening balance + back
   reconciliation? Or just go-forward from setup?

Answer those five, and I'll execute the removal in one session.
