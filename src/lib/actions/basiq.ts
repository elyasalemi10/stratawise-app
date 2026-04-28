"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidateSidebarForSubdivision } from "./subdivision";
import {
  BasiqApiError,
  getBasiqApiClient,
} from "@/lib/basiq/client";
import { issueStateToken } from "@/lib/basiq/state";
import {
  pollConnectionAsSystem,
  sendPendingReauthNotificationsJob,
  sweepExpiredConnectionsJob,
} from "@/lib/basiq/jobs";
import {
  sendBasiqCommitteeGapNotificationEmail,
  sendBasiqGapReconciliationEmail,
} from "@/lib/email";
import {
  BASIQ_WEBHOOK_EVENTS,
  basiqTransactionPayloadSchema,
  startBasiqConsentSchema,
  type BasiqConnectionDetail,
  type BasiqConnectionStatus,
  type BasiqConnectionStatusResult,
  type BasiqInstitution,
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

    revalidatePath(`/subdivisions/${conn.subdivision_id}/bank-account`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export interface BasiqConnectionListItem {
  id: string;
  status: BasiqConnectionStatus;
  institutionName: string;
  institutionShortName: string | null;
  institutionId: string;
  consentExpiresAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface WizardBankAccountRow {
  id: string;
  accountName: string;
  fundType: "administrative" | "capital_works";
  bsb: string;
  accountNumber: string;
  bankName: string | null;
  basiqConnectionId: string | null;
  basiqAccountId: string | null;
  createdAt: string;
}

export async function getBankAccountsForWizardStep(
  subdivisionId: string,
): Promise<WizardBankAccountRow[]> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select(
      "id, account_name, fund_type, bsb, account_number, bank_name, basiq_connection_id, basiq_account_id, created_at",
    )
    .eq("subdivision_id", subdivisionId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => {
    const row = r as {
      id: string;
      account_name: string;
      fund_type: "administrative" | "capital_works";
      bsb: string;
      account_number: string;
      bank_name: string | null;
      basiq_connection_id: string | null;
      basiq_account_id: string | null;
      created_at: string;
    };
    return {
      id: row.id,
      accountName: row.account_name,
      fundType: row.fund_type,
      bsb: row.bsb,
      accountNumber: row.account_number,
      bankName: row.bank_name,
      basiqConnectionId: row.basiq_connection_id,
      basiqAccountId: row.basiq_account_id,
      createdAt: row.created_at,
    };
  });
}

export async function listBasiqConnectionsForSubdivision(
  subdivisionId: string,
): Promise<BasiqConnectionListItem[]> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();
  const { data } = await supabase
    .from("basiq_connections")
    .select(
      "id, status, institution_name, institution_short_name, basiq_institution_id, consent_expires_at, last_sync_at, created_at",
    )
    .eq("subdivision_id", subdivisionId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => {
    const row = r as {
      id: string;
      status: BasiqConnectionStatus;
      institution_name: string;
      institution_short_name: string | null;
      basiq_institution_id: string;
      consent_expires_at: string | null;
      last_sync_at: string | null;
      created_at: string;
    };
    return {
      id: row.id,
      status: row.status,
      institutionName: row.institution_name,
      institutionShortName: row.institution_short_name,
      institutionId: row.basiq_institution_id,
      consentExpiresAt: row.consent_expires_at,
      lastSyncAt: row.last_sync_at,
      createdAt: row.created_at,
    };
  });
}

// ── Feed-state for a single bank account (bank-account page panel) ──────

export type FeedPanelState =
  | "not_connected"
  | "active"
  | "expiring_soon"
  | "expired"
  | "revoked"
  | "failed"
  | "syncing"
  | "pending";

export interface FeedPanelResult {
  state: FeedPanelState;
  connection: {
    id: string;
    institutionName: string;
    institutionShortName: string | null;
    institutionId: string;
    consentGrantedAt: string | null;
    consentExpiresAt: string | null;
    daysUntilExpiry: number | null;
    lastSyncAt: string | null;
    lastSyncError: string | null;
    nominatedRepresentativeName: string | null;
  } | null;
  linkedBankAccounts: Array<{
    id: string;
    accountName: string;
    fundType: "administrative" | "capital_works";
  }>;
}

export async function getFeedStateForBankAccount(
  bankAccountId: string,
): Promise<FeedPanelResult> {
  const supabase = createServerClient();
  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, subdivision_id, basiq_connection_id")
    .eq("id", bankAccountId)
    .single();
  if (!account) {
    return {
      state: "not_connected",
      connection: null,
      linkedBankAccounts: [],
    };
  }
  await requireSubdivisionAccess(account.subdivision_id);

  if (!account.basiq_connection_id) {
    return {
      state: "not_connected",
      connection: null,
      linkedBankAccounts: [],
    };
  }

  const { data: conn } = await supabase
    .from("basiq_connections")
    .select(
      "id, status, institution_name, institution_short_name, basiq_institution_id, consent_granted_at, consent_expires_at, last_sync_at, last_sync_error, nominated_representative_name",
    )
    .eq("id", account.basiq_connection_id)
    .single();
  if (!conn) {
    return {
      state: "not_connected",
      connection: null,
      linkedBankAccounts: [],
    };
  }

  const { data: siblings } = await supabase
    .from("bank_accounts")
    .select("id, account_name, fund_type")
    .eq("basiq_connection_id", conn.id)
    .order("created_at", { ascending: true });

  const state = deriveFeedState(conn.status, conn.consent_expires_at);
  const daysUntilExpiry = conn.consent_expires_at
    ? Math.floor(
        (new Date(conn.consent_expires_at).getTime() - Date.now()) /
          (24 * 60 * 60 * 1000),
      )
    : null;

  return {
    state,
    connection: {
      id: conn.id,
      institutionName: conn.institution_name,
      institutionShortName: conn.institution_short_name,
      institutionId: conn.basiq_institution_id,
      consentGrantedAt: conn.consent_granted_at,
      consentExpiresAt: conn.consent_expires_at,
      daysUntilExpiry,
      lastSyncAt: conn.last_sync_at,
      lastSyncError: conn.last_sync_error,
      nominatedRepresentativeName: conn.nominated_representative_name,
    },
    linkedBankAccounts: (siblings ?? []).map((s) => {
      const row = s as {
        id: string;
        account_name: string;
        fund_type: "administrative" | "capital_works";
      };
      return {
        id: row.id,
        accountName: row.account_name,
        fundType: row.fund_type,
      };
    }),
  };
}

function deriveFeedState(
  status: BasiqConnectionStatus,
  consentExpiresAt: string | null,
): FeedPanelState {
  if (status === "pending") return "pending";
  if (status === "expired") return "expired";
  if (status === "revoked") return "revoked";
  if (status === "failed") return "failed";
  if (status === "syncing") return "syncing";
  // status === 'active' — refine by expiry window
  if (consentExpiresAt) {
    const diffMs = new Date(consentExpiresAt).getTime() - Date.now();
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (days < 0) return "expired";
    if (days <= 30) return "expiring_soon";
  }
  return "active";
}

// ── Release a single bank_account from its connection (for Reconnect) ───
// Nulls the FK without touching the basiq_connections row (keeps audit).

export async function releaseBankAccountFromConnection(
  bankAccountId: string,
): Promise<{ success?: true; error?: string }> {
  try {
    const supabase = createServerClient();
    const { data: acct } = await supabase
      .from("bank_accounts")
      .select("subdivision_id")
      .eq("id", bankAccountId)
      .single();
    if (!acct) return { error: "bank account not found" };
    const profile = await requireCompanyRole();
    await requireSubdivisionAccess(acct.subdivision_id);

    const { error } = await supabase
      .from("bank_accounts")
      .update({ basiq_connection_id: null, basiq_account_id: null })
      .eq("id", bankAccountId);
    if (error) return { error: error.message };

    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: acct.subdivision_id,
      action: "bank_account.released_from_basiq_connection",
      entity_type: "bank_account",
      entity_id: bankAccountId,
      metadata: { reason: "manual reconnect" },
    });

    revalidatePath(`/subdivisions/${acct.subdivision_id}/bank-account`);
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
      `/subdivisions/${conn.subdivision_id}/bank-account`,
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
      const res = await pollConnectionAsSystem(c.id, profile.id);
      totalNew += res.inserted;
      if (res.error) errors.push(`${c.id}: ${res.error}`);
    }
    revalidatePath(
      `/subdivisions/${args.subdivisionId}/bank-account`,
    );
    revalidatePath(
      `/subdivisions/${args.subdivisionId}/reconciliation`,
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
): Promise<{ success?: PollResult; error?: string }> {
  // Server-action entry: always requires auth. Cron-invoked callers must
  // import pollConnectionAsSystem from src/lib/basiq/jobs.ts directly —
  // that path is framework-agnostic and expects an explicit performer.
  try {
    const supabase = createServerClient();
    const { data: conn } = await supabase
      .from("basiq_connections")
      .select("subdivision_id")
      .eq("id", connectionId)
      .single();
    if (!conn) return { error: "connection not found" };

    const profile = await requireCompanyRole();
    await requireSubdivisionAccess(conn.subdivision_id);

    const res = await pollConnectionAsSystem(connectionId, profile.id);
    return { success: res };
  } catch (e) {
    return { error: (e as Error).message };
  }
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

    const pollRes = await pollConnectionAsSystem(connectionId, profile.id);

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
      reportUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/subdivisions/${args.subdivisionId}/bank-account`,
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
// 3. ACCOUNT AUTO-BIND
// ============================================================================

// After consent completes, Basiq's single consent may expose several
// accounts (admin + capital at the same bank login). This action matches
// Basiq's reported accounts to our bank_accounts rows by normalised BSB +
// account_number and binds the matches.
//
// Match key: digits-only concatenation of BSB and account_number. Basiq's
// accountNumber field varies by institution — some include the BSB prefix,
// some don't. We normalise both sides and match on the longest suffix that
// aligns.
export async function autoBindBankAccountsForConnection(
  connectionId: string,
): Promise<{
  success?: {
    totalMatched: number;
    boundBankAccountIds: string[];
  };
  error?: string;
}> {
  try {
    const supabase = createServerClient();
    const client = getBasiqApiClient();

    const { data: conn } = await supabase
      .from("basiq_connections")
      .select(
        "id, subdivision_id, basiq_user_id, basiq_external_connection_id",
      )
      .eq("id", connectionId)
      .single();
    if (!conn) return { error: "connection not found" };

    // Fetch all Basiq accounts for this user+connection.
    const basiqAccounts = await client.getAccounts({
      basiqUserId: conn.basiq_user_id,
      connectionId: conn.basiq_external_connection_id,
    });

    // Fetch all bank_accounts for this subdivision that aren't yet bound.
    const { data: ourAccounts } = await supabase
      .from("bank_accounts")
      .select("id, bsb, account_number, basiq_connection_id")
      .eq("subdivision_id", conn.subdivision_id);
    const unbound = (ourAccounts ?? []).filter(
      (a) =>
        !(a as { basiq_connection_id: string | null }).basiq_connection_id,
    );

    const bound: string[] = [];
    for (const basiqAcct of basiqAccounts) {
      const key = buildStrictBankKey(basiqAcct.bsb, basiqAcct.accountNumber);
      if (!key) continue; // Not enough Basiq info to form a safe key — skip
      const match = unbound.find((a) => {
        const ours = buildStrictBankKey(
          (a as { bsb: string }).bsb,
          (a as { account_number: string }).account_number,
        );
        return ours !== null && ours === key;
      });
      if (!match) continue;

      const { error: updErr } = await supabase
        .from("bank_accounts")
        .update({
          basiq_connection_id: conn.id,
          basiq_account_id: basiqAcct.id,
        })
        .eq("id", (match as { id: string }).id);
      if (!updErr) {
        bound.push((match as { id: string }).id);
      }
    }

    return {
      success: {
        totalMatched: bound.length,
        boundBankAccountIds: bound,
      },
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Build a strict 6-digit-BSB + account-number key. Both inputs are
// normalised to digits only. Matching requires the full BSB to be known on
// both sides — we never match on account-number alone, even if the suffix
// looks the same, because two different branches (or banks) can legally
// issue the same tail digits. If Basiq gives us accountNumber with the BSB
// already prefixed (some AU connectors do this), we split off the first 6
// digits as the BSB. If we can't reconstruct a 6-digit BSB for either side,
// we skip — the manager can bind manually on the bank-account page.
function buildStrictBankKey(
  bsb: string | null | undefined,
  accountNumber: string | null | undefined,
): string | null {
  const digitsBsb = (bsb ?? "").replace(/\D/g, "");
  const digitsAcc = (accountNumber ?? "").replace(/\D/g, "");

  if (digitsBsb.length === 6 && digitsAcc.length >= 1) {
    // Strip accidental BSB prefix from accountNumber if present.
    const acc = digitsAcc.startsWith(digitsBsb)
      ? digitsAcc.slice(digitsBsb.length)
      : digitsAcc;
    if (acc.length === 0) return null;
    return `${digitsBsb}${acc}`;
  }

  // BSB absent: attempt to split from accountNumber if it's long enough to
  // contain a 6-digit BSB prefix.
  if (!digitsBsb && digitsAcc.length >= 7) {
    return digitsAcc;
  }

  return null;
}

// ============================================================================
// 4. INSTITUTIONS
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
  // Thin delegate — real work is in src/lib/basiq/jobs.ts so Trigger.dev
  // can invoke it directly without crossing the "use server" boundary.
  return await sendPendingReauthNotificationsJob();
}

// Called by hourly-expiry-check scheduled task.
export async function sweepExpiredConnections(): Promise<{
  expiredCount: number;
}> {
  return await sweepExpiredConnectionsJob();
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
    .select("id, account_name, fund_type")
    .eq("basiq_connection_id", connectionId)
    .order("created_at", { ascending: true });

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
    linkedBankAccounts: (accounts ?? []).map((a) => {
      const row = a as {
        id: string;
        account_name: string;
        fund_type: "administrative" | "capital_works";
      };
      return {
        id: row.id,
        accountName: row.account_name,
        fundType: row.fund_type,
      };
    }),
  };
}

// ============================================================================
// 6b. GAP REPORT reads + dismissal
// ============================================================================

export interface GapReportBannerData {
  id: string;
  gapStartAt: string;
  gapEndAt: string;
  gapDurationHours: number;
  backfilledTransactionCount: number;
  autoMatchedCount: number;
  manualReviewCount: number;
  suppressionUntil: string | null;
}

export async function getActiveGapReportForSubdivision(
  subdivisionId: string,
): Promise<GapReportBannerData | null> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("basiq_gap_reports")
    .select(
      "id, gap_start_at, gap_end_at, gap_duration_hours, backfilled_transaction_count, auto_matched_count, manual_review_count",
    )
    .eq("subdivision_id", subdivisionId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  // Also fetch the current arrears suppression expiry (the banner tells the
  // manager when arrears notifications resume).
  const { data: suppression } = await supabase
    .from("subdivision_notification_suppressions")
    .select("suppressed_until")
    .eq("subdivision_id", subdivisionId)
    .eq("suppression_type", "arrears_post_gap_reauth")
    .gt("suppressed_until", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as {
    id: string;
    gap_start_at: string;
    gap_end_at: string;
    gap_duration_hours: number;
    backfilled_transaction_count: number;
    auto_matched_count: number;
    manual_review_count: number;
  };
  return {
    id: row.id,
    gapStartAt: row.gap_start_at,
    gapEndAt: row.gap_end_at,
    gapDurationHours: row.gap_duration_hours,
    backfilledTransactionCount: row.backfilled_transaction_count,
    autoMatchedCount: row.auto_matched_count,
    manualReviewCount: row.manual_review_count,
    suppressionUntil:
      (suppression as { suppressed_until?: string } | null)?.suppressed_until ??
      null,
  };
}

export interface GapReportPageData {
  report: {
    id: string;
    subdivisionId: string;
    connectionId: string;
    institutionName: string;
    nominatedRepresentativeName: string | null;
    gapStartAt: string;
    gapEndAt: string;
    gapDurationHours: number;
    backfilledTransactionCount: number;
    autoMatchedCount: number;
    manualReviewCount: number;
    arrearsNotificationsDuringGap: number;
    committeeNotified: boolean;
    dismissedAt: string | null;
    createdAt: string;
  };
  suppressionUntil: string | null;
  transactions: Array<{
    id: string;
    transactionDate: string;
    amount: number;
    description: string | null;
    matchStatus: string;
    bankAccountId: string;
  }>;
}

export async function getGapReportPageData(
  reportId: string,
  subdivisionId: string,
): Promise<GapReportPageData | null> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: report } = await supabase
    .from("basiq_gap_reports")
    .select("*")
    .eq("id", reportId)
    .eq("subdivision_id", subdivisionId) // scope guard — 404 if wrong subdivision
    .single();
  if (!report) return null;

  const { data: conn } = await supabase
    .from("basiq_connections")
    .select(
      "id, institution_name, nominated_representative_name",
    )
    .eq("id", report.basiq_connection_id)
    .single();

  // Backfilled transactions = source='basiq', transaction_date within gap
  // window, on a bank_account linked to the gap report's connection.
  const { data: accountIds } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("subdivision_id", subdivisionId)
    .eq("basiq_connection_id", report.basiq_connection_id);
  const ids = (accountIds ?? []).map((a) => (a as { id: string }).id);

  let transactions: GapReportPageData["transactions"] = [];
  if (ids.length > 0) {
    const { data: txRows } = await supabase
      .from("bank_transactions")
      .select(
        "id, transaction_date, amount, description, match_status, bank_account_id",
      )
      .eq("source", "basiq")
      .in("bank_account_id", ids)
      .gte("transaction_date", report.gap_start_at.slice(0, 10))
      .lte("transaction_date", report.gap_end_at.slice(0, 10))
      .order("transaction_date", { ascending: false });
    transactions = (txRows ?? []).map((r) => {
      const row = r as {
        id: string;
        transaction_date: string;
        amount: string | number;
        description: string | null;
        match_status: string;
        bank_account_id: string;
      };
      return {
        id: row.id,
        transactionDate: row.transaction_date,
        amount: Number(row.amount),
        description: row.description,
        matchStatus: row.match_status,
        bankAccountId: row.bank_account_id,
      };
    });
  }

  const { data: suppression } = await supabase
    .from("subdivision_notification_suppressions")
    .select("suppressed_until")
    .eq("subdivision_id", subdivisionId)
    .eq("suppression_type", "arrears_post_gap_reauth")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    report: {
      id: report.id,
      subdivisionId: report.subdivision_id,
      connectionId: report.basiq_connection_id,
      institutionName:
        (conn as { institution_name?: string } | null)?.institution_name ??
        "—",
      nominatedRepresentativeName:
        (conn as { nominated_representative_name?: string | null } | null)
          ?.nominated_representative_name ?? null,
      gapStartAt: report.gap_start_at,
      gapEndAt: report.gap_end_at,
      gapDurationHours: report.gap_duration_hours,
      backfilledTransactionCount: report.backfilled_transaction_count,
      autoMatchedCount: report.auto_matched_count,
      manualReviewCount: report.manual_review_count,
      arrearsNotificationsDuringGap: report.arrears_notifications_during_gap ?? 0,
      committeeNotified: !!report.committee_notified,
      dismissedAt: report.dismissed_at,
      createdAt: report.created_at,
    },
    suppressionUntil:
      (suppression as { suppressed_until?: string } | null)?.suppressed_until ??
      null,
    transactions,
  };
}

export async function dismissGapReport(
  reportId: string,
): Promise<{ success?: true; error?: string }> {
  try {
    const supabase = createServerClient();
    const { data: report } = await supabase
      .from("basiq_gap_reports")
      .select("subdivision_id, dismissed_at")
      .eq("id", reportId)
      .single();
    if (!report) return { error: "gap report not found" };
    if (report.dismissed_at) return { success: true }; // idempotent

    const profile = await requireCompanyRole();
    await requireSubdivisionAccess(report.subdivision_id);

    const { error } = await supabase
      .from("basiq_gap_reports")
      .update({
        dismissed_at: new Date().toISOString(),
        dismissed_by: profile.id,
      })
      .eq("id", reportId);
    if (error) return { error: error.message };

    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: report.subdivision_id,
      action: "basiq_gap_report.dismissed",
      entity_type: "basiq_gap_report",
      entity_id: reportId,
    });

    revalidatePath(
      `/subdivisions/${report.subdivision_id}/bank-account`,
    );
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
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
      await pollConnectionAsSystem(
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
