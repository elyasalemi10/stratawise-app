import { NextResponse } from "next/server";
import {
  autoBindBankAccountsForConnection,
  completeBasiqConsent,
  runGapReconciliation,
} from "@/lib/actions/basiq";
import { verifyStateToken } from "@/lib/basiq/state";
import { createServerClient } from "@/lib/supabase";
import { buildOCUrl } from "@/lib/oc-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/basiq/callback
// ----------------------------------------------------------------------------
// Basiq redirects the manager here after the Consent UI resolves. Two flows
// land on this endpoint:
//   1. First-time consent — triggers completeBasiqConsent → marks connection
//      'active' and records the 12-month expiry.
//   2. Reauthorise (post-expiry or manager-initiated) — triggers
//      completeBasiqConsent AND runGapReconciliation for the gap between
//      the old expiry and now.
//
// We distinguish via the state token's payload (issued by initiateReauth vs
// startBasiqConsent). If the pending connection row was already 'expired'
// or 'revoked', it's a reauth and we run gap reconciliation.
// ============================================================================

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const rawState = url.searchParams.get("state");
  const jobId = url.searchParams.get("jobId");

  if (!rawState) {
    return NextResponse.redirect(
      new URL("/?basiq=missing_state", url.origin),
    );
  }

  const stateRes = verifyStateToken(rawState);
  if (!stateRes.valid) {
    return NextResponse.redirect(
      new URL(`/?basiq=state_invalid&reason=${encodeURIComponent(stateRes.reason)}`, url.origin),
    );
  }
  const { connectionId, returnTo } = stateRes.state;

  // Determine whether this is a reauth flow by checking the current state
  // of the connection row BEFORE completeBasiqConsent mutates it.
  const supabase = createServerClient();
  const { data: priorConn } = await supabase
    .from("basiq_connections")
    .select("status, oc_id")
    .eq("id", connectionId)
    .single();
  const wasReauth =
    priorConn &&
    (priorConn.status === "expired" ||
      priorConn.status === "revoked" ||
      priorConn.status === "failed");

  const completion = await completeBasiqConsent({
    connectionId,
    basiqJobId: jobId,
  });
  if (completion.error) {
    const target =
      returnTo ??
      (priorConn
        ? ((await buildOCUrl(priorConn.oc_id, "/bank-account")) ?? "/")
        : "/");
    const sep = target.includes("?") ? "&" : "?";
    return NextResponse.redirect(
      new URL(
        `${target}${sep}basiq=error&message=${encodeURIComponent(completion.error)}`,
        url.origin,
      ),
    );
  }

  // Auto-bind any matching bank_accounts (BSB + account_number) to the new
  // connection. Failures are swallowed — the manager can still bind manually
  // from the bank-account page.
  await autoBindBankAccountsForConnection(connectionId).catch(() => null);

  if (wasReauth) {
    // Best-effort; gap reconciliation failures don't break the callback.
    await runGapReconciliation(connectionId).catch(() => null);
  }

  const target =
    returnTo ??
    (priorConn
      ? `/ocs/${priorConn.oc_id}/bank-account`
      : "/");
  const sep = target.includes("?") ? "&" : "?";
  return NextResponse.redirect(
    new URL(`${target}${sep}basiq=connected`, url.origin),
  );
}
