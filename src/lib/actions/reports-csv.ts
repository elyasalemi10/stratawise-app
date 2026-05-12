// Pure CSV serialisers for report payloads.
// Kept out of the "use server" sibling (reports.ts) so client components can
// import them without triggering Next.js' "Server Actions must be async" error.

import type {
  OutstandingArrearsRow,
  OwnerStatementReport,
  TrustAccountSummaryRow,
} from "./reports";

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(values: Array<string | number | null | undefined>): string {
  return values.map(csvEscape).join(",");
}

export function outstandingArrearsToCsv(rows: OutstandingArrearsRow[]): string {
  const header = csvRow([
    "Lot",
    "Unit",
    "Owner",
    "Principal outstanding",
    "Interest outstanding",
    "Total outstanding",
    "Oldest due date",
    "Days overdue",
    "Ageing bucket",
  ]);
  const body = rows.map((r) =>
    csvRow([
      r.lot_number,
      r.unit_number ?? "",
      r.owner_display_name ?? "",
      r.principal_outstanding.toFixed(2),
      r.interest_outstanding.toFixed(2),
      r.total_outstanding.toFixed(2),
      r.oldest_due_date ?? "",
      r.days_overdue,
      r.bucket,
    ]),
  );
  return [header, ...body].join("\n");
}

export function ownerStatementToCsv(report: OwnerStatementReport): string {
  const meta = [
    csvRow(["Lot", report.lot_number]),
    csvRow(["Unit", report.unit_number ?? ""]),
    csvRow(["Owner", report.owner_display_name ?? ""]),
    csvRow(["From", report.from_date]),
    csvRow(["To", report.to_date]),
    csvRow(["Opening balance", report.opening_balance.toFixed(2)]),
    csvRow(["Closing balance", report.closing_balance.toFixed(2)]),
    "",
  ];
  const header = csvRow([
    "Date",
    "Category",
    "Description",
    "Reference",
    "Debit",
    "Credit",
    "Balance after",
  ]);
  const body = report.entries.map((e) =>
    csvRow([
      e.entry_date,
      e.category,
      e.description ?? "",
      e.reference ?? "",
      e.debit > 0 ? e.debit.toFixed(2) : "",
      e.credit > 0 ? e.credit.toFixed(2) : "",
      e.balance_after.toFixed(2),
    ]),
  );
  return [...meta, header, ...body].join("\n");
}

export function trustAccountSummaryToCsv(rows: TrustAccountSummaryRow[]): string {
  const header = csvRow([
    "Account name",
    "BSB",
    "Account number",
    "Fund type",
    "Bank",
    "Opening balance",
    "Inflows",
    "Outflows",
    "Closing balance",
    "Transactions",
    "Reconciled",
    "Unreconciled",
    "Last sync",
  ]);
  const body = rows.map((r) =>
    csvRow([
      r.account_name,
      r.bsb,
      r.account_number,
      r.fund_type,
      r.bank_name ?? "",
      r.opening_balance.toFixed(2),
      r.inflows.toFixed(2),
      r.outflows.toFixed(2),
      r.closing_balance.toFixed(2),
      r.transaction_count,
      r.reconciled_count,
      r.unreconciled_count,
      r.last_sync_at ?? "",
    ]),
  );
  return [header, ...body].join("\n");
}
