# Basiq removal + Macquarie DEFT / CSV reconciliation plan

> **Status (this commit):** Basiq surface area deleted. Schema for the
> replacement design (DRN time-bounded mappings, opening balances, overdue
> draft batches) is migrated. Wizard now collects opening balances on a new
> page 6. **TXN/PAY parser, CSV parsers, reconciliation engine update, DRN
> import UI, and overdue draft+approval workflow remain to build** — see
> "Remaining work" at the bottom.



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

## Answers (locked in)

1. **Macquarie API / Direct Downloads / DEFT API → skipped, post-revenue.**
   Two ingest paths only: TXN-file parser (Macquarie's fixed-format weekly
   statement) and generic CSV upload. Manager drag-and-drops files.

2. **CSV: all major AU banks** — Macquarie, CBA, NAB, Westpac, ANZ, Bendigo.
   Header-detector picks the right parser per file.

3. **Overdue policy: draft + manager approval.** Daily cron generates a
   draft `levy_overdue_batches` row per OC. 24h to Send or upload a fresh
   import that auto-cancels rows now reconciled. After 24h no-action → auto-send.

4. **DRN ownership: Macquarie assigns. We never generate.** Critical fix:
   DRN = **DEFT Reference Number** (not "Direct"). One DRN per *payer* per OC
   (≈ one per lot, not one per OC). Mappings are **time-bounded** via the
   `lot_drns` table since DRNs can be reassigned on owner changes; historical
   transactions stay linked to the DRN active when they arrived. After OC
   creation the wizard's follow-up prompt is "Upload your DEFT Reference
   Number export from Macquarie Business Online" — we auto-match by
   Secondary ID (lot number) then Primary ID (payer name), surface unmatched
   for manual review, allow single-entry fallback.

5. **Go-forward only.** No back-reconciliation. Opening balances anchor the
   ledger:
   - Per OC: opening admin fund balance, opening capital works balance,
     optional opening maintenance plan fund balance (mandatory Tier 1/2,
     optional Tier 3–5).
   - Per OC: opening_balance_date, BSB+account_number per fund, "shared
     trust account for both funds" toggle.
   - Per lot: opening arrears (positive) or credit (negative) at setup date.
   - Encryption decision: BSB/account NOT column-encrypted (they're on every
     levy notice as BPAY/EFT details anyway). TFN remains encrypted.

## Remaining work (next session)

Schema is done. Old code is deleted. What still needs building:

- **TXN parser** (Macquarie's fixed-format statement file) — needs a sample
  file from the user / Macquarie docs to write column-position logic.
- **PAY parser** (consolidated settlements) — same source-file blocker.
- **Generic CSV parsers** — Macquarie, CBA, NAB, Westpac, ANZ, Bendigo
  formats. Detect format from header row.
- **DRN import flow** — Macquarie Business Online CSV → `lot_drns` rows
  with auto-match against `lots.lot_number` (Secondary ID) and owner_name
  (Primary ID), confirmation UI for unmatched rows.
- **Reconciliation engine update** — match cascade: DRN exact → BPAY CRN →
  reference number → fuzzy → manual queue. Date-aware DRN lookup using
  `lot_drns.active_from/active_to`.
- **Overdue draft+approval UI** — list of pending draft batches, per-batch
  detail view with Send / Cancel / Exclude-row actions, 24h countdown.
- **Daily overdue cron** — generates `levy_overdue_batches` + items for each
  OC with newly-overdue notices.
- **Bank-account page rebuild** — currently degraded after Basiq removal.
  Needs a clean "Trust accounts" panel with the Macquarie TXN/PAY +
  generic CSV upload zones.
- **`bank_connection_type` legacy column drop** — left in place for now to
  avoid breaking any code path; remove in a follow-up after reconciliation
  engine is rewritten.
