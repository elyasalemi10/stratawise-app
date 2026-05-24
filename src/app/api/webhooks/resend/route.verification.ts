/**
 * Resend webhook verification (PP6-C-2).
 *
 * Constructs valid svix signatures locally with a test secret, posts mock
 * Resend events to the route handler via direct function call (no HTTP
 * layer), and asserts side effects on communication_log + audit_log +
 * notification_preferences directly.
 *
 * Usage:
 *   npx tsx src/app/api/webhooks/resend/route.verification.ts
 *   npx tsx src/app/api/webhooks/resend/route.verification.ts --no-cleanup
 *   npx tsx src/app/api/webhooks/resend/route.verification.ts --cleanup
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// Force a deterministic secret BEFORE the route handler imports it.
const TEST_WEBHOOK_SECRET = "whsec_aGVsbG93b3JsZHRlc3RzZWNyZXR2ZXJpZnkxMjM=";
process.env.RESEND_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { Webhook } from "svix";
import { POST as resendWebhookPOST } from "./route";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const VERIFY_MARKER = "__VERIFY_RESEND__";
const supabase = createClient(supabaseUrl, serviceRoleKey);

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " , " + detail : ""}`);
}

// ─── svix request fabrication ──────────────────────────────────────────

const wh = new Webhook(TEST_WEBHOOK_SECRET);

interface MockEvent {
  type: string;
  data: { email_id: string;[k: string]: unknown };
  created_at?: string;
}

function buildSignedRequest(event: MockEvent, opts: { tamperSig?: boolean } = {}): Request {
  const id = `msg_${randomUUID()}`;
  const timestamp = new Date();
  const body = JSON.stringify(event);
  let signature = wh.sign(id, timestamp, body);
  if (opts.tamperSig) signature = signature.replace(/.$/, "x");
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: {
      "svix-id": id,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": signature,
      "content-type": "application/json",
    },
    body,
  });
}

// ─── Fixture builders ──────────────────────────────────────────────────

interface FixtureContext {
  companyId: string;
  managerProfileId: string;
  ocId: string;
  ownerProfileId: string;
}

async function createFixture(): Promise<FixtureContext> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 6)}`;

  const { data: company } = await supabase
    .from("management_companies")
    .insert({ name: `${VERIFY_MARKER}${runId}` })
    .select("id")
    .single();
  const companyId = (company as { id: string }).id;

  const { data: manager } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: `${VERIFY_MARKER}_MGR_${runId}`,
      email: `${VERIFY_MARKER.toLowerCase()}${runId}_mgr@resend.test`,
      first_name: "Resend",
      last_name: "TestMgr",
      role: "strata_manager",
      company_role: "admin",
      management_company_id: companyId,
    })
    .select("id")
    .single();
  const managerProfileId = (manager as { id: string }).id;

  const { data: owner } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: `${VERIFY_MARKER}_OWNER_${runId}`,
      email: `${VERIFY_MARKER.toLowerCase()}${runId}_owner@resend.test`,
      first_name: "Resend",
      last_name: "TestOwner",
      role: "lot_owner",
    })
    .select("id")
    .single();
  const ownerProfileId = (owner as { id: string }).id;

  const { data: sub } = await supabase
    .from("owners_corporations")
    .insert({
      management_company_id: companyId,
      name: `${VERIFY_MARKER}${runId}`,
      plan_number: `PLAN-${runId}`,
      short_code: `R${runId.slice(-7).toUpperCase()}`,
      address: `${runId} Resend Test St, Melbourne VIC 3000`,
      total_lots: 1,
      created_by: managerProfileId,
    })
    .select("id")
    .single();
  const ocId = (sub as { id: string }).id;

  return { companyId, managerProfileId, ocId, ownerProfileId };
}

interface CommLogFixture {
  logId: string;
  externalId: string;
}

async function createQueuedLog(
  ctx: FixtureContext,
  status: "queued" | "sent" | "delivered" | "opened" | "bounced" = "sent",
  type = "payment_received",
): Promise<CommLogFixture> {
  const externalId = `re_${randomUUID()}`;
  const { data } = await supabase
    .from("communication_log")
    .insert({
      oc_id: ctx.ocId,
      recipient_id: ctx.ownerProfileId,
      recipient_email: `inbox@${VERIFY_MARKER.toLowerCase()}.test`,
      channel: "email",
      type,
      subject: "Resend webhook fixture",
      body_preview: "Resend webhook fixture",
      status,
      external_id: externalId,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return { logId: (data as { id: string }).id, externalId };
}

// ─── Scenarios ─────────────────────────────────────────────────────────

async function w1_validDelivered(ctx: FixtureContext) {
  const fx = await createQueuedLog(ctx, "sent");
  const req = buildSignedRequest({
    type: "email.delivered",
    data: { email_id: fx.externalId },
  });
  const res = await resendWebhookPOST(req as never);
  const { data: row } = await supabase
    .from("communication_log")
    .select("status, delivered_at")
    .eq("id", fx.logId)
    .single();
  const r = row as { status: string; delivered_at: string | null };
  record(
    "W-1: valid signature + email.delivered → status='delivered', delivered_at stamped",
    res.status === 200 && r.status === "delivered" && r.delivered_at !== null,
    `http=${res.status} status=${r.status} delivered_at=${r.delivered_at ? "set" : "null"}`,
  );
}

async function w2_validOpened(ctx: FixtureContext) {
  const fx = await createQueuedLog(ctx, "delivered");
  const req = buildSignedRequest({
    type: "email.opened",
    data: { email_id: fx.externalId },
  });
  const res = await resendWebhookPOST(req as never);
  const { data: row } = await supabase
    .from("communication_log")
    .select("status, opened_at")
    .eq("id", fx.logId)
    .single();
  const r = row as { status: string; opened_at: string | null };
  record(
    "W-2: valid signature + email.opened → status='opened', opened_at stamped",
    res.status === 200 && r.status === "opened" && r.opened_at !== null,
    `http=${res.status} status=${r.status} opened_at=${r.opened_at ? "set" : "null"}`,
  );
}

async function w3_validBounced(ctx: FixtureContext) {
  const fx = await createQueuedLog(ctx, "sent");
  const req = buildSignedRequest({
    type: "email.bounced",
    data: {
      email_id: fx.externalId,
      bounce: {
        type: "Permanent",
        subType: "General",
        message: "The email account that you tried to reach does not exist.",
      },
    },
  });
  const res = await resendWebhookPOST(req as never);
  const { data: row } = await supabase
    .from("communication_log")
    .select("status, error_message")
    .eq("id", fx.logId)
    .single();
  const r = row as { status: string; error_message: string | null };
  record(
    "W-3: valid signature + email.bounced → status='bounced', error_message stamped",
    res.status === 200 && r.status === "bounced" && !!r.error_message && r.error_message.includes("does not exist"),
    `http=${res.status} status=${r.status} msg="${r.error_message?.slice(0, 60)}..."`,
  );
}

async function w4_validComplained(ctx: FixtureContext) {
  const fx = await createQueuedLog(ctx, "delivered", "payment_received");
  const req = buildSignedRequest({
    type: "email.complained",
    data: { email_id: fx.externalId },
  });
  const res = await resendWebhookPOST(req as never);

  const { data: log } = await supabase
    .from("communication_log")
    .select("status, error_message")
    .eq("id", fx.logId)
    .single();
  const l = log as { status: string; error_message: string | null };

  // Auto-opt-out written
  const { data: pref } = await supabase
    .from("notification_preferences")
    .select("enabled")
    .eq("profile_id", ctx.ownerProfileId)
    .eq("notification_type", "payment_received")
    .eq("channel", "email")
    .single();
  const p = pref as { enabled: boolean } | null;

  // Audit row written
  const { data: audit } = await supabase
    .from("audit_log")
    .select("metadata")
    .eq("profile_id", ctx.ownerProfileId)
    .eq("action", "communication.opt_out_auto")
    .eq("entity_id", fx.logId)
    .maybeSingle();

  const ok =
    res.status === 200 &&
    l.status === "bounced" &&
    l.error_message === "Spam complaint received" &&
    !!p &&
    p.enabled === false &&
    !!audit;

  // Cleanup the auto-opt-out so it doesn't bleed into subsequent scenarios.
  await supabase
    .from("notification_preferences")
    .delete()
    .eq("profile_id", ctx.ownerProfileId)
    .eq("notification_type", "payment_received");

  record(
    "W-4: valid signature + email.complained → status='bounced' + opt-out upsert + audit",
    ok,
    `http=${res.status} status=${l.status} msg="${l.error_message}" pref_disabled=${p?.enabled === false} audit=${audit ? "yes" : "no"}`,
  );
}

async function w5_validClicked(ctx: FixtureContext) {
  const fx = await createQueuedLog(ctx, "delivered");
  const req = buildSignedRequest({
    type: "email.clicked",
    data: { email_id: fx.externalId, url: "https://example.com" },
  });
  const res = await resendWebhookPOST(req as never);
  const { data: row } = await supabase
    .from("communication_log")
    .select("status, opened_at")
    .eq("id", fx.logId)
    .single();
  const r = row as { status: string; opened_at: string | null };
  // Status unchanged; no DB writes from clicked event.
  record(
    "W-5: valid signature + email.clicked → 200 OK, no DB writes",
    res.status === 200 && r.status === "delivered" && r.opened_at === null,
    `http=${res.status} status=${r.status} opened_at=${r.opened_at}`,
  );
}

async function w6_invalidSignature(ctx: FixtureContext) {
  const fx = await createQueuedLog(ctx, "sent");
  const req = buildSignedRequest(
    { type: "email.delivered", data: { email_id: fx.externalId } },
    { tamperSig: true },
  );
  const res = await resendWebhookPOST(req as never);

  const { data: row } = await supabase
    .from("communication_log")
    .select("status")
    .eq("id", fx.logId)
    .single();
  const r = row as { status: string };

  const { data: audit } = await supabase
    .from("audit_log")
    .select("metadata")
    .eq("action", "communication.webhook_invalid_signature")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  record(
    "W-6: invalid signature → 400, audit log entry, no DB writes",
    res.status === 400 && r.status === "sent" && !!audit,
    `http=${res.status} status_unchanged=${r.status === "sent"} audit=${audit ? "yes" : "no"}`,
  );
}

async function w7_idempotentRetry(ctx: FixtureContext) {
  const fx = await createQueuedLog(ctx, "sent");
  const req1 = buildSignedRequest({
    type: "email.delivered",
    data: { email_id: fx.externalId },
  });
  const res1 = await resendWebhookPOST(req1 as never);
  const { data: row1 } = await supabase
    .from("communication_log")
    .select("status, delivered_at")
    .eq("id", fx.logId)
    .single();
  const firstStamp = (row1 as { delivered_at: string }).delivered_at;

  // Same event re-delivered (Resend retry). Status already 'delivered'.
  const req2 = buildSignedRequest({
    type: "email.delivered",
    data: { email_id: fx.externalId },
  });
  const res2 = await resendWebhookPOST(req2 as never);
  const { data: row2 } = await supabase
    .from("communication_log")
    .select("status, delivered_at")
    .eq("id", fx.logId)
    .single();
  const r2 = row2 as { status: string; delivered_at: string };

  // Status stays 'delivered'; delivered_at NOT overwritten by 2nd retry
  // because canAdvanceTo('delivered','delivered') === false (target not >
  // current). Idempotent from the row-state perspective.
  record(
    "W-7: idempotent retry on same event → status stable, no double-update",
    res1.status === 200 &&
      res2.status === 200 &&
      r2.status === "delivered" &&
      r2.delivered_at === firstStamp,
    `http=[${res1.status},${res2.status}] status=${r2.status} stamp_stable=${r2.delivered_at === firstStamp}`,
  );
}

async function w8_backwardsTransitionGuard(ctx: FixtureContext) {
  // Row is already 'opened'. A late 'email.delivered' arrives , must not
  // regress.
  const fx = await createQueuedLog(ctx, "opened");
  const req = buildSignedRequest({
    type: "email.delivered",
    data: { email_id: fx.externalId },
  });
  const res = await resendWebhookPOST(req as never);
  const { data: row } = await supabase
    .from("communication_log")
    .select("status")
    .eq("id", fx.logId)
    .single();
  record(
    "W-8: backwards-transition guard , late delivered after opened doesn't regress",
    res.status === 200 && (row as { status: string }).status === "opened",
    `http=${res.status} status=${(row as { status: string }).status}`,
  );
}

async function w9_orphanExternalId() {
  const orphanExternalId = `re_${randomUUID()}`;
  const req = buildSignedRequest({
    type: "email.delivered",
    data: { email_id: orphanExternalId },
  });
  const res = await resendWebhookPOST(req as never);
  // Should be 200 with ignored: 'orphan_external_id'.
  let body: { ignored?: string } = {};
  try {
    body = (await res.json()) as { ignored?: string };
  } catch {
    /* no-op */
  }
  record(
    "W-9: orphan external_id → 200 OK, ignored gracefully",
    res.status === 200 && body.ignored === "orphan_external_id",
    `http=${res.status} ignored=${body.ignored}`,
  );
}

// ─── Cleanup ───────────────────────────────────────────────────────────

async function cleanupMarker() {
  const { data: companies } = await supabase
    .from("management_companies")
    .select("id")
    .like("name", `${VERIFY_MARKER}%`);
  const companyIds = (companies ?? []).map((c) => (c as { id: string }).id);
  for (const cid of companyIds) await cleanupCompany(cid);

  const { data: orphanOwners } = await supabase
    .from("profiles")
    .select("id")
    .like("auth_user_id", `${VERIFY_MARKER}_OWNER_%`);
  const orphanOwnerIds = (orphanOwners ?? []).map((p) => (p as { id: string }).id);
  if (orphanOwnerIds.length > 0) {
    await supabase.from("notification_preferences").delete().in("profile_id", orphanOwnerIds);
    await supabase.from("profiles").delete().in("id", orphanOwnerIds);
  }
}

async function cleanupCompany(companyId: string) {
  const { data: subs } = await supabase
    .from("owners_corporations")
    .select("id")
    .eq("management_company_id", companyId);
  const subIds = (subs ?? []).map((s) => (s as { id: string }).id);

  if (subIds.length > 0) {
    await supabase.from("communication_log").delete().in("oc_id", subIds);
    await supabase.from("audit_log").delete().in("oc_id", subIds);
    await supabase.from("owners_corporations").delete().in("id", subIds);
  }

  // Webhook signature-rejection audit rows have oc_id=NULL , clean
  // by entity_type/action.
  await supabase
    .from("audit_log")
    .delete()
    .eq("entity_type", "resend_webhook")
    .is("oc_id", null);

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id")
    .eq("management_company_id", companyId);
  const profileIds = (profileRows ?? []).map((p) => (p as { id: string }).id);
  if (profileIds.length > 0) {
    await supabase.from("notification_preferences").delete().in("profile_id", profileIds);
    await supabase
      .from("audit_log")
      .delete()
      .in("profile_id", profileIds)
      .is("oc_id", null);
    await supabase.from("profiles").delete().in("id", profileIds);
  }

  await supabase.from("management_companies").delete().eq("id", companyId);
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const cleanupOnly = process.argv.includes("--cleanup");
  const noCleanup = process.argv.includes("--no-cleanup");

  if (cleanupOnly) {
    await cleanupMarker();
    process.exit(0);
  }

  console.log("Resend webhook verification , PP6-C-2 scenarios W-1..W-9\n");
  console.log("[1/3] Cleaning up stale verification data");
  await cleanupMarker();

  console.log("[2/3] Setting up shared fixture");
  const ctx = await createFixture();

  console.log("[3/3] Running scenarios\n");
  await w1_validDelivered(ctx);
  await w2_validOpened(ctx);
  await w3_validBounced(ctx);
  await w4_validComplained(ctx);
  await w5_validClicked(ctx);
  await w6_invalidSignature(ctx);
  await w7_idempotentRetry(ctx);
  await w8_backwardsTransitionGuard(ctx);
  await w9_orphanExternalId();

  if (!noCleanup) {
    console.log("\nCleaning up");
    await cleanupCompany(ctx.companyId);
    await cleanupMarker();
  }

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
