"use server";

import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { revalidateSidebarForSubdivision } from "./subdivision";
import { tryAutoMatch } from "@/lib/reconciliation/orchestrator";
import { detectSingleLevyReference } from "@/lib/reconciliation/reference";
import { canonicaliseSender } from "@/lib/reconciliation/canonical";
import {
  detectDuplicate,
  markDuplicate,
} from "@/lib/reconciliation/duplicate-detection";
import { detectAndMarkLedgerDuplicates } from "@/lib/reconciliation/ledger-duplicate-detection";
import {
  createBankPayerMapping,
  resolveCollision,
  detectRepeatedManualMatch,
  disableMapping as libDisableMapping,
  reactivateMapping as libReactivateMapping,
  deleteMapping as libDeleteMapping,
  type CollidingMappingSnapshot,
  type CreateMappingResult,
  type MappingStatus,
} from "@/lib/reconciliation/mappings";
import {
  addManualBankTransactionSchema,
  depositUndepositedFundsSchema,
  disableMappingSchema,
  duplicateReviewSchema,
  excludeTransactionSchema,
  ledgerDuplicateReviewSchema,
  mappingActionSchema,
  recordCashReceiptSchema,
  reconcileTransactionSchema,
  resolveMappingCollisionSchema,
  resolvePayerMappingCollisionSchema,
  unexcludeTransactionSchema,
  unmatchTransactionSchema,
  voidBankTransactionSchema,
  voidUndepositedReceiptSchema,
  LEVY_REFERENCE_REGEX,
  type AddManualBankTransactionInput,
  type BankTransactionDetail,
  type DepositUndepositedFundsInput,
  type DuplicateMetadata,
  type DuplicateReviewInput,
  type DuplicateStatus,
  type ExcludeTransactionInput,
  type LedgerDuplicateReviewInput,
  type MatchStatus,
  type ReconcileTransactionInput,
  type ResolvePayerMappingCollisionInput,
  type MatchConfidence,
  type ReconciliationMatchMethod,
  type ReconciliationQueueResult,
  type ReconciliationQueueRow,
  type RecordCashReceiptInput,
  type UndepositedFundsEntry,
  type UnexcludeTransactionInput,
  type UnmatchTransactionInput,
  type VoidBankTransactionInput,
  type VoidCascadePreview,
  type VoidUndepositedReceiptInput,
  type TransactionSource,
} from "@/lib/validations/reconciliation";
import type { FundType } from "@/lib/validations/ledger";

// Zod expects the optional-reference field to be an empty string OR a regex-matching string.
// Helper to normalise CSV/manual input.
function normaliseReference(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toUpperCase();
  return LEVY_REFERENCE_REGEX.test(s) ? s : null;
}

function formatIssues(issues: { message: string }[]): string {
  return issues.map((i) => i.message).join("; ");
}


// ============================================================================
// READS
// ============================================================================

interface QueueOptions {
  bankAccountId?: string | null;
  status?: MatchStatus | "all" | null;
  source?: TransactionSource | "all" | null;
  includeVoided?: boolean;
  page?: number;
  pageSize?: number;
  /** Multi-value filters introduced in PP4-D. */
  matchConfidence?: string[];
  /** Multi-value. EXISTS-style: a transaction matches if ANY of its
   *  reconciliation_matches.match_method values is in the list. In practice
   *  the orchestrator writes one method per transaction (all allocations
   *  share it), so this aggregation is rarely meaningful — see
   *  PRE_LAUNCH_CLEANUP. */
  matchMethod?: string[];
  /** Single boolean: only show matches flagged for review. */
  reviewRequired?: boolean;
  /** Single boolean: only show transactions with a fuzzy hint persisted. */
  hasFuzzyHint?: boolean;
  /** PP5-D-A: chip filter "Possible duplicate". When true, only return
   *  rows with duplicate_status='suspected'. When false/undefined, the
   *  default-queue-behaviour applies (hide 'confirmed', show 'suspected'
   *  with badge, show 'rejected' as normal). See CONTEXT.md §4.7. */
  dupSuspected?: boolean;
}

export async function getReconciliationQueue(
  subdivisionId: string,
  opts: QueueOptions = {},
): Promise<ReconciliationQueueResult> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
  const includeVoided = opts.includeVoided ?? false;

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, account_name, fund_type")
    .eq("subdivision_id", subdivisionId)
    .order("fund_type");

  const accountIds = (accounts ?? []).map((a) => a.id);
  const accountMap = new Map(
    (accounts ?? []).map((a) => [a.id, { name: a.account_name, fund_type: a.fund_type as FundType }]),
  );
  const bankAccountOptions = (accounts ?? []).map((a) => ({
    id: a.id,
    name: a.account_name,
    fund_type: a.fund_type as FundType,
  }));

  if (accountIds.length === 0) {
    return {
      rows: [],
      total: 0,
      page,
      pageSize,
      unmatchedCount: 0,
      unmatchedValue: 0,
      oldestUnmatchedDays: null,
      matchedThisMonthValue: 0,
      availableSources: [],
      bankAccounts: [],
    };
  }

  // Distinct sources across all (non-voided) transactions in this subdivision.
  // Filter-agnostic so the dropdown shows every source ever seen, regardless
  // of the currently-applied filters.
  const { data: sourceRows } = await supabase
    .from("bank_transactions")
    .select("source")
    .in("bank_account_id", accountIds)
    .eq("is_voided", false);
  const availableSources = Array.from(
    new Set((sourceRows ?? []).map((r) => r.source as TransactionSource)),
  ).sort();

  // PP4-D: filter on match metadata (match_confidence / match_method /
  // review_required) requires an EXISTS-style aggregate on
  // reconciliation_matches. We pre-compute the matching transaction IDs in a
  // small companion query and constrain the main query to that set. Cheaper
  // than a full join since the typical filtered selection is much smaller
  // than the parent transaction set.
  let txIdAllowlist: string[] | null = null;
  const filteringByMatchMeta =
    (opts.matchConfidence && opts.matchConfidence.length > 0) ||
    (opts.matchMethod && opts.matchMethod.length > 0) ||
    opts.reviewRequired === true;
  if (filteringByMatchMeta) {
    let mq = supabase
      .from("reconciliation_matches")
      .select("bank_transaction_id");
    if (opts.matchConfidence && opts.matchConfidence.length > 0) {
      mq = mq.in("match_confidence", opts.matchConfidence);
    }
    if (opts.matchMethod && opts.matchMethod.length > 0) {
      mq = mq.in("match_method", opts.matchMethod);
    }
    if (opts.reviewRequired === true) {
      mq = mq.eq("review_required", true);
    }
    const { data: matchRows, error: matchErr } = await mq;
    if (matchErr) {
      throw new Error(`getReconciliationQueue.matchFilter: ${matchErr.message}`);
    }
    txIdAllowlist = Array.from(
      new Set(
        (matchRows ?? [])
          .map((r) => r.bank_transaction_id as string)
          .filter(Boolean),
      ),
    );
    if (txIdAllowlist.length === 0) {
      // No transactions match the filter — return empty result set without
      // any further query.
      return {
        rows: [],
        total: 0,
        page,
        pageSize,
        unmatchedCount: 0,
        unmatchedValue: 0,
        oldestUnmatchedDays: null,
        matchedThisMonthValue: 0,
        availableSources,
        bankAccounts: bankAccountOptions,
      };
    }
  }

  let q = supabase
    .from("bank_transactions")
    .select(
      "id, bank_account_id, source, transaction_date, amount, description, matched_total, match_status, is_voided, excluded_reason, imported_at, fuzzy_hint_metadata, duplicate_status, duplicate_metadata",
      { count: "exact" },
    )
    .in("bank_account_id", accountIds);

  if (txIdAllowlist) q = q.in("id", txIdAllowlist);
  if (!includeVoided) q = q.eq("is_voided", false);
  if (opts.bankAccountId) q = q.eq("bank_account_id", opts.bankAccountId);
  if (opts.source && opts.source !== "all") q = q.eq("source", opts.source);
  if (opts.hasFuzzyHint === true) {
    q = q.not("fuzzy_hint_metadata", "is", null);
  }

  // PP5-D-A: duplicate-status default-queue-behaviour.
  // - dupSuspected=true: ONLY 'suspected' rows.
  // - default: hide 'confirmed' rows; show 'suspected' (badge) + 'rejected'
  //   (normal) + null. Rejected rows render as normal because the manager
  //   already said not-a-duplicate.
  if (opts.dupSuspected === true) {
    q = q.eq("duplicate_status", "suspected");
  } else {
    q = q.or("duplicate_status.is.null,duplicate_status.neq.confirmed");
  }

  const statusFilter = opts.status ?? "unmatched";
  if (statusFilter !== "all") q = q.eq("match_status", statusFilter);

  q = q
    .order("transaction_date", { ascending: false })
    .order("imported_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(`getReconciliationQueue: ${error.message}`);

  // PP4-D: per-row match summary + fuzzy hint label JOIN. Both are
  // resolved server-side in two small batches keyed by the page's tx IDs
  // so the queue UI never makes per-row server-action calls (Flag 3).
  const pageTxIds = (data ?? []).map((r) => r.id as string);
  type FuzzyHintMeta = {
    canonical_name?: unknown;
    similarity?: unknown;
    lot_id?: unknown;
    hint_surfaced?: unknown;
  };

  const matchSummaryByTxn = new Map<
    string,
    { match_method: string; match_confidence: string; review_required: boolean }
  >();
  const lotLabelById = new Map<string, string>();

  if (pageTxIds.length > 0) {
    const { data: matchRows } = await supabase
      .from("reconciliation_matches")
      .select(
        "bank_transaction_id, match_method, match_confidence, review_required, matched_at",
      )
      .in("bank_transaction_id", pageTxIds)
      .order("matched_at", { ascending: true });
    // Keep the FIRST allocation per transaction (orchestrator writes one
    // method/confidence per transaction; manual matches likewise).
    for (const m of matchRows ?? []) {
      if (!matchSummaryByTxn.has(m.bank_transaction_id)) {
        matchSummaryByTxn.set(m.bank_transaction_id, {
          match_method: m.match_method,
          match_confidence: m.match_confidence,
          review_required: !!m.review_required,
        });
      }
    }

    // Collect lot_ids referenced by any fuzzy_hint_metadata on this page,
    // then JOIN lots once.
    const hintLotIds = new Set<string>();
    for (const r of data ?? []) {
      const meta = r.fuzzy_hint_metadata as FuzzyHintMeta | null;
      if (meta && typeof meta.lot_id === "string") hintLotIds.add(meta.lot_id);
    }
    if (hintLotIds.size > 0) {
      const { data: lots } = await supabase
        .from("lots")
        .select("id, lot_number, unit_number")
        .in("id", Array.from(hintLotIds));
      for (const l of lots ?? []) {
        const label = l.unit_number
          ? `Lot ${l.lot_number} (Unit ${l.unit_number})`
          : `Lot ${l.lot_number}`;
        lotLabelById.set(l.id, label);
      }
    }
  }

  const rows: ReconciliationQueueRow[] = (data ?? []).map((r) => {
    const acct = accountMap.get(r.bank_account_id);
    const amount = Number(r.amount);
    const matched = Number(r.matched_total);
    const detectedReference = detectSingleLevyReference(r.description);

    const summary = matchSummaryByTxn.get(r.id);
    const matchSummary = summary
      ? {
          match_method: summary.match_method as ReconciliationMatchMethod,
          match_confidence: summary.match_confidence as MatchConfidence,
          review_required: summary.review_required,
        }
      : null;

    let fuzzyHint: ReconciliationQueueRow["fuzzy_hint"] = null;
    const meta = r.fuzzy_hint_metadata as FuzzyHintMeta | null;
    const hintLotId =
      meta && typeof meta.lot_id === "string" ? meta.lot_id : null;
    const hintCanonical =
      meta && typeof meta.canonical_name === "string"
        ? meta.canonical_name
        : null;
    const hintSimilarity =
      meta && typeof meta.similarity === "number" ? meta.similarity : null;
    if (
      meta &&
      meta.hint_surfaced === true &&
      hintLotId &&
      hintCanonical &&
      hintSimilarity !== null &&
      r.match_status === "unmatched"
    ) {
      fuzzyHint = {
        canonical_name: hintCanonical,
        similarity: hintSimilarity,
        lot_id: hintLotId,
        lot_label: lotLabelById.get(hintLotId) ?? `Lot ?`,
      };
    }

    return {
      id: r.id,
      bank_account_id: r.bank_account_id,
      bank_account_name: acct?.name ?? "",
      bank_account_fund_type: (acct?.fund_type ?? "administrative") as FundType,
      source: r.source as TransactionSource,
      transaction_date: r.transaction_date,
      amount,
      description: r.description,
      matched_total: matched,
      remaining: round2(amount - matched),
      match_status: r.match_status as MatchStatus,
      is_voided: !!r.is_voided,
      excluded_reason: r.excluded_reason,
      detected_reference: detectedReference,
      imported_at: r.imported_at,
      match_summary: matchSummary,
      fuzzy_hint: fuzzyHint,
      duplicate_status: (r.duplicate_status as DuplicateStatus | null) ?? null,
      duplicate_metadata: (r.duplicate_metadata as DuplicateMetadata | null) ?? null,
    };
  });

  // KPIs via separate, targeted aggregate queries so they're consistent even when the page is filtered.
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [unmatchedAgg, matchedAgg] = await Promise.all([
    supabase
      .from("bank_transactions")
      .select("amount, matched_total, transaction_date")
      .in("bank_account_id", accountIds)
      .eq("is_voided", false)
      .eq("match_status", "unmatched"),
    supabase
      .from("bank_transactions")
      .select("matched_total")
      .in("bank_account_id", accountIds)
      .eq("is_voided", false)
      .in("match_status", ["manually_matched", "auto_matched"])
      .gte("transaction_date", monthStart),
  ]);

  let unmatchedCount = 0;
  let unmatchedValue = 0;
  let oldest: string | null = null;
  for (const row of unmatchedAgg.data ?? []) {
    const remaining = round2(Number(row.amount) - Number(row.matched_total));
    if (remaining > 0) {
      unmatchedCount += 1;
      unmatchedValue += remaining;
      if (!oldest || row.transaction_date < oldest) oldest = row.transaction_date;
    }
  }
  const oldestUnmatchedDays = oldest ? daysBetween(oldest, new Date().toISOString().slice(0, 10)) : null;

  let matchedThisMonthValue = 0;
  for (const row of matchedAgg.data ?? []) {
    matchedThisMonthValue += Number(row.matched_total);
  }

  return {
    rows,
    total: count ?? rows.length,
    page,
    pageSize,
    unmatchedCount,
    unmatchedValue: round2(unmatchedValue),
    oldestUnmatchedDays,
    matchedThisMonthValue: round2(matchedThisMonthValue),
    availableSources,
    bankAccounts: bankAccountOptions,
  };
}

// ─── getOrchestratorAuditForTransaction ────────────────────────
//
// Returns the orchestrator's audit row for a single bank_transaction.
// audit_log.metadata is JSONB; PP4-D's MatchMetadataDrawer needs a typed
// payload, so we runtime-validate the JSONB shape and return null if it's
// malformed rather than crashing the drawer. The drawer renders a clean
// "no audit data available" empty state when null is returned.
const STRATEGY_NAMES = new Set([
  "reference",
  "bpay_crn",
  "known_payer",
  "keyword_amount",
  "amount_window",
  "fuzzy_hint",
] as const);

export interface OrchestratorAuditPayload {
  strategies_tried: Array<{
    strategy:
      | "reference"
      | "bpay_crn"
      | "known_payer"
      | "keyword_amount"
      | "amount_window"
      | "fuzzy_hint";
    outcome: string;
    details?: Record<string, unknown>;
  }>;
  matched_via:
    | "reference"
    | "bpay_crn"
    | "known_payer"
    | "keyword_amount"
    | "amount_window"
    | "fuzzy_hint"
    | null;
  hint_surfaced: boolean;
  evaluated_at: string;
}

function parseAuditMetadata(
  raw: unknown,
  createdAt: string,
): OrchestratorAuditPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.strategies_tried)) return null;
  const strategies: OrchestratorAuditPayload["strategies_tried"] = [];
  for (const s of obj.strategies_tried) {
    if (!s || typeof s !== "object") return null;
    const item = s as Record<string, unknown>;
    if (
      typeof item.strategy !== "string" ||
      !(STRATEGY_NAMES as Set<string>).has(item.strategy) ||
      typeof item.outcome !== "string"
    ) {
      return null;
    }
    strategies.push({
      strategy: item.strategy as OrchestratorAuditPayload["strategies_tried"][number]["strategy"],
      outcome: item.outcome,
      details:
        item.details && typeof item.details === "object"
          ? (item.details as Record<string, unknown>)
          : undefined,
    });
  }
  const matchedVia =
    typeof obj.matched_via === "string" &&
    (STRATEGY_NAMES as Set<string>).has(obj.matched_via)
      ? (obj.matched_via as OrchestratorAuditPayload["matched_via"])
      : null;
  const hintSurfaced = obj.hint_surfaced === true;
  return {
    strategies_tried: strategies,
    matched_via: matchedVia,
    hint_surfaced: hintSurfaced,
    evaluated_at: createdAt,
  };
}

export async function getOrchestratorAuditForTransaction(
  bankTransactionId: string,
): Promise<OrchestratorAuditPayload | null> {
  const supabase = createServerClient();

  // Resolve subdivision via the bank transaction → bank account → subdivision
  // chain, then enforce access. Audit_log rows are subdivision-scoped, so
  // RLS-equivalent check belongs here.
  const { data: bt } = await supabase
    .from("bank_transactions")
    .select("id, bank_account_id, bank_accounts!inner(subdivision_id)")
    .eq("id", bankTransactionId)
    .maybeSingle();
  if (!bt) return null;
  const subdivisionId = (
    bt as unknown as { bank_accounts: { subdivision_id: string } }
  ).bank_accounts.subdivision_id;
  await requireSubdivisionAccess(subdivisionId);

  const { data: audit } = await supabase
    .from("audit_log")
    .select("metadata, created_at")
    .eq("entity_type", "bank_transaction")
    .eq("entity_id", bankTransactionId)
    .eq("action", "reconciliation.auto_match_attempted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!audit) return null;

  return parseAuditMetadata(audit.metadata, audit.created_at as string);
}

export async function getUnmatchedCount(subdivisionId: string): Promise<number> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("subdivision_id", subdivisionId);

  const accountIds = (accounts ?? []).map((a) => a.id);
  if (accountIds.length === 0) return 0;

  const { count } = await supabase
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .in("bank_account_id", accountIds)
    .eq("is_voided", false)
    .eq("match_status", "unmatched");

  return count ?? 0;
}

export async function getBankTransactionDetail(
  bankTransactionId: string,
): Promise<BankTransactionDetail> {
  const supabase = createServerClient();

  const { data: bt, error: btErr } = await supabase
    .from("bank_transactions")
    .select(
      "id, bank_account_id, source, transaction_date, amount, description, balance, matched_total, match_status, is_voided, voided_at, voided_by, void_reason, excluded_reason, imported_at, duplicate_status, duplicate_metadata",
    )
    .eq("id", bankTransactionId)
    .single();
  if (btErr || !bt) throw new Error("Bank transaction not found");

  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, account_name, fund_type, subdivision_id")
    .eq("id", bt.bank_account_id)
    .single();
  if (!account) throw new Error("Bank account not found");

  await requireSubdivisionAccess(account.subdivision_id);

  const [{ data: matches }, { data: undeposited }] = await Promise.all([
    supabase
      .from("reconciliation_matches")
      .select(
        "id, ledger_entry_id, amount_matched, match_method, match_confidence, matched_at, matched_by, notes",
      )
      .eq("bank_transaction_id", bankTransactionId)
      .order("matched_at", { ascending: true }),
    supabase
      .from("undeposited_funds_entries")
      .select(
        "id, receipt_number, lot_id, amount, received_date, payment_method, cheque_number",
      )
      .eq("bank_account_id", bt.bank_account_id)
      .eq("status", "pending_deposit"),
  ]);

  const matchRows = matches ?? [];
  const ledgerIds = matchRows.map((m) => m.ledger_entry_id);

  let ledgerMap = new Map<
    string,
    { lot_id: string; fund_type: FundType; levy_notice_id: string | null }
  >();
  if (ledgerIds.length > 0) {
    const { data: ledgerRows } = await supabase
      .from("lot_ledger_entries")
      .select("id, lot_id, fund_type, levy_notice_id")
      .in("id", ledgerIds);
    ledgerMap = new Map(
      (ledgerRows ?? []).map((l) => [
        l.id,
        { lot_id: l.lot_id, fund_type: l.fund_type as FundType, levy_notice_id: l.levy_notice_id },
      ]),
    );
  }

  const lotIds = Array.from(
    new Set([
      ...Array.from(ledgerMap.values()).map((v) => v.lot_id),
      ...(undeposited ?? []).map((u) => u.lot_id),
    ]),
  );

  let lotMap = new Map<string, { lot_number: string; unit_number: string | null }>();
  if (lotIds.length > 0) {
    const { data: lotRows } = await supabase
      .from("lots")
      .select("id, lot_number, unit_number")
      .in("id", lotIds);
    lotMap = new Map(
      (lotRows ?? []).map((l) => [
        l.id,
        { lot_number: String(l.lot_number), unit_number: l.unit_number ?? null },
      ]),
    );
  }

  const noticeIds = Array.from(
    new Set(
      Array.from(ledgerMap.values())
        .map((v) => v.levy_notice_id)
        .filter((x): x is string => !!x),
    ),
  );
  let noticeMap = new Map<string, string>();
  if (noticeIds.length > 0) {
    const { data: noticeRows } = await supabase
      .from("levy_notices")
      .select("id, reference_number")
      .in("id", noticeIds);
    noticeMap = new Map((noticeRows ?? []).map((n) => [n.id, n.reference_number]));
  }

  const amount = Number(bt.amount);
  const matchedTotal = Number(bt.matched_total);
  const detectedReference = detectSingleLevyReference(bt.description);

  return {
    id: bt.id,
    bank_account_id: bt.bank_account_id,
    bank_account_name: account.account_name,
    bank_account_fund_type: account.fund_type as FundType,
    subdivision_id: account.subdivision_id,
    source: bt.source as TransactionSource,
    transaction_date: bt.transaction_date,
    amount,
    description: bt.description,
    balance: bt.balance !== null ? Number(bt.balance) : null,
    match_status: bt.match_status as MatchStatus,
    matched_total: matchedTotal,
    remaining: round2(amount - matchedTotal),
    is_voided: !!bt.is_voided,
    voided_at: bt.voided_at,
    voided_by: bt.voided_by,
    void_reason: bt.void_reason,
    excluded_reason: bt.excluded_reason,
    detected_reference: detectedReference,
    imported_at: bt.imported_at,
    duplicate_status: (bt.duplicate_status as DuplicateStatus | null) ?? null,
    duplicate_metadata: (bt.duplicate_metadata as DuplicateMetadata | null) ?? null,
    matches: matchRows.map((m) => {
      const led = ledgerMap.get(m.ledger_entry_id);
      const lot = led ? lotMap.get(led.lot_id) : undefined;
      return {
        id: m.id,
        ledger_entry_id: m.ledger_entry_id,
        lot_id: led?.lot_id ?? "",
        lot_number: lot?.lot_number ?? "",
        unit_number: lot?.unit_number ?? null,
        fund_type: led?.fund_type ?? "administrative",
        amount_matched: Number(m.amount_matched),
        match_method: m.match_method,
        match_confidence: m.match_confidence,
        matched_at: m.matched_at,
        matched_by: m.matched_by,
        notes: m.notes,
        levy_notice_id: led?.levy_notice_id ?? null,
        levy_reference: led?.levy_notice_id ? noticeMap.get(led.levy_notice_id) ?? null : null,
      };
    }),
    undeposited_candidates: (undeposited ?? []).map((u) => ({
      id: u.id,
      receipt_number: u.receipt_number,
      lot_id: u.lot_id,
      lot_number: lotMap.get(u.lot_id)?.lot_number ?? "",
      amount: Number(u.amount),
      received_date: u.received_date,
      payment_method: u.payment_method as "cash" | "cheque",
      cheque_number: u.cheque_number,
    })),
  };
}

export async function getUndepositedEntries(
  subdivisionId: string,
  bankAccountId?: string | null,
): Promise<UndepositedFundsEntry[]> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  let q = supabase
    .from("undeposited_funds_entries")
    .select(
      "id, subdivision_id, lot_id, bank_account_id, fund_type, amount, received_date, payment_method, cheque_number, receipt_number, description, status, deposited_at, deposited_by_bank_transaction_id, linked_ledger_credit_id, created_at",
    )
    .eq("subdivision_id", subdivisionId)
    .eq("status", "pending_deposit")
    .order("received_date", { ascending: true });

  if (bankAccountId) q = q.eq("bank_account_id", bankAccountId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const lotIds = Array.from(new Set(rows.map((r) => r.lot_id)));
  let lotMap = new Map<string, { lot_number: string; unit_number: string | null }>();
  if (lotIds.length > 0) {
    const { data: lots } = await supabase
      .from("lots")
      .select("id, lot_number, unit_number")
      .in("id", lotIds);
    lotMap = new Map(
      (lots ?? []).map((l) => [
        l.id,
        { lot_number: String(l.lot_number), unit_number: l.unit_number ?? null },
      ]),
    );
  }

  return rows.map((r) => ({
    id: r.id,
    subdivision_id: r.subdivision_id,
    lot_id: r.lot_id,
    lot_number: lotMap.get(r.lot_id)?.lot_number ?? "",
    unit_number: lotMap.get(r.lot_id)?.unit_number ?? null,
    bank_account_id: r.bank_account_id,
    fund_type: r.fund_type as FundType,
    amount: Number(r.amount),
    received_date: r.received_date,
    payment_method: r.payment_method as "cash" | "cheque",
    cheque_number: r.cheque_number,
    receipt_number: r.receipt_number,
    description: r.description,
    status: r.status as "pending_deposit" | "deposited" | "voided",
    deposited_at: r.deposited_at,
    deposited_by_bank_transaction_id: r.deposited_by_bank_transaction_id,
    linked_ledger_credit_id: r.linked_ledger_credit_id,
    created_at: r.created_at,
  }));
}

export async function getSubdivisionLotsForAllocation(
  subdivisionId: string,
): Promise<
  Array<{
    id: string;
    lot_number: string;
    unit_number: string | null;
    owner_display_name: string | null;
    owner_status: "member" | "pending_invitation" | "unowned";
    outstanding_levies: Array<{
      id: string;
      reference_number: string;
      amount_outstanding: number;
    }>;
  }>
> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Get all lots in the subdivision
  const { data: lots, error: lotsErr } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, subdivision_id")
    .eq("subdivision_id", subdivisionId)
    .order("lot_number", { ascending: true });

  if (lotsErr || !lots) throw new Error("Failed to fetch lots");

  const lotIds = lots.map((l) => l.id);

  // Get lot owners (members + pending invitations)
  const { data: members } = await supabase
    .from("subdivision_members")
    .select("lot_id, profile_id, profiles!inner(id, first_name, last_name)")
    .in("lot_id", lotIds)
    .eq("role", "lot_owner")
    .is("left_at", null);

  const memberMap = new Map<
    string,
    { owner_display_name: string | null; owner_status: "member" }
  >();
  for (const m of members ?? []) {
    if (!m.lot_id) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = (m as any).profiles;
    const name = [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    memberMap.set(m.lot_id, {
      owner_display_name: name || null,
      owner_status: "member",
    });
  }

  const lotsStillUnowned = lotIds.filter((id) => !memberMap.has(id));
  const inviteMap = new Map<
    string,
    { owner_display_name: string | null; owner_status: "pending_invitation" }
  >();
  if (lotsStillUnowned.length > 0) {
    const { data: invites } = await supabase
      .from("invitations")
      .select("id, lot_id, name, created_at")
      .in("lot_id", lotsStillUnowned)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    for (const inv of invites ?? []) {
      if (!inviteMap.has(inv.lot_id)) {
        inviteMap.set(inv.lot_id, {
          owner_display_name: inv.name ?? null,
          owner_status: "pending_invitation",
        });
      }
    }
  }

  // Get outstanding levy notices per lot
  const { data: notices } = await supabase
    .from("levy_notices")
    .select(
      "id, lot_id, reference_number, amount_due, amount_paid, levy_batch_id, status"
    )
    .in("lot_id", lotIds)
    .in("status", ["issued", "overdue", "partially_paid"]);

  const ledgerMap = new Map<
    string,
    { paid: number; due: number }
  >();
  for (const notice of notices ?? []) {
    if (!ledgerMap.has(notice.lot_id)) {
      ledgerMap.set(notice.lot_id, { paid: 0, due: 0 });
    }
    const stats = ledgerMap.get(notice.lot_id)!;
    stats.due += Number(notice.amount_due);
    stats.paid += Number(notice.amount_paid);
  }

  const noticeIds = (notices ?? []).map((n) => n.id);
  const noticeAmountMap = new Map<string, number>();
  if (noticeIds.length > 0) {
    const { data: ledgerCredits } = await supabase
      .from("lot_ledger_entries")
      .select("levy_notice_id, amount")
      .in("levy_notice_id", noticeIds)
      .eq("entry_type", "credit");

    for (const credit of ledgerCredits ?? []) {
      if (!credit.levy_notice_id) continue;
      const current = noticeAmountMap.get(credit.levy_notice_id) ?? 0;
      noticeAmountMap.set(credit.levy_notice_id, current + Number(credit.amount));
    }
  }

  return lots.map((lot) => {
    const owner = memberMap.get(lot.id) || inviteMap.get(lot.id) || {
      owner_display_name: null,
      owner_status: "unowned" as const,
    };

    const lotNotices = (notices ?? []).filter((n) => n.lot_id === lot.id);
    const outstanding_levies = lotNotices
      .map((notice) => {
        const amountPaid = noticeAmountMap.get(notice.id) ?? 0;
        const amountOutstanding = round2(
          Number(notice.amount_due) - amountPaid
        );
        return {
          id: notice.id,
          reference_number: notice.reference_number,
          amount_outstanding: amountOutstanding,
        };
      })
      .filter((l) => l.amount_outstanding > 0)
      .sort((a, b) => a.reference_number.localeCompare(b.reference_number));

    return {
      id: lot.id,
      lot_number: String(lot.lot_number),
      unit_number: lot.unit_number ?? null,
      owner_display_name: owner.owner_display_name,
      owner_status: owner.owner_status,
      outstanding_levies,
    };
  });
}

// ============================================================================
// MUTATIONS
// ============================================================================

export async function addManualBankTransaction(
  input: AddManualBankTransactionInput,
): Promise<{
  success?: {
    bankTransactionId: string;
    autoMatched: boolean;
    matchedRef: string | null;
    /** PP5-A: set when the bank-side detector flagged this row as a
     *  suspected cross-source duplicate. Auto-match was skipped. */
    duplicateSuspected: boolean;
  };
  error?: string;
}> {
  const parsed = addManualBankTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, subdivision_id")
    .eq("id", parsed.data.bank_account_id)
    .single();
  if (!account || account.subdivision_id !== parsed.data.subdivision_id) {
    return { error: "Bank account not found" };
  }

  const signedAmount =
    parsed.data.direction === "credit" ? Math.abs(parsed.data.amount) : -Math.abs(parsed.data.amount);

  const explicitReference = normaliseReference(parsed.data.reference);
  const baseDescription = parsed.data.description?.trim() ?? "";
  const descriptionWithRef =
    explicitReference && !baseDescription.toUpperCase().includes(explicitReference)
      ? [baseDescription, explicitReference].filter(Boolean).join(" ").trim()
      : baseDescription;

  const { data: inserted, error: insErr } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: account.id,
      source: "manual",
      transaction_date: parsed.data.transaction_date,
      amount: signedAmount,
      description: descriptionWithRef,
      match_status: "unmatched",
    })
    .select("id")
    .single();
  if (insErr || !inserted) return { error: insErr?.message ?? "Insert failed" };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: parsed.data.subdivision_id,
    action: "bank_transaction.added_manually",
    entity_type: "bank_transaction",
    entity_id: inserted.id,
    after_state: {
      bank_account_id: account.id,
      transaction_date: parsed.data.transaction_date,
      amount: signedAmount,
      description: descriptionWithRef,
    },
  });

  // PP5-A: cross-source duplicate detection. Runs before tryAutoMatch so a
  // flagged row never gets allocated.
  const detection = await detectDuplicate(
    {
      id: inserted.id,
      bank_account_id: account.id,
      transaction_date: parsed.data.transaction_date,
      amount: signedAmount,
      description: descriptionWithRef,
      source: "manual",
    },
    supabase,
  );
  let duplicateSuspected = false;
  if (detection.flagged) {
    const marked = await markDuplicate({
      bank_transaction_id: inserted.id,
      subdivision_id: parsed.data.subdivision_id,
      duplicate_of: detection.duplicate_of,
      metadata: detection.metadata,
      performedBy: profile.id,
      supabase,
    });
    if (marked.ok) {
      duplicateSuspected = true;
    } else {
      // PP5-A ratification: row stays unmatched + unmarked; UI does NOT
      // claim duplicate (DB doesn't reflect it). Logged for Sentry.
      console.error(
        `[duplicate-detection] markDuplicate failed`,
        {
          bank_transaction_id: inserted.id,
          subdivision_id: parsed.data.subdivision_id,
          duplicate_of: detection.duplicate_of,
          error: marked.error,
        },
      );
    }
  }

  let autoMatched = false;
  let matchedRef: string | null = null;
  // PP5-A ratification: skip tryAutoMatch when detection fired, regardless
  // of mark outcome. Don't compound a DB issue with allocation work.
  if (!detection.flagged && signedAmount > 0) {
    const result = await tryAutoMatch({
      bankTransactionId: inserted.id,
      subdivisionId: parsed.data.subdivision_id,
      bankAccountId: account.id,
      description: descriptionWithRef,
      amount: signedAmount,
      transactionDate: parsed.data.transaction_date,
      performedBy: profile.id,
    });
    autoMatched = result.matched;
    matchedRef = result.reference;
  }

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/bank-account", "page");
  return {
    success: {
      bankTransactionId: inserted.id,
      autoMatched,
      matchedRef,
      duplicateSuspected,
    },
  };
}

// ============================================================================
// PP5-A: duplicate review (manager-side)
// ----------------------------------------------------------------------------
// Two server actions move a `bank_transactions.duplicate_status='suspected'`
// row to a terminal state:
//   - confirmDuplicate:  status -> 'confirmed' (excludes from ledger; orchestrator
//                        early-outs forever).
//   - rejectDuplicate:   status -> 'rejected' (legitimate, run auto-match
//                        retroactively).
//
// confirmDuplicate's MATCH_ACTIVE guard returns a structured `errorCode` so
// the UI can dispatch on it (avoids fragile string matching on `error`).
// match_status × duplicate_status remain orthogonal — confirm does NOT
// touch match_status (CONTEXT.md PP5 §Duplicates).
// ============================================================================

export type DuplicateReviewErrorCode =
  | "NOT_FOUND"
  | "NOT_SUSPECTED"
  | "MATCH_ACTIVE"
  | "FORBIDDEN";

export type ConfirmDuplicateResult = {
  success?: { confirmed: true };
  error?: string;
  errorCode?: DuplicateReviewErrorCode;
};

export type RejectDuplicateResult = {
  success?: {
    rejected: true;
    /** PP5-A Q3 resolution: rejectDuplicate re-runs tryAutoMatch on the row.
     *  Outcome surfaced so the UI can toast match-vs-no-match. Null when
     *  the row is a debit (auto-match never runs on debits). */
    matchOutcome: {
      matched: boolean;
      strategy: string | null;
      reference: string | null;
      partial: boolean;
      allocatedAmount: number;
      warning: string | null;
    } | null;
  };
  error?: string;
  errorCode?: DuplicateReviewErrorCode;
};

export async function confirmDuplicate(
  input: DuplicateReviewInput,
): Promise<ConfirmDuplicateResult> {
  const parsed = duplicateReviewSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data: row } = await supabase
    .from("bank_transactions")
    .select(
      "id, duplicate_status, match_status, matched_total, bank_accounts!inner(subdivision_id)",
    )
    .eq("id", parsed.data.bank_transaction_id)
    .maybeSingle();
  if (!row) {
    return { error: "Transaction not found", errorCode: "NOT_FOUND" };
  }

  const r = row as unknown as {
    id: string;
    duplicate_status: "suspected" | "confirmed" | "rejected" | null;
    match_status: MatchStatus;
    matched_total: number | string;
    bank_accounts: { subdivision_id: string };
  };

  if (r.bank_accounts.subdivision_id !== parsed.data.subdivision_id) {
    return { error: "Transaction not found", errorCode: "FORBIDDEN" };
  }

  if (r.duplicate_status !== "suspected") {
    return {
      error: "Transaction is not flagged as a suspected duplicate",
      errorCode: "NOT_SUSPECTED",
    };
  }

  if (
    r.match_status === "auto_matched" ||
    r.match_status === "manually_matched" ||
    Number(r.matched_total) > 0
  ) {
    return {
      error:
        "Transaction is currently allocated. Undo the match first, then mark as duplicate.",
      errorCode: "MATCH_ACTIVE",
    };
  }

  const { error: updErr } = await supabase
    .from("bank_transactions")
    .update({ duplicate_status: "confirmed" })
    .eq("id", parsed.data.bank_transaction_id);
  if (updErr) return { error: updErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: parsed.data.subdivision_id,
    action: "bank_transaction.duplicate_confirmed",
    entity_type: "bank_transaction",
    entity_id: parsed.data.bank_transaction_id,
    before_state: { duplicate_status: "suspected" },
    after_state: { duplicate_status: "confirmed" },
    metadata: parsed.data.notes ? { notes: parsed.data.notes } : null,
  });

  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/bank-account", "page");
  return { success: { confirmed: true } };
}

export async function rejectDuplicate(
  input: DuplicateReviewInput,
): Promise<RejectDuplicateResult> {
  const parsed = duplicateReviewSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data: row } = await supabase
    .from("bank_transactions")
    .select(
      "id, bank_account_id, transaction_date, amount, description, duplicate_status, bank_accounts!inner(subdivision_id)",
    )
    .eq("id", parsed.data.bank_transaction_id)
    .maybeSingle();
  if (!row) {
    return { error: "Transaction not found", errorCode: "NOT_FOUND" };
  }

  const r = row as unknown as {
    id: string;
    bank_account_id: string;
    transaction_date: string;
    amount: number | string;
    description: string | null;
    duplicate_status: "suspected" | "confirmed" | "rejected" | null;
    bank_accounts: { subdivision_id: string };
  };

  if (r.bank_accounts.subdivision_id !== parsed.data.subdivision_id) {
    return { error: "Transaction not found", errorCode: "FORBIDDEN" };
  }

  if (r.duplicate_status !== "suspected") {
    return {
      error: "Transaction is not flagged as a suspected duplicate",
      errorCode: "NOT_SUSPECTED",
    };
  }

  const { error: updErr } = await supabase
    .from("bank_transactions")
    .update({ duplicate_status: "rejected" })
    .eq("id", parsed.data.bank_transaction_id);
  if (updErr) return { error: updErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: parsed.data.subdivision_id,
    action: "bank_transaction.duplicate_rejected",
    entity_type: "bank_transaction",
    entity_id: parsed.data.bank_transaction_id,
    before_state: { duplicate_status: "suspected" },
    after_state: { duplicate_status: "rejected" },
    metadata: parsed.data.notes ? { notes: parsed.data.notes } : null,
  });

  // PP5-A Q3: re-run tryAutoMatch retroactively. Skips internally for
  // debits (amount <= 0) — caller surfaces matchOutcome=null in that case.
  const amount = Number(r.amount);
  type MatchOutcomeShape = NonNullable<RejectDuplicateResult["success"]>["matchOutcome"];
  let matchOutcome: MatchOutcomeShape = null;
  if (amount > 0) {
    const result = await tryAutoMatch({
      bankTransactionId: parsed.data.bank_transaction_id,
      subdivisionId: parsed.data.subdivision_id,
      bankAccountId: r.bank_account_id,
      description: r.description ?? "",
      amount,
      transactionDate: r.transaction_date,
      performedBy: profile.id,
    });
    matchOutcome = {
      matched: result.matched,
      strategy: result.strategy,
      reference: result.reference,
      partial: result.partial,
      allocatedAmount: result.allocatedAmount,
      warning: result.warning,
    };
  }

  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/bank-account", "page");
  return { success: { rejected: true, matchOutcome } };
}

// ============================================================================
// PP5-B: ledger-side duplicate review (manager-side)
// ----------------------------------------------------------------------------
// Symmetric verb pair on a 'suspected' lot_ledger_entry:
//   - voidAsLedgerDuplicate: status -> 'confirmed'; rpc_ledger_void creates
//                            offsetting void_offset entry; balance restored.
//   - keepAsOverpayment:     status -> 'rejected'; entry stays active;
//                            balance reflects overpayment.
//
// duplicate_status x lot_ledger_entries.status remain orthogonal — the void
// path goes through rpc_ledger_void (existing PP1 contract), not via direct
// status mutation. The status='active' guard here is a pre-flight check;
// rpc_ledger_void itself raises if the entry is already voided through some
// other path.
// ============================================================================

export type LedgerDuplicateReviewErrorCode =
  | "NOT_FOUND"
  | "NOT_SUSPECTED"
  | "ALREADY_VOIDED"
  | "FORBIDDEN"
  /** PP5-B: credit is linked to >1 bank tx via partial-allocation
   *  matches. Currently impossible via any normal MSM flow but allowed
   *  by the UNIQUE(bank_transaction_id, ledger_entry_id) constraint
   *  (which only blocks same-pair duplicates). Hard-erroring keeps
   *  financial state writes inside the RPC contracts and surfaces any
   *  future architectural shift loudly. Manual investigation required. */
  | "MULTI_LINKED";

export type VoidAsLedgerDuplicateResult = {
  success?: {
    voided: true;
    void_offset_id: string;
    /** PP5-B Path B: bank txs whose match was cascaded as part of the
     *  void. Empty when the credit was unlinked (e.g. cash-receipt path).
     *  UI can use this to render "Voided as duplicate; unmatched from N
     *  bank transactions." Length > 1 only in the rare case that a single
     *  credit was matched against multiple bank txs via partial alloc. */
    unmatched_bank_tx_ids: string[];
  };
  error?: string;
  errorCode?: LedgerDuplicateReviewErrorCode;
};

export type KeepAsOverpaymentResult = {
  success?: { kept: true };
  error?: string;
  errorCode?: LedgerDuplicateReviewErrorCode;
};

export async function voidAsLedgerDuplicate(
  input: LedgerDuplicateReviewInput,
): Promise<VoidAsLedgerDuplicateResult> {
  const parsed = ledgerDuplicateReviewSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data: entry } = await supabase
    .from("lot_ledger_entries")
    .select("id, subdivision_id, status, duplicate_status")
    .eq("id", parsed.data.lot_ledger_entry_id)
    .maybeSingle();
  if (!entry) {
    return { error: "Ledger entry not found", errorCode: "NOT_FOUND" };
  }
  const e = entry as {
    id: string;
    subdivision_id: string;
    status: "active" | "voided";
    duplicate_status: "suspected" | "confirmed" | "rejected" | null;
  };

  if (e.subdivision_id !== parsed.data.subdivision_id) {
    return { error: "Ledger entry not found", errorCode: "FORBIDDEN" };
  }
  if (e.duplicate_status !== "suspected") {
    return {
      error: "Entry is not flagged as a suspected duplicate",
      errorCode: "NOT_SUSPECTED",
    };
  }
  if (e.status !== "active") {
    return {
      error: "Entry has already been voided through another path",
      errorCode: "ALREADY_VOIDED",
    };
  }

  const reasonNotes = parsed.data.notes?.trim();
  const voidReason = reasonNotes
    ? `Confirmed as duplicate: ${reasonNotes}`
    : "Confirmed as duplicate";

  // PP5-B Path B: route through rpc_unmatch_bank_transaction when the credit
  // is linked to bank txs (cascades match deletion + matched_total/
  // match_status update + ledger void). Fall back to rpc_ledger_void when
  // the credit is unlinked (e.g. cash-receipt-pending-deposit path).
  const { data: matches } = await supabase
    .from("reconciliation_matches")
    .select("id, bank_transaction_id")
    .eq("ledger_entry_id", parsed.data.lot_ledger_entry_id);
  const matchRows = (matches ?? []) as Array<{ id: string; bank_transaction_id: string }>;

  let voidOffsetId: string;
  const unmatchedBankTxIds: string[] = [];

  if (matchRows.length === 0) {
    // Unlinked credit — direct rpc_ledger_void.
    const { data: voidData, error: voidErr } = await supabase.rpc("rpc_ledger_void", {
      p_entry_id: parsed.data.lot_ledger_entry_id,
      p_reason: voidReason,
      p_voided_by: profile.id,
    });
    if (voidErr) return { error: voidErr.message };
    voidOffsetId = voidData as string;
  } else {
    // Linked credit. Pre-check for the multi-link case (>1 distinct bank tx)
    // BEFORE any mutating RPC. Currently impossible via any normal MSM flow
    // but the UNIQUE(bank_transaction_id, ledger_entry_id) constraint only
    // blocks same-pair duplicates, so the state is allowable at the DB
    // level. Hard-erroring keeps financial-state writes inside RPC
    // contracts (no direct UPDATE bypassing rpc_unmatch_bank_transaction)
    // and surfaces any future architectural shift loudly.
    const distinctBankTxIds = new Set(matchRows.map((m) => m.bank_transaction_id));
    if (distinctBankTxIds.size > 1) {
      return {
        error: "Credit linked to multiple bank transactions — manual investigation required",
        errorCode: "MULTI_LINKED",
      };
    }

    // Single bank tx — UNIQUE constraint guarantees one match between this
    // (bank_tx, credit) pair, so matchIds will have length 1 in practice;
    // we pass the array anyway since rpc_unmatch_bank_transaction's contract
    // is array-typed.
    const bankTxId = matchRows[0].bank_transaction_id;
    const matchIds = matchRows.map((m) => m.id);
    const { error: unmatchErr } = await supabase.rpc("rpc_unmatch_bank_transaction", {
      p_bank_transaction_id: bankTxId,
      p_match_ids: matchIds,
      p_reason: voidReason,
      p_performed_by: profile.id,
    });
    if (unmatchErr) return { error: unmatchErr.message };
    unmatchedBankTxIds.push(bankTxId);

    // Locate the void_offset row created by rpc_ledger_void during the
    // cascade. No DB-level UNIQUE on voids_entry_id, so order by created_at
    // desc + limit(1) for defensiveness even though the RPC's
    // already-voided guard makes multi-offset impossible in practice.
    const { data: offsetRows } = await supabase
      .from("lot_ledger_entries")
      .select("id")
      .eq("voids_entry_id", parsed.data.lot_ledger_entry_id)
      .order("created_at", { ascending: false })
      .limit(1);
    const offsetRow = (offsetRows ?? [])[0] as { id: string } | undefined;
    if (!offsetRow) {
      return { error: "void_offset row not found after cascade — unexpected state" };
    }
    voidOffsetId = offsetRow.id;
  }

  const { error: updErr } = await supabase
    .from("lot_ledger_entries")
    .update({ duplicate_status: "confirmed" })
    .eq("id", parsed.data.lot_ledger_entry_id);
  if (updErr) return { error: updErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: parsed.data.subdivision_id,
    action: "lot_ledger_entry.duplicate_voided",
    entity_type: "lot_ledger_entry",
    entity_id: parsed.data.lot_ledger_entry_id,
    before_state: { duplicate_status: "suspected", status: "active" },
    after_state: { duplicate_status: "confirmed", status: "voided" },
    metadata: {
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
      void_offset_id: voidOffsetId,
      unmatched_bank_tx_ids: unmatchedBankTxIds,
    },
  });

  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/bank-account", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/lots/[lotId]", "page");
  return {
    success: {
      voided: true,
      void_offset_id: voidOffsetId,
      unmatched_bank_tx_ids: unmatchedBankTxIds,
    },
  };
}

export async function keepAsOverpayment(
  input: LedgerDuplicateReviewInput,
): Promise<KeepAsOverpaymentResult> {
  const parsed = ledgerDuplicateReviewSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data: entry } = await supabase
    .from("lot_ledger_entries")
    .select("id, subdivision_id, duplicate_status")
    .eq("id", parsed.data.lot_ledger_entry_id)
    .maybeSingle();
  if (!entry) {
    return { error: "Ledger entry not found", errorCode: "NOT_FOUND" };
  }
  const e = entry as {
    id: string;
    subdivision_id: string;
    duplicate_status: "suspected" | "confirmed" | "rejected" | null;
  };

  if (e.subdivision_id !== parsed.data.subdivision_id) {
    return { error: "Ledger entry not found", errorCode: "FORBIDDEN" };
  }
  if (e.duplicate_status !== "suspected") {
    return {
      error: "Entry is not flagged as a suspected duplicate",
      errorCode: "NOT_SUSPECTED",
    };
  }

  const { error: updErr } = await supabase
    .from("lot_ledger_entries")
    .update({ duplicate_status: "rejected" })
    .eq("id", parsed.data.lot_ledger_entry_id);
  if (updErr) return { error: updErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: parsed.data.subdivision_id,
    action: "lot_ledger_entry.duplicate_kept_as_overpayment",
    entity_type: "lot_ledger_entry",
    entity_id: parsed.data.lot_ledger_entry_id,
    before_state: { duplicate_status: "suspected" },
    after_state: { duplicate_status: "rejected" },
    metadata: parsed.data.notes ? { notes: parsed.data.notes } : null,
  });

  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/lots/[lotId]", "page");
  return { success: { kept: true } };
}

/** Payload for the three-way `CollisionResolutionDialog`. Both
 *  reconcileTransaction (PP4-B/C) and reactivateMappingAction (PP4-D) emit
 *  this shape — the dialog is flow-agnostic. Lot labels are resolved
 *  server-side in a single round-trip per call. */
export interface MappingCollisionPayload {
  canonical_sender_name: string;
  proposed_lot_id: string;
  proposed_lot_label: string;
  colliding_mappings: Array<{
    id: string;
    lot_id: string;
    lot_label: string;
    previous_status: MappingStatus;
    current_status: MappingStatus;
  }>;
}

interface MappingResolutionRacePayload {
  divergence_type:
    | "mapping_changed"
    | "mapping_deleted"
    | "new_active_mapping_appeared";
  details: { expected: string[]; current: string[] };
}

export interface ProposalFlagPayload {
  canonical_sender_name: string;
  lot_id: string;
  /** Human-readable lot label resolved server-side ("Lot 7" or
   *  "Lot 7 (Unit 12)"). The toast on match-detail-content.tsx renders this
   *  directly — the lot_id UUID is meaningless to the manager. */
  lot_label: string;
  manual_match_count: number;
}

export type ReconcileTransactionResult = {
  success?: {
    createdCreditIds: string[];
    matchIds: string[];
    remaining: number;
    flags: string[];
    /** PP4-B: collision detected during the "remember this payer" flow.
     * UI must surface the three-way dialog and call resolvePayerMappingCollision
     * (a separate server action — PP4-C split). */
    mappingCollision?: MappingCollisionPayload;
    /** PP4-B: detectRepeatedManualMatch returned proposal_flag=true.
     * UI surfaces an inline "Create mapping?" toast (per Gap 11 resolution). */
    proposalFlag?: ProposalFlagPayload;
    /** PP4-B: indicates a mapping was created or re-activated as part of this match. */
    mappingId?: string;
  };
  error?: string;
};

export type ResolvePayerMappingCollisionResult = {
  success?: {
    /** Set when the resolution was applied successfully. */
    resolution_applied?: "update" | "keep_existing" | "remove";
    /** Set when 'update' resolution created a new mapping. Null otherwise. */
    mapping_id?: string | null;
    /** PP4-C: race detected on resubmit (see Gap G). When set, resolution
     * was NOT applied; the UI must re-fetch the current collision state. */
    race?: MappingResolutionRacePayload;
  };
  error?: string;
};

export async function reconcileTransaction(
  input: ReconcileTransactionInput,
): Promise<ReconcileTransactionResult> {
  const parsed = reconcileTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const allocations = parsed.data.allocations.map((a) => ({
    lot_id: a.lot_id,
    fund_type: a.fund_type,
    amount: a.amount,
    levy_notice_id: a.levy_notice_id ?? null,
    reference: a.reference ?? null,
  }));

  const { data, error } = await supabase.rpc("rpc_reconcile_bank_transaction", {
    p_bank_transaction_id: parsed.data.bank_transaction_id,
    p_allocations: allocations,
    p_match_method: parsed.data.match_method,
    p_match_confidence: parsed.data.match_confidence,
    p_notes: parsed.data.notes ?? null,
    p_performed_by: profile.id,
  });

  if (error) return { error: error.message };

  const payload = (data ?? {}) as {
    created_credit_ids?: string[];
    match_ids?: string[];
    remaining_unmatched?: number | string;
    flags?: string[];
  };

  // PP5-B: ledger-side duplicate detection on each created credit.
  // Mirrors the orchestrator integration; flagged credits get
  // duplicate_status='suspected' for manager review.
  if ((payload.created_credit_ids ?? []).length > 0) {
    await detectAndMarkLedgerDuplicates({
      creditIds: payload.created_credit_ids ?? [],
      subdivisionId: parsed.data.subdivision_id,
      performedBy: profile.id,
      supabase,
    });
  }

  // PP4-B: post-match "remember this payer" wiring.
  let mappingCollision: MappingCollisionPayload | undefined = undefined;
  let proposalFlag: ProposalFlagPayload | undefined = undefined;
  let mappingId: string | undefined = undefined;

  // Single-lot allocation only (Gap C: multi-lot match → silent skip with audit).
  const distinctLotIds = Array.from(new Set(parsed.data.allocations.map((a) => a.lot_id)));
  const isSingleLot = distinctLotIds.length === 1;
  const singleLotId = isSingleLot ? distinctLotIds[0] : null;

  // Fetch description for canonicalisation.
  const { data: bt } = await supabase
    .from("bank_transactions")
    .select("description")
    .eq("id", parsed.data.bank_transaction_id)
    .single();
  const canonical = canonicaliseSender(bt?.description ?? null);

  // ── Branch: first-call "remember this payer" ─────────────────────────────
  // Note: PP4-C split out collision resolution into resolvePayerMappingCollision.
  // This action only handles the FIRST call (commit the match + optionally
  // create the mapping or detect a collision). The UI's three-way dialog
  // re-submits the resolution via the dedicated action.
  if (parsed.data.remember_payer && canonical) {
    if (!isSingleLot || !singleLotId) {
      // Gap C: multi-lot match → silent skip with audit.
      await supabase.from("audit_log").insert({
        profile_id: profile.id,
        subdivision_id: parsed.data.subdivision_id,
        action: "bank_payer_mapping.skipped_multi_lot",
        entity_type: "bank_transaction",
        entity_id: parsed.data.bank_transaction_id,
        metadata: {
          canonical_sender_name: canonical,
          lot_count: distinctLotIds.length,
        },
      });
    } else {
      const result: CreateMappingResult = await createBankPayerMapping({
        subdivision_id: parsed.data.subdivision_id,
        canonical_sender_name: canonical,
        lot_id: singleLotId,
        raw_example: bt?.description ?? undefined,
        created_by: profile.id,
      });
      if (result.ok) {
        mappingId = result.mapping_id;
        // PP4-B Flag 2: surface re-activation as a manual-match-context audit
        // so post-hoc debugging can answer "when did this mapping reactivate?"
        // mappings.ts itself audits the reactivation event; this entry adds
        // the manual-match linkage for greppability.
        if (result.was_reactivated) {
          await supabase.from("audit_log").insert({
            profile_id: profile.id,
            subdivision_id: parsed.data.subdivision_id,
            action: "reconciliation.mapping_reactivated_during_match",
            entity_type: "bank_transaction",
            entity_id: parsed.data.bank_transaction_id,
            metadata: {
              mapping_id: result.mapping_id,
              canonical_sender_name: canonical,
              lot_id: singleLotId,
              note: "Existing disabled/ambiguous mapping re-activated as part of this manual match",
            },
          });
        }
      } else {
        // Collision detected — surface the three-way dialog payload, with
        // lot labels resolved server-side so the dialog can render
        // "Lot N (Unit X)" without per-row lookups.
        mappingCollision = await buildCollisionPayload(
          parsed.data.subdivision_id,
          result.proposed.lot_id,
          result.proposed.canonical_sender_name,
          result.colliding_mappings,
        );
      }
    }
  }
  // ── Branch: detectRepeatedManualMatch (only when not creating a mapping) ──
  // Triggers when remember_payer was false (manager unchecked) AND this match
  // is the 3rd manual match for this canonical+lot in 30d → propose mapping.
  if (
    !parsed.data.remember_payer &&
    canonical &&
    isSingleLot &&
    singleLotId &&
    parsed.data.match_method === "manual"
  ) {
    const detection = await detectRepeatedManualMatch(
      parsed.data.subdivision_id,
      canonical,
      singleLotId,
      canonicaliseSender,
    );
    if (detection.proposal_flag) {
      // Resolve human-readable lot label so the toast doesn't show a UUID slice.
      const { data: lotRow } = await supabase
        .from("lots")
        .select("lot_number, unit_number")
        .eq("id", singleLotId)
        .maybeSingle();
      const lotLabel = lotRow
        ? lotRow.unit_number
          ? `Lot ${lotRow.lot_number} (Unit ${lotRow.unit_number})`
          : `Lot ${lotRow.lot_number}`
        : "Lot ?";
      proposalFlag = {
        canonical_sender_name: canonical,
        lot_id: singleLotId,
        lot_label: lotLabel,
        manual_match_count: detection.count,
      };
    }
  }

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");

  return {
    success: {
      createdCreditIds: payload.created_credit_ids ?? [],
      matchIds: payload.match_ids ?? [],
      remaining: Number(payload.remaining_unmatched ?? 0),
      flags: payload.flags ?? [],
      ...(mappingCollision ? { mappingCollision } : {}),
      ...(proposalFlag ? { proposalFlag } : {}),
      ...(mappingId ? { mappingId } : {}),
    },
  };
}

// ============================================================================
// PP4-C: resolvePayerMappingCollision — split out from reconcileTransaction.
// PP4-B's design tried to bundle collision-resolution into the same action
// as the match commit, but the second call (resolution-only) re-invoked
// rpc_reconcile_bank_transaction on an already-matched transaction, causing
// over-allocation errors. Splitting it out keeps reconcileTransaction
// idempotent for its narrow concern (one match, one DB write) and gives the
// dialog round-trip a clean dedicated endpoint.
//
// Inputs:
//   - bank_transaction_id: used to look up description for canonicalisation
//   - proposed_lot_id: the lot the manager originally tried to map to
//   - resolution: 'update' | 'keep_existing' | 'remove'
//   - expected_collisions: snapshot from the first-call collision payload
//
// Output:
//   - success.resolution_applied + mapping_id when applied cleanly
//   - success.race + divergence_type when state diverged between the two calls
//   - error when validation/auth fails or canonicalisation fails
// ============================================================================
export async function resolvePayerMappingCollision(
  input: ResolvePayerMappingCollisionInput,
): Promise<ResolvePayerMappingCollisionResult> {
  const parsed = resolvePayerMappingCollisionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  // Look up description from the bank transaction to canonicalise.
  const { data: bt } = await supabase
    .from("bank_transactions")
    .select("description, bank_account_id")
    .eq("id", parsed.data.bank_transaction_id)
    .maybeSingle();
  if (!bt) {
    return { error: "Bank transaction not found" };
  }
  const canonical = canonicaliseSender(bt.description ?? null);
  if (!canonical) {
    return {
      error:
        "Bank transaction description has no canonical sender name — cannot resolve a mapping collision",
    };
  }

  const result = await resolveCollision({
    subdivision_id: parsed.data.subdivision_id,
    canonical_sender_name: canonical,
    proposed_lot_id: parsed.data.proposed_lot_id,
    resolution: parsed.data.resolution,
    expected_collisions: parsed.data.expected_collisions,
    performed_by: profile.id,
  });

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");

  if (!result.ok) {
    return {
      success: {
        race: {
          divergence_type: result.divergence_type,
          details: result.details,
        },
      },
    };
  }

  return {
    success: {
      resolution_applied: result.resolution_applied,
      mapping_id: result.mapping_id,
    },
  };
}

// ============================================================================
// PP4-D: Mapping management server actions (mappings page)
// ============================================================================

export interface MappingListRow {
  id: string;
  canonical_sender_name: string;
  lot_id: string;
  lot_label: string;
  status: MappingStatus;
  status_reason: string | null;
  raw_examples_count: number;
  /** Derived per Gap 4: raw_examples.length > 0 → 'auto', else 'manual'. */
  source: "manual" | "auto";
  created_at: string;
  updated_at: string;
}

export async function getMappingsForSubdivision(
  subdivisionId: string,
  filter: "active" | "ambiguous" | "disabled" | "all" = "active",
): Promise<MappingListRow[]> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  let query = supabase
    .from("bank_payer_mappings")
    .select(
      "id, canonical_sender_name, lot_id, status, status_reason, raw_examples, created_at, updated_at",
    )
    .eq("subdivision_id", subdivisionId);
  if (filter === "active") query = query.eq("status", "active");
  else if (filter === "ambiguous") query = query.eq("status", "ambiguous");
  else if (filter === "disabled") query = query.eq("status", "disabled");

  // Sort: ambiguous first (highest severity), then active, then disabled,
  // then by canonical name within each status group.
  const { data: rows } = await query;
  const mappings = (rows ?? []) as Array<{
    id: string;
    canonical_sender_name: string;
    lot_id: string;
    status: MappingStatus;
    status_reason: string | null;
    raw_examples: unknown;
    created_at: string;
    updated_at: string;
  }>;

  if (mappings.length === 0) return [];

  const lotIds = Array.from(new Set(mappings.map((m) => m.lot_id)));
  const { data: lots } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number")
    .in("id", lotIds);
  const lotLabelById = new Map<string, string>();
  for (const l of lots ?? []) {
    const label = l.unit_number
      ? `Lot ${l.lot_number} (Unit ${l.unit_number})`
      : `Lot ${l.lot_number}`;
    lotLabelById.set(l.id, label);
  }

  const STATUS_ORDER: Record<MappingStatus, number> = {
    ambiguous: 0,
    active: 1,
    disabled: 2,
  };

  const out: MappingListRow[] = mappings.map((m) => {
    const examples = Array.isArray(m.raw_examples) ? m.raw_examples : [];
    return {
      id: m.id,
      canonical_sender_name: m.canonical_sender_name,
      lot_id: m.lot_id,
      lot_label: lotLabelById.get(m.lot_id) ?? "Lot ?",
      status: m.status,
      status_reason: m.status_reason,
      raw_examples_count: examples.length,
      source: examples.length > 0 ? "auto" : "manual",
      created_at: m.created_at,
      updated_at: m.updated_at,
    };
  });

  out.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    return a.canonical_sender_name.localeCompare(b.canonical_sender_name);
  });

  return out;
}

export interface MappingDetail {
  id: string;
  canonical_sender_name: string;
  lot_id: string;
  lot_label: string;
  status: MappingStatus;
  status_reason: string | null;
  raw_examples: string[];
  created_at: string;
  updated_at: string;
  audit: Array<{
    id: string;
    action: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }>;
}

export async function getMappingDetail(
  subdivisionId: string,
  mappingId: string,
): Promise<MappingDetail | null> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: m } = await supabase
    .from("bank_payer_mappings")
    .select(
      "id, canonical_sender_name, lot_id, status, status_reason, raw_examples, created_at, updated_at",
    )
    .eq("id", mappingId)
    .eq("subdivision_id", subdivisionId)
    .maybeSingle();
  if (!m) return null;

  const { data: lot } = await supabase
    .from("lots")
    .select("lot_number, unit_number")
    .eq("id", m.lot_id)
    .maybeSingle();
  const lotLabel = lot
    ? lot.unit_number
      ? `Lot ${lot.lot_number} (Unit ${lot.unit_number})`
      : `Lot ${lot.lot_number}`
    : "Lot ?";

  const { data: auditRows } = await supabase
    .from("audit_log")
    .select("id, action, created_at, metadata")
    .eq("entity_type", "bank_payer_mapping")
    .eq("entity_id", mappingId)
    .order("created_at", { ascending: false })
    .limit(50);

  const examples = Array.isArray(m.raw_examples)
    ? (m.raw_examples as unknown[]).filter(
        (s): s is string => typeof s === "string",
      )
    : [];

  return {
    id: m.id,
    canonical_sender_name: m.canonical_sender_name,
    lot_id: m.lot_id,
    lot_label: lotLabel,
    status: m.status,
    status_reason: m.status_reason,
    raw_examples: examples,
    created_at: m.created_at,
    updated_at: m.updated_at,
    audit: (auditRows ?? []).map((r) => ({
      id: r.id,
      action: r.action,
      created_at: r.created_at,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
    })),
  };
}

export type DisableMappingResult = {
  success?: { mapping_id: string };
  error?: string;
};

export async function disableMappingAction(
  input: { mapping_id: string; subdivision_id: string; reason?: string },
): Promise<DisableMappingResult> {
  const parsed = disableMappingSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);

  const result = await libDisableMapping({
    mapping_id: parsed.data.mapping_id,
    subdivision_id: parsed.data.subdivision_id,
    reason: parsed.data.reason,
    performed_by: profile.id,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation/mappings", "page");
  return { success: { mapping_id: result.mapping_id } };
}

export type ReactivateMappingActionResult = {
  success?: { mapping_id?: string; mappingCollision?: MappingCollisionPayload };
  error?: string;
};

async function buildCollisionPayload(
  subdivisionId: string,
  proposedLotId: string,
  canonicalName: string,
  collidingMappings: CollidingMappingSnapshot[],
): Promise<MappingCollisionPayload> {
  const supabase = createServerClient();
  const allLotIds = Array.from(
    new Set([proposedLotId, ...collidingMappings.map((m) => m.lot_id)]),
  );
  const { data: lots } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number")
    .in("id", allLotIds);
  const labelById = new Map<string, string>();
  for (const l of lots ?? []) {
    labelById.set(
      l.id,
      l.unit_number
        ? `Lot ${l.lot_number} (Unit ${l.unit_number})`
        : `Lot ${l.lot_number}`,
    );
  }
  return {
    canonical_sender_name: canonicalName,
    proposed_lot_id: proposedLotId,
    proposed_lot_label: labelById.get(proposedLotId) ?? "Lot ?",
    colliding_mappings: collidingMappings.map((m) => ({
      id: m.id,
      lot_id: m.lot_id,
      lot_label: labelById.get(m.lot_id) ?? "Lot ?",
      previous_status: m.previous_status,
      current_status: m.current_status,
    })),
  };
}

export async function reactivateMappingAction(
  input: { mapping_id: string; subdivision_id: string },
): Promise<ReactivateMappingActionResult> {
  const parsed = mappingActionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);

  const result = await libReactivateMapping({
    mapping_id: parsed.data.mapping_id,
    subdivision_id: parsed.data.subdivision_id,
    performed_by: profile.id,
  });

  if (!result.ok && result.kind === "error") {
    return { error: result.error };
  }
  if (!result.ok && result.kind === "collision") {
    const payload = await buildCollisionPayload(
      parsed.data.subdivision_id,
      result.proposed.lot_id,
      result.proposed.canonical_sender_name,
      result.colliding_mappings,
    );
    return { success: { mappingCollision: payload } };
  }
  // ok: true case
  if (result.ok) {
    revalidatePath(
      "/subdivisions/[subdivisionCode]/reconciliation/mappings", "page")
    return { success: { mapping_id: result.mapping_id } };
  }
  return { error: "Unexpected reactivate state" };
}

export type DeleteMappingActionResult = {
  success?: { mapping_id: string };
  error?: string;
};

export async function deleteMappingAction(
  input: { mapping_id: string; subdivision_id: string },
): Promise<DeleteMappingActionResult> {
  const parsed = mappingActionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  // Admin-only: super_admin platform role OR strata_manager + admin company_role.
  if (profile.role !== "super_admin" && profile.company_role !== "admin") {
    return { error: "Only company admins can delete mappings" };
  }
  await requireSubdivisionAccess(parsed.data.subdivision_id);

  const result = await libDeleteMapping({
    mapping_id: parsed.data.mapping_id,
    subdivision_id: parsed.data.subdivision_id,
    performed_by: profile.id,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation/mappings", "page");
  return { success: { mapping_id: result.mapping_id } };
}

// PP4-D: collision-resolve action used by the mappings page (re-activate
// flow). Distinct from `resolvePayerMappingCollision` (reconcile flow):
// no bank_transaction_id / canonical-name lookup.
export type ResolveMappingCollisionResult = {
  success?: {
    resolution_applied?: "update" | "keep_existing" | "remove";
    mapping_id?: string | null;
    race?: {
      divergence_type:
        | "mapping_changed"
        | "mapping_deleted"
        | "new_active_mapping_appeared";
      details: { expected: string[]; current: string[] };
    };
  };
  error?: string;
};

export async function resolveMappingCollision(
  input: {
    subdivision_id: string;
    canonical_sender_name: string;
    proposed_lot_id: string;
    resolution: "update" | "keep_existing" | "remove";
    expected_collisions: CollidingMappingSnapshot[];
  },
): Promise<ResolveMappingCollisionResult> {
  const parsed = resolveMappingCollisionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);

  const result = await resolveCollision({
    subdivision_id: parsed.data.subdivision_id,
    canonical_sender_name: parsed.data.canonical_sender_name,
    proposed_lot_id: parsed.data.proposed_lot_id,
    resolution: parsed.data.resolution,
    expected_collisions: parsed.data.expected_collisions,
    performed_by: profile.id,
  });

  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation/mappings", "page");

  if (!result.ok) {
    return {
      success: {
        race: {
          divergence_type: result.divergence_type,
          details: result.details,
        },
      },
    };
  }
  return {
    success: {
      resolution_applied: result.resolution_applied,
      mapping_id: result.mapping_id,
    },
  };
}

// PP4-D: server-action wrapper for the dialog's "Create new" path after a
// mapping_deleted race. The colliding row is already gone, so the create
// should succeed without collision in the common case. We still surface a
// collision payload if a fresh competitor appeared (extremely unlikely).
export type CreateMappingDirectResult = {
  success?: {
    mapping_id?: string;
    mappingCollision?: MappingCollisionPayload;
  };
  error?: string;
};

export async function createMappingDirectAction(input: {
  subdivision_id: string;
  canonical_sender_name: string;
  lot_id: string;
  raw_example?: string;
}): Promise<CreateMappingDirectResult> {
  if (
    !input.subdivision_id ||
    !input.canonical_sender_name ||
    !input.lot_id
  ) {
    return { error: "Missing required fields" };
  }

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(input.subdivision_id);

  const result = await createBankPayerMapping({
    subdivision_id: input.subdivision_id,
    canonical_sender_name: input.canonical_sender_name,
    lot_id: input.lot_id,
    raw_example: input.raw_example,
    created_by: profile.id,
  });

  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation/mappings", "page");

  if (result.ok) {
    return { success: { mapping_id: result.mapping_id } };
  }
  // Fresh collision — re-route to the dialog with the new payload.
  const payload = await buildCollisionPayload(
    input.subdivision_id,
    result.proposed.lot_id,
    result.proposed.canonical_sender_name,
    result.colliding_mappings,
  );
  return { success: { mappingCollision: payload } };
}

export async function unmatchTransaction(
  input: UnmatchTransactionInput,
): Promise<{ success?: { voidedCreditIds: string[]; deletedMatchIds: string[]; reopenedReceiptIds: string[]; newMatchedTotal: number }; error?: string }> {
  const parsed = unmatchTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("rpc_unmatch_bank_transaction", {
    p_bank_transaction_id: parsed.data.bank_transaction_id,
    p_match_ids: parsed.data.match_ids ?? null,
    p_reason: parsed.data.reason,
    p_performed_by: profile.id,
  });

  if (error) return { error: error.message };

  const payload = (data ?? {}) as {
    voided_credit_ids?: string[];
    deleted_match_ids?: string[];
    reopened_receipt_ids?: string[];
    new_matched_total?: number | string;
  };

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  return {
    success: {
      voidedCreditIds: payload.voided_credit_ids ?? [],
      deletedMatchIds: payload.deleted_match_ids ?? [],
      reopenedReceiptIds: payload.reopened_receipt_ids ?? [],
      newMatchedTotal: Number(payload.new_matched_total ?? 0),
    },
  };
}

export async function recordCashReceipt(
  input: RecordCashReceiptInput,
): Promise<{ success?: { receiptId: string; receiptNumber: string; ledgerEntryId: string }; error?: string }> {
  const parsed = recordCashReceiptSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("rpc_record_cash_receipt", {
    p_subdivision_id: parsed.data.subdivision_id,
    p_lot_id: parsed.data.lot_id,
    p_bank_account_id: parsed.data.bank_account_id,
    p_fund_type: parsed.data.fund_type,
    p_amount: parsed.data.amount,
    p_received_date: parsed.data.received_date,
    p_payment_method: parsed.data.payment_method,
    p_cheque_number: parsed.data.cheque_number ?? null,
    p_description: parsed.data.description ?? null,
    p_performed_by: profile.id,
  });

  if (error) return { error: error.message };
  const payload = (data ?? {}) as { receipt_id?: string; receipt_number?: string; ledger_entry_id?: string };

  // PP5-B: ledger-side duplicate detection is intentionally NOT invoked on
  // cash receipts. rpc_record_cash_receipt creates the credit with
  // levy_notice_id = NULL (untargeted) — receipts don't carry notice
  // linkage at receipt time; that gets attached later when
  // rpc_deposit_undeposited_funds matches the receipt to a bank tx.
  // The detector's eligibility predicate (levy_notice_id IS NOT NULL) would
  // skip every receipt credit, so calling the helper would be dead code.
  // PRE_LAUNCH_CLEANUP records the option of extending detection to
  // receipts once notice-linkage support lands.

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/bank-account", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/lots/[lotId]", "page");
  return {
    success: {
      receiptId: payload.receipt_id ?? "",
      receiptNumber: payload.receipt_number ?? "",
      ledgerEntryId: payload.ledger_entry_id ?? "",
    },
  };
}

export async function depositUndepositedFunds(
  input: DepositUndepositedFundsInput,
): Promise<{ success?: { clearedReceiptNumbers: string[]; matchIds: string[] }; error?: string }> {
  const parsed = depositUndepositedFundsSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("rpc_deposit_undeposited_funds", {
    p_bank_transaction_id: parsed.data.bank_transaction_id,
    p_undeposited_entry_ids: parsed.data.undeposited_entry_ids,
    p_performed_by: profile.id,
  });

  if (error) return { error: error.message };
  const payload = (data ?? {}) as { cleared_receipt_numbers?: string[]; match_ids?: string[] };

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/bank-account", "page");
  return {
    success: {
      clearedReceiptNumbers: payload.cleared_receipt_numbers ?? [],
      matchIds: payload.match_ids ?? [],
    },
  };
}

export async function excludeTransaction(
  input: ExcludeTransactionInput,
): Promise<{ success?: true; error?: string }> {
  const parsed = excludeTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { error } = await supabase.rpc("rpc_exclude_bank_transaction", {
    p_bank_transaction_id: parsed.data.bank_transaction_id,
    p_reason: parsed.data.reason,
    p_performed_by: profile.id,
  });

  if (error) return { error: error.message };

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  return { success: true };
}

export async function unexcludeTransaction(
  input: UnexcludeTransactionInput,
): Promise<{ success?: true; error?: string }> {
  const parsed = unexcludeTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { error } = await supabase.rpc("rpc_unexclude_bank_transaction", {
    p_bank_transaction_id: parsed.data.bank_transaction_id,
    p_performed_by: profile.id,
  });

  if (error) return { error: error.message };

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  return { success: true };
}

export async function voidBankTransaction(
  input: VoidBankTransactionInput,
): Promise<{ success?: { voidedCreditIds: string[]; reopenedReceiptIds: string[] }; error?: string }> {
  const parsed = voidBankTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data: bt, error: btErr } = await supabase
    .from("bank_transactions")
    .select("id, bank_account_id, matched_total, match_status, is_voided")
    .eq("id", parsed.data.bank_transaction_id)
    .single();
  if (btErr || !bt) return { error: "Bank transaction not found" };
  if (bt.is_voided) return { error: "Bank transaction is already voided" };

  // Q4 guard: if the txn has both deposited-receipt matches AND non-receipt
  // matches, reject with explicit non-receipt match_ids so the manager knows
  // exactly what to unmatch first.
  const { data: matches } = await supabase
    .from("reconciliation_matches")
    .select("id, ledger_entry_id")
    .eq("bank_transaction_id", parsed.data.bank_transaction_id);

  const matchRows = matches ?? [];
  const creditIds = matchRows.map((m) => m.ledger_entry_id);
  let receiptLinkedCreditIds = new Set<string>();
  if (creditIds.length > 0) {
    const { data: ufRows } = await supabase
      .from("undeposited_funds_entries")
      .select("linked_ledger_credit_id")
      .eq("deposited_by_bank_transaction_id", parsed.data.bank_transaction_id)
      .in("linked_ledger_credit_id", creditIds);
    receiptLinkedCreditIds = new Set((ufRows ?? []).map((r) => r.linked_ledger_credit_id));
  }
  const nonReceiptMatchIds = matchRows
    .filter((m) => !receiptLinkedCreditIds.has(m.ledger_entry_id))
    .map((m) => m.id);
  const hasReceiptMatches = receiptLinkedCreditIds.size > 0;
  const hasNonReceiptMatches = nonReceiptMatchIds.length > 0;
  if (hasReceiptMatches && hasNonReceiptMatches) {
    return {
      error:
        `This bank transaction cleared undeposited receipts AND has additional matches beyond those receipts. ` +
        `Voiding would leave the books in an ambiguous state. Unmatch the non-receipt allocations first ` +
        `(match_ids: [${nonReceiptMatchIds.join(", ")}]) via the reconciliation queue, then void the transaction to reopen the receipts.`,
    };
  }

  let voidedCreditIds: string[] = [];
  let reopenedReceiptIds: string[] = [];

  if (matchRows.length > 0) {
    const { data: unmatchData, error: unmatchErr } = await supabase.rpc("rpc_unmatch_bank_transaction", {
      p_bank_transaction_id: parsed.data.bank_transaction_id,
      p_match_ids: null,
      p_reason: `Cascaded from bank transaction void: ${parsed.data.reason}`,
      p_performed_by: profile.id,
    });
    if (unmatchErr) return { error: unmatchErr.message };
    const payload = (unmatchData ?? {}) as {
      voided_credit_ids?: string[];
      reopened_receipt_ids?: string[];
    };
    voidedCreditIds = payload.voided_credit_ids ?? [];
    reopenedReceiptIds = payload.reopened_receipt_ids ?? [];
  }

  const { error: updErr } = await supabase
    .from("bank_transactions")
    .update({
      is_voided: true,
      voided_at: new Date().toISOString(),
      voided_by: profile.id,
      void_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.bank_transaction_id);
  if (updErr) return { error: updErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: parsed.data.subdivision_id,
    action: "bank_transaction.voided",
    entity_type: "bank_transaction",
    entity_id: parsed.data.bank_transaction_id,
    metadata: {
      reason: parsed.data.reason,
      voided_credit_ids: voidedCreditIds,
      reopened_receipt_ids: reopenedReceiptIds,
    },
  });

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/bank-account", "page");
  return { success: { voidedCreditIds, reopenedReceiptIds } };
}

export async function voidUndepositedReceipt(
  input: VoidUndepositedReceiptInput,
): Promise<{ success?: { voidedCreditId: string }; error?: string }> {
  const parsed = voidUndepositedReceiptSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data: uf, error: ufErr } = await supabase
    .from("undeposited_funds_entries")
    .select("id, status, linked_ledger_credit_id, subdivision_id")
    .eq("id", parsed.data.receipt_id)
    .single();
  if (ufErr || !uf) return { error: "Receipt not found" };
  if (uf.subdivision_id !== parsed.data.subdivision_id) return { error: "Receipt does not belong to this subdivision" };
  if (uf.status === "voided") return { error: "Receipt is already voided" };
  if (uf.status === "deposited") {
    return {
      error:
        "This receipt has been deposited. Void the clearing bank transaction first (which will reopen the receipt), then void the receipt.",
    };
  }

  // Void the linked credit.
  const { error: voidErr } = await supabase.rpc("rpc_ledger_void", {
    p_entry_id: uf.linked_ledger_credit_id,
    p_reason: `Receipt void: ${parsed.data.reason}`,
    p_voided_by: profile.id,
  });
  if (voidErr) return { error: voidErr.message };

  const { error: updErr } = await supabase
    .from("undeposited_funds_entries")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: profile.id,
      void_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.receipt_id);
  if (updErr) return { error: updErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: parsed.data.subdivision_id,
    action: "receipt.voided",
    entity_type: "undeposited_funds_entry",
    entity_id: parsed.data.receipt_id,
    metadata: { reason: parsed.data.reason, voided_credit_id: uf.linked_ledger_credit_id },
  });

  revalidatePath("/subdivisions/[subdivisionCode]/bank-account", "page");
  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  return { success: { voidedCreditId: uf.linked_ledger_credit_id } };
}

// ============================================================================
// VOID PREVIEWS (read-only; for the destructive-confirm dialog)
// ============================================================================

export async function previewVoidBankTransaction(
  subdivisionId: string,
  bankTransactionId: string,
): Promise<VoidCascadePreview> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: bt } = await supabase
    .from("bank_transactions")
    .select("id, amount, description, transaction_date, is_voided, bank_account_id")
    .eq("id", bankTransactionId)
    .single();
  if (!bt) throw new Error("Bank transaction not found");

  const blocker = bt.is_voided ? "Bank transaction is already voided." : null;

  const { data: matches } = await supabase
    .from("reconciliation_matches")
    .select("id, ledger_entry_id, amount_matched")
    .eq("bank_transaction_id", bankTransactionId);

  const matchRows = matches ?? [];
  const ledgerIds = matchRows.map((m) => m.ledger_entry_id);

  let ledgerMap = new Map<
    string,
    { lot_id: string; category: string; amount: number; levy_notice_id: string | null }
  >();
  if (ledgerIds.length > 0) {
    const { data: ledgerRows } = await supabase
      .from("lot_ledger_entries")
      .select("id, lot_id, category, amount, levy_notice_id")
      .in("id", ledgerIds);
    ledgerMap = new Map(
      (ledgerRows ?? []).map((l) => [
        l.id,
        { lot_id: l.lot_id, category: l.category, amount: Number(l.amount), levy_notice_id: l.levy_notice_id },
      ]),
    );
  }

  const { data: receipts } = await supabase
    .from("undeposited_funds_entries")
    .select("id, receipt_number, lot_id, amount, linked_ledger_credit_id")
    .eq("deposited_by_bank_transaction_id", bankTransactionId);

  const receiptByCreditId = new Map(
    (receipts ?? []).map((r) => [r.linked_ledger_credit_id, r]),
  );

  const lotIds = Array.from(
    new Set([
      ...Array.from(ledgerMap.values()).map((v) => v.lot_id),
      ...(receipts ?? []).map((r) => r.lot_id),
    ]),
  );
  let lotMap = new Map<string, string>();
  if (lotIds.length > 0) {
    const { data: lots } = await supabase.from("lots").select("id, lot_number").in("id", lotIds);
    lotMap = new Map((lots ?? []).map((l) => [l.id, String(l.lot_number)]));
  }

  const noticeIds = Array.from(
    new Set(
      Array.from(ledgerMap.values())
        .map((v) => v.levy_notice_id)
        .filter((x): x is string => !!x),
    ),
  );
  let noticeMap = new Map<string, string>();
  if (noticeIds.length > 0) {
    const { data: notices } = await supabase
      .from("levy_notices")
      .select("id, reference_number")
      .in("id", noticeIds);
    noticeMap = new Map((notices ?? []).map((n) => [n.id, n.reference_number]));
  }

  const matchesToUnlink = matchRows.map((m) => {
    const led = ledgerMap.get(m.ledger_entry_id);
    return {
      match_id: m.id,
      lot_number: led ? lotMap.get(led.lot_id) ?? "" : "",
      amount: Number(m.amount_matched),
      levy_reference: led?.levy_notice_id ? noticeMap.get(led.levy_notice_id) ?? null : null,
    };
  });

  const creditsToVoid = matchRows
    .filter((m) => !receiptByCreditId.has(m.ledger_entry_id))
    .map((m) => {
      const led = ledgerMap.get(m.ledger_entry_id)!;
      return {
        ledger_entry_id: m.ledger_entry_id,
        lot_number: lotMap.get(led.lot_id) ?? "",
        amount: Number(m.amount_matched),
        category: led.category,
      };
    });

  const undepositedReceiptsToReopen = (receipts ?? []).map((r) => ({
    receipt_id: r.id,
    receipt_number: r.receipt_number,
    lot_number: lotMap.get(r.lot_id) ?? "",
    amount: Number(r.amount),
  }));

  const distinctLots = new Set<string>();
  for (const v of ledgerMap.values()) distinctLots.add(v.lot_id);
  for (const r of receipts ?? []) distinctLots.add(r.lot_id);

  const cascadeTotal = matchRows.reduce((s, m) => s + Number(m.amount_matched), 0);

  return {
    kind: "bank_transaction",
    target_summary: `Bank transaction ${bt.transaction_date} · ${Number(bt.amount).toFixed(2)} — ${bt.description ?? ""}`.trim(),
    matches_to_unlink: matchesToUnlink,
    credits_to_void: creditsToVoid,
    undeposited_receipts_to_reopen: undepositedReceiptsToReopen,
    distinct_lot_count: distinctLots.size,
    cascade_amount_total: round2(cascadeTotal),
    blocker,
  };
}

export async function previewVoidLedgerEntry(
  subdivisionId: string,
  entryId: string,
): Promise<VoidCascadePreview> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: entry } = await supabase
    .from("lot_ledger_entries")
    .select("id, lot_id, subdivision_id, amount, category, status, entry_type, description")
    .eq("id", entryId)
    .single();
  if (!entry || entry.subdivision_id !== subdivisionId) throw new Error("Ledger entry not found");

  let blocker: string | null = null;
  if (entry.status === "voided") blocker = "Entry is already voided.";
  if (!blocker && entry.category === "void_offset") blocker = "Offset entries cannot be voided directly.";
  if (!blocker && entry.category === "payment") {
    // Check if linked via reconciliation_matches or undeposited_funds_entries.
    const [{ data: hasMatch }, { data: hasReceipt }] = await Promise.all([
      supabase
        .from("reconciliation_matches")
        .select("id")
        .eq("ledger_entry_id", entryId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("undeposited_funds_entries")
        .select("id")
        .eq("linked_ledger_credit_id", entryId)
        .limit(1)
        .maybeSingle(),
    ]);
    if (hasMatch)
      blocker =
        "This payment is linked to a bank transaction. Void or unmatch the bank transaction to reverse it.";
    if (!blocker && hasReceipt)
      blocker =
        "This payment is linked to an undeposited receipt. Void the receipt from the undeposited panel.";
  }

  const { data: lot } = await supabase
    .from("lots")
    .select("lot_number")
    .eq("id", entry.lot_id)
    .single();

  const lotLabel = lot ? `Lot ${lot.lot_number}` : "";

  return {
    kind: "ledger_entry",
    target_summary: `${lotLabel} · ${entry.entry_type} ${Number(entry.amount).toFixed(2)} (${entry.category}) — ${entry.description ?? ""}`.trim(),
    matches_to_unlink: [],
    credits_to_void: [],
    undeposited_receipts_to_reopen: [],
    distinct_lot_count: 1,
    cascade_amount_total: Number(entry.amount),
    blocker,
  };
}

export async function previewVoidUndepositedReceipt(
  subdivisionId: string,
  receiptId: string,
): Promise<VoidCascadePreview> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: uf } = await supabase
    .from("undeposited_funds_entries")
    .select(
      "id, receipt_number, lot_id, amount, status, linked_ledger_credit_id, subdivision_id, payment_method, cheque_number",
    )
    .eq("id", receiptId)
    .single();
  if (!uf || uf.subdivision_id !== subdivisionId) throw new Error("Receipt not found");

  let blocker: string | null = null;
  if (uf.status === "voided") blocker = "Receipt is already voided.";
  if (!blocker && uf.status === "deposited")
    blocker =
      "Receipt has been deposited. Void the clearing bank transaction first (which will reopen the receipt), then void the receipt.";

  const { data: lot } = await supabase
    .from("lots")
    .select("lot_number")
    .eq("id", uf.lot_id)
    .single();

  return {
    kind: "undeposited_receipt",
    target_summary: `Receipt ${uf.receipt_number} — ${uf.payment_method}${uf.cheque_number ? ` #${uf.cheque_number}` : ""} — ${Number(uf.amount).toFixed(2)}`,
    matches_to_unlink: [],
    credits_to_void: [
      {
        ledger_entry_id: uf.linked_ledger_credit_id,
        lot_number: lot ? String(lot.lot_number) : "",
        amount: Number(uf.amount),
        category: "payment",
      },
    ],
    undeposited_receipts_to_reopen: [],
    distinct_lot_count: 1,
    cascade_amount_total: Number(uf.amount),
    blocker,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T00:00:00Z").getTime();
  const b = new Date(toISO + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}
