"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidateSidebarForSubdivision } from "./subdivision";
import { tryAutoMatchByReference } from "./reconciliation";
import {
  BasiqApiError,
  getBasiqApiClient,
} from "@/lib/basiq/client";
import { parseBasiqDescription } from "@/lib/basiq/parsers";
import { issueStateToken } from "@/lib/basiq/state";
import {
  sendBasiqCommitteeGapNotificationEmail,
  sendBasiqConsentExpiredEmail,
  sendBasiqGapReconciliationEmail,
  sendBasiqReauthReminderEmail,
} from "@/lib/email";
import {
  BASIQ_WEBHOOK_EVENTS,
  basiqTransactionPayloadSchema,
  startBasiqConsentSchema,
  type BasiqConnectionDetail,
  type BasiqConnectionStatus,
  type BasiqConnectionStatusResult,
  type BasiqInstitution,
  type BasiqReauthNotificationType,
  type BasiqTransactionPayload,
  type BasiqWebhookEvent,
  type ForceSyncResult,
  type GapReportResult,
  type PollResult,
  type StartBasiqConsentInput,
} from "@/lib/validations/basiq";

// ─── Constants ─────────────────────────────────────────────────

const CONSENT_BASE =
  process.env.NEXT_PUBLIC_BASIQ_CONSENT_BASE ?? "https://consent.basiq.io";
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
const FORCE_SYNC_COOLDOWN_MS = 30_000;
const GAP_SUPPRESSION_HOURS = 48;
const COMMITTEE_NOTIFY_GAP_HOURS = 30 * 24; // 30 days
const INSTITUTION_CACHE_MS = 24 * 60 * 60 * 1000;

// ─── In-process caches (per lambda instance) ───────────────────

let _institutionCache: {
  at: number;
  data: BasiqInstitution[];
} | null = null;

// ─── Helpers ───────────────────────────────────────────────────

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const diffMs = new Date(isoDate).getTime() - Date.now();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function buildConsentUrl(args: {
  clientToken: string;
  state: string;
  institutionId?: string;
  action?: "reauthorise";
  connectionId?: string; // Basiq's external id, not ours
}): string {
  const qs = new URLSearchParams({
    token: args.clientToken,
    state: args.state,
  });
  // Pass institutionId as a hint — if Basiq accepts it, the Consent UI
  // skips the institution picker. TODO(pre-launch): verify the parameter
  // name against the Basiq Consent UI spec; may be "institutionId" or
  // "connectorId".
  if (args.institutionId) qs.set("institutionId", args.institutionId);
  if (args.action) qs.set("action", args.action);
  if (args.connectionId) qs.set("connectionId", args.connectionId);
  return `${CONSENT_BASE.replace(/\/+$/, "")}/home?${qs.toString()}`;
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

// ============================================================================
// 1. CONNECTION LIFECYCLE
// ============================================================================

export async function createBasiqUser(
  subdivisionId: string,
): Promise<{ success?: { basiqUserId: string }; error?: string }> {
  try {
    const profile = await requireCompanyRole();
    await requireSubdivisionAccess(subdivisionId);
    const supabase = createServerClient();

    // Idempotent: return the existing basiq_user_id if any connection exists.
    const { data: existing } = await supabase
      .from("basiq_connections")
      .select("basiq_user_id")
      .eq("subdivision_id", subdivisionId)
      .limit(1)
      .maybeSingle();
    if (existing?.basiq_user_id) {
      return { success: { basiqUserId: existing.basiq_user_id } };
    }

    // Fetch the subdivision to source an email + phone for the Basiq user
    // record. Basiq requires at least email.
    const { data: sub } = await supabase
      .from("subdivisions")
      .select("name, manager_contact_email, manager_contact_phone")
      .eq("id", subdivisionId)
      .single();

    const fallbackEmail =
      (sub as { manager_contact_email?: string } | null)
        ?.manager_contact_email ?? `oc+${subdivisionId}@myocm.com.au`;
    const mobile =
      (sub as { manager_contact_phone?: string } | null)
        ?.manager_contact_phone ?? undefined;

    void profile; // audited via subsequent basiq_connections insert
    const client = getBasiqApiClient();
    const userRes = await client.createUser({
      email: fallbackEmail,
      mobile,
    });
    return { success: { basiqUserId: userRes.id } };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function startBasiqConsent(
  input: StartBasiqConsentInput,
): Promise<
  | { success: { consentUrl: string; connectionId: string } }
  | { error: string }
> {
  const parsed = startBasiqConsentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  try {
    const profile = await requireCompanyRole();
    await requireSubdivisionAccess(parsed.data.subdivision_id);
    const supabase = createServerClient();
    const client = getBasiqApiClient();

    // 1. Ensure we have a Basiq user for this OC.
    const userRes = await createBasiqUser(parsed.data.subdivision_id);
    if (userRes.error || !userRes.success) {
      return { error: userRes.error ?? "failed to get basiq user" };
    }
    const basiqUserId = userRes.success.basiqUserId;

    // 2. Resolve the institution (name for display). We don't block on a
    //    missing lookup — listBasiqInstitutions caches and may not be
    //    populated the first time. Store what we know; webhook payloads
    //    may overwrite on finalisation.
    const institutions = await listBasiqInstitutionsInternal();
    const inst = institutions.find((i) => i.id === parsed.data.institution_id);
    const institutionName = inst?.name ?? parsed.data.institution_id;
    const institutionShortName = inst?.shortName ?? null;

    // 3. Insert a pending basiq_connections row.
    const { data: conn, error: connErr } = await supabase
      .from("basiq_connections")
      .insert({
        subdivision_id: parsed.data.subdivision_id,
        basiq_user_id: basiqUserId,
        basiq_external_connection_id: `pending-${crypto.randomUUID()}`,
        basiq_institution_id: parsed.data.institution_id,
        institution_name: institutionName,
        institution_short_name: institutionShortName,
        status: "pending",
        nominated_representative_name: parsed.data.nominated_rep_name,
        nominated_representative_profile_id: profile.id,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (connErr || !conn) {
      return { error: connErr?.message ?? "failed to create connection row" };
    }

    // 4. Mint a CLIENT_ACCESS token for this user.
    const tok = await client.generateClientToken({ basiqUserId });

    // 5. Issue CSRF state token and build consent URL.
    const state = issueStateToken({
      connectionId: conn.id,
      returnTo: parsed.data.return_to ?? null,
    });

    const consentUrl = buildConsentUrl({
      clientToken: tok.access_token,
      state,
      institutionId: parsed.data.institution_id,
    });

    // Audit
    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: parsed.data.subdivision_id,
      action: "basiq_connection.consent_started",
      entity_type: "basiq_connection",
      entity_id: conn.id,
      after_state: {
        basiq_user_id: basiqUserId,
        institution_id: parsed.data.institution_id,
        nominated_rep: parsed.data.nominated_rep_name,
      },
    });

    return { success: { consentUrl, connectionId: conn.id } };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function completeBasiqConsent(args: {
  connectionId: string;
  basiqJobId?: string | null;
}): Promise<{ success?: true; error?: string }> {
  try {
    const supabase = createServerClient();
    const client = getBasiqApiClient();

    const { data: conn } = await supabase
      .from("basiq_connections")
      .select("*")
      .eq("id", args.connectionId)
      .single();
    if (!conn) return { error: "connection not found" };

    const profile = await requireSubdivisionAccess(conn.subdivision_id);

    // Optional job poll — drop through if no jobId provided (some callbacks
    // may not carry one in all paths).
    let discoveredExternalConnectionId: string | null = null;
    if (args.basiqJobId) {
      // Poll up to 15s for the job to succeed.
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const job = await client.getJob({ jobId: args.basiqJobId });
        const finalStep = job.steps?.[job.steps.length - 1];
        if (finalStep?.status === "success") {
          // Basiq's job `links.source` points at the new connection.
          const src = job.links?.source;
          if (typeof src === "string") {
            const m = src.match(/connections\/([^/?]+)/);
            if (m) discoveredExternalConnectionId = m[1];
          }
          break;
        }
        if (finalStep?.status === "failed") {
          await supabase
            .from("basiq_connections")
            .update({
              status: "failed",
              last_sync_error: "consent job reported failure",
            })
            .eq("id", args.connectionId);
          return { error: "consent job failed" };
        }
        await new Promise((r) => setTimeout(r, 1_500));
      }
    }

    // If job didn't yield a connection id, fall back to listing connections
    // on the user and picking the freshest one that isn't already tracked.
    if (!discoveredExternalConnectionId) {
      const remoteConns = await client.getUserConnections({
        basiqUserId: conn.basiq_user_id,
      });
      // Exclude already-tracked externalIds to avoid re-binding to a stale row.
      const { data: existing } = await supabase
        .from("basiq_connections")
        .select("basiq_external_connection_id")
        .eq("subdivision_id", conn.subdivision_id)
        .neq("id", conn.id);
      const tracked = new Set(
        (existing ?? []).map(
          (r) => (r as { basiq_external_connection_id: string })
            .basiq_external_connection_id,
        ),
      );
      const fresh = remoteConns.find((c) => !tracked.has(c.id));
      if (!fresh) return { error: "no newly-created Basiq connection found" };
      discoveredExternalConnectionId = fresh.id;
    }

    const grantedAt = new Date();
    const expiresAt = new Date(grantedAt.getTime() + TWELVE_MONTHS_MS);

    const { error: updErr } = await supabase
      .from("basiq_connections")
      .update({
        basiq_external_connection_id: discoveredExternalConnectionId,
        status: "active",
        consent_granted_at: grantedAt.toISOString(),
        consent_expires_at: expiresAt.toISOString(),
      })
      .eq("id", args.connectionId);
    if (updErr) return { error: updErr.message };

    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: conn.subdivision_id,
      action: "basiq_connection.consent_completed",
      entity_type: "basiq_connection",
      entity_id: args.connectionId,
      after_state: {
        basiq_external_connection_id: discoveredExternalConnectionId,
        consent_granted_at: grantedAt.toISOString(),
        consent_expires_at: expiresAt.toISOString(),
      },
    });

    revalidatePath(`/subdivisions/${conn.subdivision_id}/finance/bank-account`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function getBasiqConnectionStatus(
  subdivisionId: string,
): Promise<BasiqConnectionStatusResult> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();
  const { data: rows } = await supabase
    .from("basiq_connections")
    .select(
      "id, status, institution_name, institution_short_name, last_sync_at, last_sync_error, consent_expires_at, nominated_representative_name, created_at",
    )
    .eq("subdivision_id", subdivisionId)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = rows?.[0];
  if (!row) {
    return {
      hasConnection: false,
      connectionId: null,
      status: null,
      institutionName: null,
      institutionShortName: null,
      lastSyncAt: null,
      lastSyncError: null,
      consentExpiresAt: null,
      daysUntilExpiry: null,
      nominatedRepresentativeName: null,
    };
  }
  return {
    hasConnection: true,
    connectionId: (row as { id: string }).id,
    status: (row as { status: BasiqConnectionStatus }).status,
    institutionName: (row as { institution_name: string }).institution_name,
    institutionShortName:
      (row as { institution_short_name: string | null }).institution_short_name,
    lastSyncAt: (row as { last_sync_at: string | null }).last_sync_at,
    lastSyncError: (row as { last_sync_error: string | null }).last_sync_error,
    consentExpiresAt:
      (row as { consent_expires_at: string | null }).consent_expires_at,
    daysUntilExpiry: daysUntil(
      (row as { consent_expires_at: string | null }).consent_expires_at,
    ),
    nominatedRepresentativeName:
      (row as { nominated_representative_name: string | null })
        .nominated_representative_name,
  };
}

export async function disconnectBasiqConnection(
  connectionId: string,
): Promise<{ success?: true; error?: string }> {
  try {
    const supabase = createServerClient();
    const client = getBasiqApiClient();

    const { data: conn } = await supabase
      .from("basiq_connections")
      .select("*")
      .eq("id", connectionId)
      .single();
    if (!conn) return { error: "connection not found" };

    const profile = await requireCompanyRole();
    await requireSubdivisionAccess(conn.subdivision_id);

    // Best-effort remote revoke. If Basiq returns 404 the connection is
    // already gone; still proceed to mark locally.
    try {
      await client.deleteConnection({
        basiqUserId: conn.basiq_user_id,
        connectionId: conn.basiq_external_connection_id,
      });
    } catch (e) {
      if (!(e instanceof BasiqApiError && e.category === "not_found")) {
        // Log but don't fail — we still need to reflect the local state.
        console.warn(
          `basiq disconnect: remote delete failed (${(e as Error).message})`,
        );
      }
    }

    const { error: updErr } = await supabase
      .from("basiq_connections")
      .update({
        status: "revoked",
        last_sync_error: "manually disconnected by manager",
      })
      .eq("id", connectionId);
    if (updErr) return { error: updErr.message };

    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: conn.subdivision_id,
      action: "basiq_connection.disconnected",
      entity_type: "basiq_connection",
      entity_id: connectionId,
      after_state: { status: "revoked" },
    });

    revalidatePath(
      `/subdivisions/${conn.subdivision_id}/finance/bank-account`,
    );
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function initiateReauth(
  connectionId: string,
): Promise<{ success?: { consentUrl: string }; error?: string }> {
  try {
    const supabase = createServerClient();
    const client = getBasiqApiClient();

    const { data: conn } = await supabase
      .from("basiq_connections")
      .select("*")
      .eq("id", connectionId)
      .single();
    if (!conn) return { error: "connection not found" };

    await requireCompanyRole();
    await requireSubdivisionAccess(conn.subdivision_id);

    const tok = await client.generateClientToken({
      basiqUserId: conn.basiq_user_id,
    });
    const state = issueStateToken({
      connectionId: conn.id,
      returnTo: null,
    });
    const url = buildConsentUrl({
      clientToken: tok.access_token,
      state,
      action: "reauthorise",
      connectionId: conn.basiq_external_connection_id,
    });
    return { success: { consentUrl: url } };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ============================================================================
// 2. DATA MOVEMENT
// ============================================================================

export async function forceSyncBasiqConnection(args: {
  subdivisionId: string;
  bypassRateLimit?: boolean;
}): Promise<{ success?: ForceSyncResult; error?: string }> {
  try {
    const supabase = createServerClient();
    const profile = await requireCompanyRole();
    await requireSubdivisionAccess(args.subdivisionId);

    const { data: conns } = await supabase
      .from("basiq_connections")
      .select("id, last_sync_at, status")
      .eq("subdivision_id", args.subdivisionId)
      .in("status", ["active", "syncing"]);
    if (!conns || conns.length === 0) {
      return {
        success: {
          syncedCount: 0,
          newTransactionCount: 0,
          newTransactionIds: [],
          errors: [],
          rateLimited: false,
        },
      };
    }

    if (!args.bypassRateLimit) {
      const tooRecent = (conns as { last_sync_at: string | null }[]).some(
        (c) =>
          c.last_sync_at &&
          Date.now() - new Date(c.last_sync_at).getTime() <
            FORCE_SYNC_COOLDOWN_MS,
      );
      if (tooRecent) {
        return {
          success: {
            syncedCount: 0,
            newTransactionCount: 0,
            newTransactionIds: [],
            errors: ["rate limited — sync attempted within last 30 seconds"],
            rateLimited: true,
          },
        };
      }
    }

    let totalNew = 0;
    const allIds: string[] = [];
    const errors: string[] = [];
    for (const c of conns as { id: string }[]) {
      const res = await pollBasiqConnectionInternal(c.id, profile.id);
      totalNew += res.inserted;
      if (res.error) errors.push(`${c.id}: ${res.error}`);
    }
    revalidatePath(
      `/subdivisions/${args.subdivisionId}/finance/bank-account`,
    );
    revalidatePath(
      `/subdivisions/${args.subdivisionId}/finance/reconciliation`,
    );
    return {
      success: {
        syncedCount: conns.length,
        newTransactionCount: totalNew,
        newTransactionIds: allIds,
        errors,
        rateLimited: false,
      },
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function pollBasiqConnection(
  connectionId: string,
  performedBy?: string,
): Promise<{ success?: PollResult; error?: string }> {
  try {
    // Resolve a performer id — the cron caller passes one; manager-initiated
    // callers come through requireCompanyRole.
    let performer = performedBy;
    if (!performer) {
      const profile = await requireCompanyRole();
      performer = profile.id;
    }
    const res = await pollBasiqConnectionInternal(connectionId, performer);
    return { success: res };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function pollBasiqConnectionInternal(
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

    // Resolve account mapping: match Basiq account IDs → our bank_accounts.
    const accountMap = await resolveAccountMap(
      conn.subdivision_id,
      conn.id,
      txns,
    );

    for (const tx of txns) {
      const bankAccountId = accountMap.get(tx.account);
      if (!bankAccountId) continue; // transaction on an unmapped account — skip silently

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
      if (rpcErr) continue; // skip this row, keep going
      const result = rpcRes as {
        bank_transaction_id: string;
        was_duplicate: boolean;
      };
      if (result.was_duplicate) {
        duplicates += 1;
        continue;
      }
      inserted += 1;

      // Auto-match if credit and description has an MSM-LEV reference.
      if (signed > 0 && parsed.reference) {
        const m = await tryAutoMatchByReference({
          bankTransactionId: result.bank_transaction_id,
          subdivisionId: conn.subdivision_id,
          description: parsed.cleaned_description,
          amount: signed,
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

export async function runGapReconciliation(
  connectionId: string,
): Promise<{ success?: GapReportResult; error?: string }> {
  try {
    const supabase = createServerClient();
    const { data: conn } = await supabase
      .from("basiq_connections")
      .select("*")
      .eq("id", connectionId)
      .single();
    if (!conn) return { error: "connection not found" };

    const profile = await requireCompanyRole();
    await requireSubdivisionAccess(conn.subdivision_id);

    const gapStart = conn.consent_expires_at ?? conn.last_sync_at;
    const gapEnd = new Date().toISOString();
    if (!gapStart) return { error: "no gap to reconcile — never synced" };
    const gapHours = Math.max(
      0,
      Math.round(
        (new Date(gapEnd).getTime() - new Date(gapStart).getTime()) /
          (60 * 60 * 1000),
      ),
    );

    const pollRes = await pollBasiqConnectionInternal(
      connectionId,
      profile.id,
    );

    // Count arrears notifications that went out during the gap (stub — a
    // proper implementation will query communication_log once Prompt 6
    // attaches an arrears classification).
    const arrearsDuringGap = 0;
    const committeeNotified = gapHours > COMMITTEE_NOTIFY_GAP_HOURS;

    const { data: report, error: insErr } = await supabase
      .from("basiq_gap_reports")
      .insert({
        basiq_connection_id: connectionId,
        subdivision_id: conn.subdivision_id,
        gap_start_at: gapStart,
        gap_end_at: gapEnd,
        backfilled_transaction_count: pollRes.inserted,
        auto_matched_count: pollRes.autoMatched,
        manual_review_count: pollRes.inserted - pollRes.autoMatched,
        arrears_notifications_during_gap: arrearsDuringGap,
        committee_notified: committeeNotified,
      })
      .select("id")
      .single();
    if (insErr || !report) {
      return { error: insErr?.message ?? "failed to insert gap report" };
    }

    // Suspend arrears notifications for 48 hours.
    const suppressionUntil = new Date(
      Date.now() + GAP_SUPPRESSION_HOURS * 60 * 60 * 1000,
    ).toISOString();
    await supabase.from("subdivision_notification_suppressions").insert({
      subdivision_id: conn.subdivision_id,
      suppression_type: "arrears_post_gap_reauth",
      suppressed_until: suppressionUntil,
      reason: `Gap reconciliation after ${gapHours}h outage`,
    });

    // Emails: best-effort, don't fail the flow.
    await sendGapEmails({
      subdivisionId: conn.subdivision_id,
      subdivisionName: "", // filled inside sendGapEmails
      connectionId,
      gapHours,
      backfilledCount: pollRes.inserted,
      autoMatchedCount: pollRes.autoMatched,
      manualReviewCount: pollRes.inserted - pollRes.autoMatched,
      committeeNotified,
    });

    // Gap-reconciliation notification idempotency marker.
    await supabase
      .from("basiq_reauth_notifications")
      .insert({
        basiq_connection_id: connectionId,
        notification_type: "gap_reconciliation",
        profile_id: profile.id,
      })
      .select()
      .single()
      .then(() => null, () => null); // tolerate duplicate-key

    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: conn.subdivision_id,
      action: "basiq_connection.gap_reconciled",
      entity_type: "basiq_gap_report",
      entity_id: report.id,
      after_state: {
        gap_hours: gapHours,
        backfilled: pollRes.inserted,
        auto_matched: pollRes.autoMatched,
        committee_notified: committeeNotified,
      },
    });

    return {
      success: {
        gapReportId: report.id,
        gapHours,
        backfilledCount: pollRes.inserted,
        autoMatchedCount: pollRes.autoMatched,
        manualReviewCount: pollRes.inserted - pollRes.autoMatched,
        committeeNotified,
        suppressionUntil,
      },
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function sendGapEmails(args: {
  subdivisionId: string;
  subdivisionName: string;
  connectionId: string;
  gapHours: number;
  backfilledCount: number;
  autoMatchedCount: number;
  manualReviewCount: number;
  committeeNotified: boolean;
}): Promise<void> {
  try {
    const supabase = createServerClient();
    const { data: conn } = await supabase
      .from("basiq_connections")
      .select(
        "nominated_representative_profile_id, subdivision_id, id",
      )
      .eq("id", args.connectionId)
      .single();
    const { data: sub } = await supabase
      .from("subdivisions")
      .select("name")
      .eq("id", args.subdivisionId)
      .single();
    if (!sub) return;
    const name = (sub as { name: string }).name;
    const repId =
      conn && (conn as { nominated_representative_profile_id: string | null })
        .nominated_representative_profile_id;
    if (!repId) return;
    const { data: rep } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", repId)
      .single();
    if (!rep) return;
    await sendBasiqGapReconciliationEmail({
      to: (rep as { email: string }).email,
      subdivisionName: name,
      gapHours: args.gapHours,
      backfilledCount: args.backfilledCount,
      autoMatchedCount: args.autoMatchedCount,
      manualReviewCount: args.manualReviewCount,
      reportUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/subdivisions/${args.subdivisionId}/finance/bank-account`,
    });
    if (args.committeeNotified) {
      await sendBasiqCommitteeGapNotificationEmail({
        to: (rep as { email: string }).email,
        subdivisionName: name,
        gapHours: args.gapHours,
      });
    }
  } catch (e) {
    console.error("gap email dispatch failed:", (e as Error).message);
  }
}

// ============================================================================
// 3. INSTITUTIONS
// ============================================================================

export async function listBasiqInstitutions(): Promise<BasiqInstitution[]> {
  return await listBasiqInstitutionsInternal();
}

async function listBasiqInstitutionsInternal(): Promise<BasiqInstitution[]> {
  if (
    _institutionCache &&
    Date.now() - _institutionCache.at < INSTITUTION_CACHE_MS
  ) {
    return _institutionCache.data;
  }
  const client = getBasiqApiClient();
  const data = await client.listInstitutions();
  _institutionCache = { at: Date.now(), data };
  return data;
}

// ============================================================================
// 4. REAUTH NOTIFICATIONS
// ============================================================================

export async function sendPendingReauthNotifications(): Promise<{
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

    // Idempotency guard
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

// Called by hourly-expiry-check scheduled task.
export async function sweepExpiredConnections(): Promise<{
  expiredCount: number;
}> {
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("basiq_connections")
    .select("id, nominated_representative_profile_id, subdivision_id")
    .eq("status", "active")
    .lte("consent_expires_at", nowIso);
  if (!due || due.length === 0) return { expiredCount: 0 };

  let count = 0;
  for (const row of due as {
    id: string;
    nominated_representative_profile_id: string | null;
    subdivision_id: string;
  }[]) {
    const { error } = await supabase.rpc(
      "rpc_mark_basiq_connection_expired",
      {
        p_basiq_connection_id: row.id,
        p_reason: "12-month CDR consent expired",
        p_performed_by:
          row.nominated_representative_profile_id ?? row.id,
      },
    );
    if (error) continue;
    count += 1;

    // Send an expired email (best effort).
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

// ============================================================================
// 5. ARREARS SUPPRESSION (read, used by Prompt 6 flows)
// ============================================================================

export async function isArrearsNotificationSuppressed(
  subdivisionId: string,
): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("subdivision_notification_suppressions")
    .select("id")
    .eq("subdivision_id", subdivisionId)
    .eq("suppression_type", "arrears_post_gap_reauth")
    .gt("suppressed_until", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  return !!data;
}

// ============================================================================
// 6. DIAGNOSTIC VIEW
// ============================================================================

export async function getBasiqConnectionDetails(
  connectionId: string,
): Promise<BasiqConnectionDetail | null> {
  const supabase = createServerClient();
  const { data: conn } = await supabase
    .from("basiq_connections")
    .select("*")
    .eq("id", connectionId)
    .single();
  if (!conn) return null;

  await requireSubdivisionAccess(conn.subdivision_id);

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("basiq_connection_id", connectionId);

  return {
    id: conn.id,
    subdivisionId: conn.subdivision_id,
    basiqUserId: conn.basiq_user_id,
    basiqExternalConnectionId: conn.basiq_external_connection_id,
    basiqInstitutionId: conn.basiq_institution_id,
    institutionName: conn.institution_name,
    institutionShortName: conn.institution_short_name,
    status: conn.status,
    consentGrantedAt: conn.consent_granted_at,
    consentExpiresAt: conn.consent_expires_at,
    lastSyncAt: conn.last_sync_at,
    lastSyncError: conn.last_sync_error,
    lastWebhookReceivedAt: conn.last_webhook_received_at,
    nominatedRepresentativeName: conn.nominated_representative_name,
    nominatedRepresentativeProfileId:
      conn.nominated_representative_profile_id,
    createdAt: conn.created_at,
    createdBy: conn.created_by,
    linkedBankAccountIds: (accounts ?? []).map(
      (a) => (a as { id: string }).id,
    ),
  };
}

// ============================================================================
// 7. WEBHOOK EVENT DISPATCHER
// ============================================================================

export async function handleBasiqEvent(args: {
  eventType: string;
  payload: unknown;
}): Promise<{ handled: boolean; reason?: string }> {
  if (!(BASIQ_WEBHOOK_EVENTS as readonly string[]).includes(args.eventType)) {
    return { handled: false, reason: "unknown event type" };
  }
  const eventType = args.eventType as BasiqWebhookEvent;
  const supabase = createServerClient();

  // Extract basiq external connection id from common payload shapes.
  const ext = extractExternalConnectionId(args.payload);
  const nowIso = new Date().toISOString();

  // Record the webhook receipt timestamp regardless.
  if (ext) {
    await supabase
      .from("basiq_connections")
      .update({ last_webhook_received_at: nowIso })
      .eq("basiq_external_connection_id", ext);
  }

  switch (eventType) {
    case "transactions.updated": {
      if (!ext) return { handled: false, reason: "no connection id" };
      const { data: row } = await supabase
        .from("basiq_connections")
        .select("id, nominated_representative_profile_id, created_by")
        .eq("basiq_external_connection_id", ext)
        .maybeSingle();
      if (!row) return { handled: false, reason: "connection not tracked" };
      const performer =
        (row as { nominated_representative_profile_id: string | null })
          .nominated_representative_profile_id ??
        (row as { created_by: string }).created_by;
      await pollBasiqConnectionInternal(
        (row as { id: string }).id,
        performer,
      );
      return { handled: true };
    }

    case "connection.invalidated": {
      if (!ext) return { handled: false, reason: "no connection id" };
      const { data: row } = await supabase
        .from("basiq_connections")
        .select("id, basiq_user_id, subdivision_id, created_by")
        .eq("basiq_external_connection_id", ext)
        .maybeSingle();
      if (!row) return { handled: false, reason: "connection not tracked" };
      // Inspect current remote status to decide: expired, revoked, or failed.
      let remoteStatus = "unknown";
      try {
        const remote = await getBasiqApiClient().getConnection({
          basiqUserId: (row as { basiq_user_id: string }).basiq_user_id,
          connectionId: ext,
        });
        remoteStatus = remote.status.toLowerCase();
      } catch {
        // ignore — fall through to revoked as the safest assumption
      }
      const localStatus: BasiqConnectionStatus =
        remoteStatus.includes("expired")
          ? "expired"
          : remoteStatus.includes("invalid") ||
              remoteStatus.includes("disconnected") ||
              remoteStatus.includes("revoked")
            ? "revoked"
            : "failed";
      await supabase
        .from("basiq_connections")
        .update({
          status: localStatus,
          last_sync_error: `connection.invalidated (remote status: ${remoteStatus})`,
        })
        .eq("id", (row as { id: string }).id);

      await supabase.from("audit_log").insert({
        profile_id: (row as { created_by: string }).created_by,
        subdivision_id: (row as { subdivision_id: string }).subdivision_id,
        action: "basiq_connection.invalidated",
        entity_type: "basiq_connection",
        entity_id: (row as { id: string }).id,
        metadata: { remote_status: remoteStatus, new_status: localStatus },
      });
      return { handled: true };
    }

    case "account.updated": {
      // Metadata change (bank name, type) — no financial impact. Prompt 6/7
      // may surface it if we add per-account display details.
      return { handled: true };
    }
  }
}

function extractExternalConnectionId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  // Probe common Basiq payload shapes.
  const p = payload as Record<string, unknown>;
  const candidates = [
    p.connectionId,
    p.connection,
    (p.data as Record<string, unknown> | undefined)?.connectionId,
    (p.data as Record<string, unknown> | undefined)?.connection,
    (p.data as Record<string, unknown> | undefined)?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

// ============================================================================
// 8. INTERNAL: parse + test helpers (keep re-exports minimal)
// ============================================================================

export async function revalidateSidebarForBasiqSubdivision(
  subdivisionId: string,
): Promise<void> {
  await revalidateSidebarForSubdivision(subdivisionId);
}

// Re-export the transaction schema so the webhook route can validate
// incoming payloads without pulling validations/basiq.ts directly.
export async function parseBasiqTransactionPayload(
  raw: unknown,
): Promise<BasiqTransactionPayload | null> {
  const res = basiqTransactionPayloadSchema.safeParse(raw);
  return res.success ? res.data : null;
}
