// ============================================================================
// Cron-callable Basiq jobs — framework-agnostic
// ----------------------------------------------------------------------------
// Functions here run in BOTH a Next.js request context (via server actions in
// src/lib/actions/basiq.ts that wrap them with auth + revalidate) AND in
// out-of-request contexts (Trigger.dev scheduled tasks, future admin CLI).
//
// Rules for code in this file:
//   - NO `"use server"` directive — exports must not become server actions
//   - NO imports from `next/cache` — no revalidate calls (the server-action
//     layer handles cache invalidation for request-context callers)
//   - NO imports from `@clerk/*` or `@/lib/auth` — auth is resolved by the
//     caller; these functions take explicit `performedBy: string` as an arg
//   - Callers must supply a real profile UUID; no "system sentinel" magic
//
// The verification harness may call either layer. The Trigger.dev tasks in
// /trigger/basiq-jobs.ts call this layer directly, passing each connection's
// own `created_by` (NOT NULL, FK to profiles) as the performer.
// ============================================================================

import { createServerClient } from "@/lib/supabase";
import { tryAutoMatch } from "@/lib/reconciliation/orchestrator";
import {
  BasiqApiError,
  getBasiqApiClient,
} from "@/lib/basiq/client";
import { parseBasiqDescription } from "@/lib/basiq/parsers";
import {
  sendBasiqConsentExpiredEmail,
  sendBasiqReauthReminderEmail,
} from "@/lib/email";
import type {
  BasiqReauthNotificationType,
  BasiqTransactionPayload,
  PollResult,
} from "@/lib/validations/basiq";

// ────────────────────────────────────────────────────────────────
// Pollers: fetch & insert transactions for a single connection.
// Used by Trigger.dev midnight-poll, force-sync, webhook dispatch, and
// gap reconciliation.
// ────────────────────────────────────────────────────────────────

export async function pollConnectionAsSystem(
  connectionId: string,
  performedBy: string,
): Promise<PollResult> {
  const supabase = createServerClient();
  const client = getBasiqApiClient();

  const { data: conn } = await supabase
    .from("basiq_connections")
    .select(
      "id, subdivision_id, basiq_user_id, basiq_external_connection_id, basiq_institution_id, last_sync_at, status, consent_expires_at",
    )
    .eq("id", connectionId)
    .single();
  if (!conn) {
    return {
      connectionId,
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      autoMatched: 0,
      error: "connection not found",
    };
  }

  if (
    conn.consent_expires_at &&
    new Date(conn.consent_expires_at).getTime() < Date.now()
  ) {
    return {
      connectionId,
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      autoMatched: 0,
      error: "consent_required",
    };
  }

  await supabase
    .from("basiq_connections")
    .update({ status: "syncing" })
    .eq("id", connectionId);

  let fetched = 0;
  let inserted = 0;
  let duplicates = 0;
  let autoMatched = 0;

  try {
    const sinceIso = conn.last_sync_at ?? conn.consent_expires_at ?? undefined;
    const txns = await client.getTransactions({
      basiqUserId: conn.basiq_user_id,
      sinceIso: sinceIso ?? undefined,
      limit: 500,
    });
    fetched = txns.length;

    const accountMap = await resolveAccountMap(
      conn.subdivision_id,
      conn.id,
      txns,
    );

    for (const tx of txns) {
      const bankAccountId = accountMap.get(tx.account);
      if (!bankAccountId) continue;

      const parsed = parseBasiqDescription(conn.basiq_institution_id, tx);
      const signed = signedBasiqAmount(tx);
      const date = transactionDateFromPayload(tx);
      const balance = balanceFromPayload(tx);

      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        "rpc_insert_basiq_transaction",
        {
          p_bank_account_id: bankAccountId,
          p_basiq_transaction_id: tx.id,
          p_transaction_date: date,
          p_amount: signed,
          p_description: parsed.cleaned_description,
          p_balance: balance,
          p_basiq_raw: tx,
          p_performed_by: performedBy,
        },
      );
      if (rpcErr) continue;
      const result = rpcRes as {
        bank_transaction_id: string;
        was_duplicate: boolean;
      };
      if (result.was_duplicate) {
        duplicates += 1;
        continue;
      }
      inserted += 1;

      // Run the orchestrator on every credit-direction Basiq insert,
      // not just those with a parsed levy reference — Strategy 2 (BPAY
      // CRN) reads the description independently of the parser's
      // reference extraction.
      if (signed > 0) {
        const m = await tryAutoMatch({
          bankTransactionId: result.bank_transaction_id,
          subdivisionId: conn.subdivision_id,
          bankAccountId,
          description: parsed.cleaned_description,
          amount: signed,
          transactionDate: date,
          performedBy,
        });
        if (m.matched) autoMatched += 1;
      }
    }

    const nowIso = new Date().toISOString();
    await supabase
      .from("basiq_connections")
      .update({
        status: "active",
        last_sync_at: nowIso,
        last_sync_error: null,
      })
      .eq("id", connectionId);
    await supabase
      .from("bank_accounts")
      .update({ last_sync_at: nowIso })
      .eq("basiq_connection_id", connectionId);

    return {
      connectionId,
      fetched,
      inserted,
      duplicates,
      autoMatched,
      error: null,
    };
  } catch (e) {
    const err = e as Error | BasiqApiError;
    if (
      err instanceof BasiqApiError &&
      err.category === "consent_required"
    ) {
      await supabase.rpc("rpc_mark_basiq_connection_expired", {
        p_basiq_connection_id: connectionId,
        p_reason: "Basiq returned consent_required during poll",
        p_performed_by: performedBy,
      });
      return {
        connectionId,
        fetched,
        inserted,
        duplicates,
        autoMatched,
        error: "consent_required",
      };
    }
    await supabase
      .from("basiq_connections")
      .update({
        status: "active",
        last_sync_error: err.message,
      })
      .eq("id", connectionId);
    return {
      connectionId,
      fetched,
      inserted,
      duplicates,
      autoMatched,
      error: err.message,
    };
  }
}

async function resolveAccountMap(
  subdivisionId: string,
  connectionId: string,
  txns: BasiqTransactionPayload[],
): Promise<Map<string, string>> {
  const supabase = createServerClient();
  const map = new Map<string, string>();
  const distinctBasiqAccountIds = Array.from(
    new Set(txns.map((t) => t.account).filter(Boolean)),
  );
  if (distinctBasiqAccountIds.length === 0) return map;

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, basiq_account_id")
    .eq("subdivision_id", subdivisionId)
    .eq("basiq_connection_id", connectionId);
  for (const a of (accounts ?? []) as {
    id: string;
    basiq_account_id: string | null;
  }[]) {
    if (a.basiq_account_id) map.set(a.basiq_account_id, a.id);
  }
  return map;
}

function signedBasiqAmount(tx: BasiqTransactionPayload): number {
  const n = Number(tx.amount);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function transactionDateFromPayload(tx: BasiqTransactionPayload): string {
  const candidate = tx.postDate ?? tx.transactionDate;
  if (candidate) return candidate.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function balanceFromPayload(tx: BasiqTransactionPayload): number | null {
  if (!tx.balance) return null;
  const n = Number(tx.balance);
  return Number.isFinite(n) ? n : null;
}

// ────────────────────────────────────────────────────────────────
// Reauth notification cadence — 30/14/7/3/1-day reminders, idempotent.
// Used by Trigger.dev daily-reauth-notifications + admin-triggered runs.
// ────────────────────────────────────────────────────────────────

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const diffMs = new Date(isoDate).getTime() - Date.now();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export async function sendPendingReauthNotificationsJob(): Promise<{
  sentCount: number;
}> {
  const supabase = createServerClient();

  const { data: active } = await supabase
    .from("basiq_connections")
    .select(
      "id, subdivision_id, consent_expires_at, nominated_representative_profile_id, institution_name",
    )
    .eq("status", "active");
  if (!active || active.length === 0) return { sentCount: 0 };

  let sent = 0;

  for (const conn of active as {
    id: string;
    subdivision_id: string;
    consent_expires_at: string | null;
    nominated_representative_profile_id: string | null;
    institution_name: string;
  }[]) {
    if (!conn.consent_expires_at || !conn.nominated_representative_profile_id) {
      continue;
    }
    const daysLeft = daysUntil(conn.consent_expires_at);
    if (daysLeft === null) continue;

    const cadence: Record<number, BasiqReauthNotificationType> = {
      30: "reauth_30d",
      14: "reauth_14d",
      7: "reauth_7d",
      3: "reauth_3d",
      1: "reauth_1d",
    };
    const type = cadence[daysLeft];
    if (!type) continue;

    const { data: existing } = await supabase
      .from("basiq_reauth_notifications")
      .select("id")
      .eq("basiq_connection_id", conn.id)
      .eq("notification_type", type)
      .maybeSingle();
    if (existing) continue;

    const { data: rep } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", conn.nominated_representative_profile_id)
      .single();
    const { data: sub } = await supabase
      .from("subdivisions")
      .select("name")
      .eq("id", conn.subdivision_id)
      .single();
    if (!rep || !sub) continue;

    const reauthUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/subdivisions/${conn.subdivision_id}/finance/bank-account`;

    await sendBasiqReauthReminderEmail({
      to: (rep as { email: string }).email,
      subdivisionName: (sub as { name: string }).name,
      daysRemaining: daysLeft,
      reauthUrl,
    });

    await supabase.from("basiq_reauth_notifications").insert({
      basiq_connection_id: conn.id,
      notification_type: type,
      profile_id: conn.nominated_representative_profile_id,
    });
    await supabase
      .from("basiq_connections")
      .update({ last_reauth_prompt_sent_at: new Date().toISOString() })
      .eq("id", conn.id);
    sent += 1;
  }

  return { sentCount: sent };
}

// ────────────────────────────────────────────────────────────────
// Hourly expiry sweep: transition active connections past their
// consent_expires_at to 'expired'.
// ----------------------------------------------------------------------------
// performedBy fallback: `created_by` (NOT NULL per schema, FK to profiles).
// The previous code used `row.id` (basiq_connections.id) as a fallback,
// which isn't a profile UUID — would have written a dangling profile_id on
// audit_log. Fixed here.
// ────────────────────────────────────────────────────────────────

export async function sweepExpiredConnectionsJob(): Promise<{
  expiredCount: number;
}> {
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("basiq_connections")
    .select(
      "id, nominated_representative_profile_id, subdivision_id, created_by",
    )
    .eq("status", "active")
    .lte("consent_expires_at", nowIso);
  if (!due || due.length === 0) return { expiredCount: 0 };

  let count = 0;
  for (const row of due as {
    id: string;
    nominated_representative_profile_id: string | null;
    subdivision_id: string;
    created_by: string;
  }[]) {
    const performer =
      row.nominated_representative_profile_id ?? row.created_by;

    const { error } = await supabase.rpc(
      "rpc_mark_basiq_connection_expired",
      {
        p_basiq_connection_id: row.id,
        p_reason: "12-month CDR consent expired",
        p_performed_by: performer,
      },
    );
    if (error) continue;
    count += 1;

    if (row.nominated_representative_profile_id) {
      const { data: rep } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", row.nominated_representative_profile_id)
        .single();
      const { data: sub } = await supabase
        .from("subdivisions")
        .select("name")
        .eq("id", row.subdivision_id)
        .single();
      if (rep && sub) {
        const reauthUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/subdivisions/${row.subdivision_id}/finance/bank-account`;
        await sendBasiqConsentExpiredEmail({
          to: (rep as { email: string }).email,
          subdivisionName: (sub as { name: string }).name,
          reauthUrl,
        });
        await supabase
          .from("basiq_reauth_notifications")
          .insert({
            basiq_connection_id: row.id,
            notification_type: "expired",
            profile_id: row.nominated_representative_profile_id,
          })
          .select()
          .single()
          .then(() => null, () => null);
      }
    }
  }
  return { expiredCount: count };
}
