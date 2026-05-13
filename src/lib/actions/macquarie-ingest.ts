"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { parseTxnFile } from "@/lib/macquarie/txn";
import { looksLikePayFile } from "@/lib/macquarie/pay";
import { parseDrnCsv, matchDrnsToLots, type DrnMatchResult } from "@/lib/macquarie/drn-import";
import { tryAutoMatch } from "@/lib/reconciliation/orchestrator";

// ─── Ingest a TXN file into bank_transactions ───────────────────
//
// Per-row dedup: (bank_account_id, transaction_date, amount, description) —
// same key used by the CSV path so re-uploads are idempotent across formats.
// Match status starts as 'unmatched'; the existing reconciliation orchestrator
// picks it up via the bank-account page or the daily auto-match job.
//
// DRN handling: we save deft_reference_number on each row so the
// upcoming match cascade (DRN → BPAY CRN → ref number → fuzzy) can attribute
// the transaction once a `lot_drns` row exists for that DRN. No matching
// happens in this action.

export type TxnIngestSummary = {
  imported: number;
  duplicates: number;
  /** Of the imported rows, how many auto-matched via the DRN cascade. */
  autoMatched: number;
  warnings: string[];
};

export async function uploadMacquarieTxn(
  ocId: string,
  bankAccountId: string,
  formData: FormData,
): Promise<{ summary?: TxnIngestSummary; error?: string }> {
  try {
    await requireCompanyRole();
    await requireOCAccess(ocId);

    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "No file uploaded" };
    if (file.size > 10 * 1024 * 1024) return { error: "TXN file exceeds 10MB" };
    if (looksLikePayFile(file.name)) {
      return { error: "PAY-file ingest isn't supported yet — upload the TXN file instead." };
    }

    const supabase = createServerClient();

    const { data: account } = await supabase
      .from("bank_accounts")
      .select("id, oc_id")
      .eq("id", bankAccountId)
      .single();
    if (!account || account.oc_id !== ocId) {
      return { error: "Bank account not found" };
    }

    const text = await file.text();
    const parsed = parseTxnFile(text);
    if (!parsed.header) {
      return { error: "We couldn't read this as a Macquarie TXN file." };
    }
    if (parsed.transactions.length === 0) {
      return { error: "No transactions found in this file." };
    }

    // Build the dedup set from existing rows on this account.
    const { data: existing } = await supabase
      .from("bank_transactions")
      .select("transaction_date, amount, description")
      .eq("bank_account_id", bankAccountId);
    const seen = new Set(
      (existing ?? []).map(
        (t) => `${t.transaction_date}|${Number(t.amount).toFixed(2)}|${(t.description ?? "").trim()}`,
      ),
    );

    const summary: TxnIngestSummary = { imported: 0, duplicates: 0, autoMatched: 0, warnings: [] };
    for (const e of parsed.errors) {
      if (e.lineNumber > 0) {
        summary.warnings.push(`Line ${e.lineNumber}: ${e.message}`);
      } else {
        summary.warnings.push(e.message);
      }
    }

    const profile = await requireCompanyRole();

    for (const t of parsed.transactions) {
      const amount = t.signedAmountCents / 100;
      const key = `${t.transactionDate}|${amount.toFixed(2)}|${t.description.trim()}`;
      if (seen.has(key)) {
        summary.duplicates += 1;
        continue;
      }
      seen.add(key);

      const { data: inserted, error: insertErr } = await supabase
        .from("bank_transactions")
        .insert({
          bank_account_id: bankAccountId,
          source: "macquarie_txn",
          transaction_date: t.transactionDate,
          amount,
          description: t.description,
          deft_reference_number: t.deftReferenceNumber || null,
          match_status: "unmatched",
        })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        summary.warnings.push(`Line ${t.lineNumber}: ${insertErr?.message ?? "insert failed"}`);
        continue;
      }
      summary.imported += 1;

      // Auto-match credit transactions. The orchestrator's first strategy is
      // deft_drn (uses bank_transactions.deft_reference_number); skip debits
      // which represent OC outflows, not lot-owner receipts.
      if (amount > 0) {
        try {
          const matchOutcome = await tryAutoMatch({
            bankTransactionId: inserted.id,
            ocId,
            bankAccountId,
            description: t.description,
            amount,
            transactionDate: t.transactionDate,
            performedBy: profile.id,
          });
          if (matchOutcome.matched) summary.autoMatched += 1;
        } catch (err) {
          console.error(`uploadMacquarieTxn: auto-match failed for line ${t.lineNumber}`, err);
          // Don't fail the import — the row stays unmatched in the queue.
        }
      }
    }

    return { summary };
  } catch (err) {
    console.error("uploadMacquarieTxn: unexpected error", err);
    return { error: "Something went wrong — please try again." };
  }
}

// ─── DRN import preview + commit ────────────────────────────────

export type DrnImportPreview = {
  matches: Array<DrnMatchResult & { lotLabel?: string }>;
  totals: { total: number; matchedExact: number; matchedFuzzy: number; unmatched: number };
};

export async function previewDrnCsv(
  ocId: string,
  formData: FormData,
): Promise<{ preview?: DrnImportPreview; error?: string }> {
  try {
    await requireCompanyRole();
    await requireOCAccess(ocId);
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "No file uploaded" };
    if (file.size > 5 * 1024 * 1024) return { error: "CSV exceeds 5MB" };

    const text = await file.text();
    const { rows, errors } = parseDrnCsv(text);
    if (errors.length > 0 && rows.length === 0) {
      return { error: errors[0]?.message ?? "Couldn't parse the DRN CSV" };
    }

    const supabase = createServerClient();
    const { data: lots } = await supabase
      .from("lots")
      .select("id, lot_number, unit_number")
      .eq("oc_id", ocId);
    const { data: owners } = await supabase
      .from("lot_owners")
      .select("lot_id, name")
      .in("lot_id", (lots ?? []).map((l) => l.id));

    const matched = matchDrnsToLots(rows, lots ?? [], owners ?? []);
    const lotById = new Map((lots ?? []).map((l) => [l.id, l]));
    const enriched = matched.map((m) => {
      const lot = m.lotId ? lotById.get(m.lotId) : null;
      return {
        ...m,
        lotLabel: lot ? `Lot ${lot.lot_number}${lot.unit_number ? ` (${lot.unit_number})` : ""}` : undefined,
      };
    });

    const totals = {
      total: rows.length,
      matchedExact: enriched.filter((m) => m.confidence === "exact").length,
      matchedFuzzy: enriched.filter((m) => m.confidence === "fuzzy").length,
      unmatched: enriched.filter((m) => m.confidence === "none").length,
    };
    return { preview: { matches: enriched, totals } };
  } catch (err) {
    console.error("previewDrnCsv: unexpected error", err);
    return { error: "Something went wrong — please try again." };
  }
}

/**
 * Commit the user-confirmed DRN mappings. Caller passes the final lot
 * assignment per DRN; unassigned rows are skipped. New rows go in with
 * active_from=today; existing live mapping for the same DRN (active_to IS NULL)
 * gets its active_to set to yesterday so history is preserved.
 */
export async function commitDrnMappings(
  ocId: string,
  assignments: Array<{ drn: string; lot_id: string; primary_id?: string | null; secondary_id?: string | null }>,
): Promise<{ inserted?: number; supersededOld?: number; error?: string }> {
  try {
    await requireCompanyRole();
    await requireOCAccess(ocId);
    if (assignments.length === 0) return { inserted: 0, supersededOld: 0 };

    const supabase = createServerClient();

    // Belt-and-braces: confirm every lot_id belongs to this OC.
    const lotIds = Array.from(new Set(assignments.map((a) => a.lot_id)));
    const { data: lotsOnOC } = await supabase
      .from("lots")
      .select("id")
      .eq("oc_id", ocId)
      .in("id", lotIds);
    const validLotIds = new Set((lotsOnOC ?? []).map((l) => l.id));
    const safe = assignments.filter((a) => validLotIds.has(a.lot_id));

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    // Supersede any currently-live mapping for the same DRN.
    const drns = Array.from(new Set(safe.map((a) => a.drn)));
    let supersededOld = 0;
    if (drns.length > 0) {
      const { data: superseded } = await supabase
        .from("lot_drns")
        .update({ active_to: yesterday })
        .in("drn", drns)
        .is("active_to", null)
        .select("id");
      supersededOld = superseded?.length ?? 0;
    }

    const rows = safe.map((a) => ({
      lot_id: a.lot_id,
      drn: a.drn,
      primary_id: a.primary_id ?? null,
      secondary_id: a.secondary_id ?? null,
      active_from: today,
      source: "macquarie_csv" as const,
    }));
    if (rows.length === 0) return { inserted: 0, supersededOld };
    const { error: insertErr } = await supabase.from("lot_drns").insert(rows);
    if (insertErr) {
      console.error("commitDrnMappings: insert failed", insertErr);
      return { error: "Couldn't save DRN mappings — please try again." };
    }
    return { inserted: rows.length, supersededOld };
  } catch (err) {
    console.error("commitDrnMappings: unexpected error", err);
    return { error: "Something went wrong — please try again." };
  }
}
