/**
 * My-arrears data loader verification (PP6-D-B).
 *
 * Exercises getMyArrears with the auth-resolver shim swapped for
 * deterministic owner identity. Covers empty state, multi-lot owner,
 * penalty interest linkage, and status-filter exclusion.
 *
 * Usage:
 *   npx tsx src/lib/actions/my-arrears.verification.ts
 *   npx tsx src/lib/actions/my-arrears.verification.ts --no-cleanup
 *   npx tsx src/lib/actions/my-arrears.verification.ts --cleanup
 */

import { config } from "dotenv";
config({ path: ".env.local" });
process.env.EMAIL_DRY_RUN = "true";

// next/cache stub , getCurrentProfile transitively goes through Supabase
// Auth helpers; some imports touch revalidate paths.
import { createRequire } from "node:module";
const scriptRequire = createRequire(import.meta.url);
const nextCachePath = scriptRequire.resolve("next/cache");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(scriptRequire.cache as any)[nextCachePath] = {
  id: nextCachePath,
  filename: nextCachePath,
  loaded: true,
  exports: {
    revalidatePath: () => {},
    revalidateTag: () => {},
    updateTag: () => {},
    unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  },
  paths: [],
  children: [],
};

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { generateOCCode } from "@/lib/oc-code";
import {
  __setUserIdResolverForVerification,
} from "@/lib/auth-resolver";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const VERIFY_MARKER = "__VERIFY_MA__";
const supabase = createClient(supabaseUrl, serviceRoleKey);

let activeUserId: string | null = null;
__setUserIdResolverForVerification(async () => activeUserId);

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];
function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " , " + detail : ""}`);
}

// ─── Fixture ───────────────────────────────────────────────────────

interface FixtureContext {
  companyId: string;
  managerProfileId: string;
  ownerProfileId: string;
  ownerUserId: string;
  ocId: string;
  lotAId: string;
  lotBId: string;
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
      email: `${VERIFY_MARKER.toLowerCase()}${runId}_mgr@ma.test`,
      first_name: "MA",
      last_name: "TestMgr",
      role: "strata_manager",
      company_role: "admin",
      management_company_id: companyId,
    })
    .select("id")
    .single();
  const managerProfileId = (manager as { id: string }).id;

  const ownerUserId = `${VERIFY_MARKER}_OWNER_${runId}`;
  const { data: owner } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: ownerUserId,
      email: `${VERIFY_MARKER.toLowerCase()}${runId}_owner@ma.test`,
      first_name: "MA",
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
      short_code: generateOCCode(),
      address: `${runId} MA Test St, Melbourne VIC 3000`,
      total_lots: 2,
      created_by: managerProfileId,
    })
    .select("id")
    .single();
  const ocId = (sub as { id: string }).id;

  const { data: lots } = await supabase
    .from("lots")
    .insert([
      { oc_id: ocId, lot_number: 1, lot_entitlement: 100, lot_liability: 100 },
      { oc_id: ocId, lot_number: 2, lot_entitlement: 100, lot_liability: 100 },
    ])
    .select("id, lot_number")
    .order("lot_number", { ascending: true });
  const lotAId = (lots as { id: string }[])[0].id;
  const lotBId = (lots as { id: string }[])[1].id;

  // Owner active on BOTH lots.
  await supabase.from("oc_members").insert([
    {
      oc_id: ocId,
      profile_id: ownerProfileId,
      lot_id: lotAId,
      role: "lot_owner",
      is_primary_contact: true,
      is_financial: true,
    },
    {
      oc_id: ocId,
      profile_id: ownerProfileId,
      lot_id: lotBId,
      role: "lot_owner",
      is_primary_contact: true,
      is_financial: true,
    },
  ]);

  return {
    companyId,
    managerProfileId,
    ownerProfileId,
    ownerUserId,
    ocId,
    lotAId,
    lotBId,
  };
}

interface CreateLevyOpts {
  amount?: number;
  amountPaid?: number;
  status?: "issued" | "partially_paid" | "overdue" | "paid" | "draft" | "written_off";
  levyType?: "regular" | "special" | "penalty_interest";
  linkedLevyId?: string | null;
  refSuffix: string;
}

async function createLevy(
  ctx: FixtureContext,
  lotId: string,
  opts: CreateLevyOpts,
): Promise<string> {
  const { data } = await supabase
    .from("levy_notices")
    .insert({
      oc_id: ctx.ocId,
      lot_id: lotId,
      reference_number: `LEV-MA-${opts.refSuffix}`,
      fund_type: "administrative",
      levy_type: opts.levyType ?? "regular",
      period_start: "2026-01-01",
      period_end: "2026-03-31",
      amount: opts.amount ?? 1000,
      amount_paid: opts.amountPaid ?? 0,
      due_date: "2026-04-15",
      status: opts.status ?? "issued",
      issued_at: new Date("2026-04-15T00:00:00Z").toISOString(),
      linked_levy_id: opts.linkedLevyId ?? null,
    })
    .select("id")
    .single();
  return (data as { id: string }).id;
}

// ─── Scenarios ─────────────────────────────────────────────────────

async function ma1_emptyState(
  ctx: FixtureContext,
  ma: typeof import("./my-arrears"),
) {
  // No levies yet , fresh fixture.
  activeUserId = ctx.ownerUserId;
  const result = await ma.getMyArrears(ctx.ocId);
  const ok = result.rows.length === 0 && result.outstandingTotal === 0;
  record(
    "MA-1: empty state , owner with no overdue levies returns empty result",
    ok,
    `rows=${result.rows.length} total=${result.outstandingTotal}`,
  );
}

async function ma2_multiLotOwner(
  ctx: FixtureContext,
  ma: typeof import("./my-arrears"),
) {
  // One overdue levy on each lot.
  await createLevy(ctx, ctx.lotAId, {
    amount: 1000,
    status: "overdue",
    refSuffix: "ma2-A",
  });
  await createLevy(ctx, ctx.lotBId, {
    amount: 500,
    status: "issued",
    refSuffix: "ma2-B",
  });

  activeUserId = ctx.ownerUserId;
  const result = await ma.getMyArrears(ctx.ocId);

  const lotsSeen = new Set(result.rows.map((r) => r.lot_id));
  const ok =
    result.rows.length === 2 &&
    lotsSeen.has(ctx.lotAId) &&
    lotsSeen.has(ctx.lotBId) &&
    Math.abs(result.outstandingTotal - 1500) < 0.01;
  record(
    "MA-2: multi-lot owner sees both lots' arrears + outstanding total aggregated",
    ok,
    `rows=${result.rows.length} both_lots=${lotsSeen.has(ctx.lotAId) && lotsSeen.has(ctx.lotBId)} total=${result.outstandingTotal}`,
  );
}

async function ma3_penaltyInterestLinkage(
  ctx: FixtureContext,
  ma: typeof import("./my-arrears"),
) {
  // Create a parent overdue levy + 2 linked penalty_interest levies.
  const parentId = await createLevy(ctx, ctx.lotAId, {
    amount: 800,
    status: "overdue",
    refSuffix: "ma3-parent",
  });
  await createLevy(ctx, ctx.lotAId, {
    amount: 16,
    levyType: "penalty_interest",
    linkedLevyId: parentId,
    status: "issued",
    refSuffix: "ma3-pi-1",
  });
  await createLevy(ctx, ctx.lotAId, {
    amount: 16,
    levyType: "penalty_interest",
    linkedLevyId: parentId,
    status: "issued",
    refSuffix: "ma3-pi-2",
  });

  activeUserId = ctx.ownerUserId;
  const result = await ma.getMyArrears(ctx.ocId);

  const parentRow = result.rows.find((r) => r.id === parentId);
  // Parent row exists; 2 penalty children attached; total includes parent
  // + both penalties.
  const ok =
    !!parentRow &&
    parentRow.penalty_interest.length === 2 &&
    parentRow.penalty_interest.every((p) => p.outstanding === 16);
  record(
    "MA-3: parent levy carries linked penalty_interest sub-rows; outstanding correctly attached",
    ok,
    `parent=${!!parentRow} children=${parentRow?.penalty_interest.length} child_outstanding_match=${parentRow?.penalty_interest.every((p) => p.outstanding === 16)}`,
  );
}

async function ma4_statusFilterExcludes(
  ctx: FixtureContext,
  ma: typeof import("./my-arrears"),
) {
  // Create one of each excluded status to confirm filter.
  await createLevy(ctx, ctx.lotAId, {
    amount: 100,
    amountPaid: 100,
    status: "paid",
    refSuffix: "ma4-paid",
  });
  await createLevy(ctx, ctx.lotAId, {
    amount: 100,
    status: "draft",
    refSuffix: "ma4-draft",
  });
  await createLevy(ctx, ctx.lotAId, {
    amount: 100,
    status: "written_off",
    refSuffix: "ma4-wo",
  });

  activeUserId = ctx.ownerUserId;
  const result = await ma.getMyArrears(ctx.ocId);

  // None of the just-created excluded-status rows should be in result.
  const excluded = result.rows.find(
    (r) =>
      r.reference_number === "LEV-MA-ma4-paid" ||
      r.reference_number === "LEV-MA-ma4-draft" ||
      r.reference_number === "LEV-MA-ma4-wo",
  );
  record(
    "MA-4: status filter excludes paid / draft / written_off",
    !excluded,
    `excluded_appears=${!!excluded}`,
  );
}

// ─── Cleanup ───────────────────────────────────────────────────────

async function cleanupMarker() {
  const { data: companies } = await supabase
    .from("management_companies")
    .select("id")
    .like("name", `${VERIFY_MARKER}%`);
  const companyIds = (companies ?? []).map((c) => (c as { id: string }).id);
  for (const cid of companyIds) {
    const { data: subs } = await supabase
      .from("owners_corporations")
      .select("id")
      .eq("management_company_id", cid);
    const subIds = (subs ?? []).map((s) => (s as { id: string }).id);
    if (subIds.length > 0) {
      await supabase
        .from("levy_notices")
        .update({ linked_levy_id: null })
        .in("oc_id", subIds);
      await supabase.from("levy_notices").delete().in("oc_id", subIds);
      await supabase.from("oc_members").delete().in("oc_id", subIds);
      await supabase.from("audit_log").delete().in("oc_id", subIds);
      const { data: lots } = await supabase
        .from("lots")
        .select("id")
        .in("oc_id", subIds);
      const lotIds = (lots ?? []).map((l) => (l as { id: string }).id);
      if (lotIds.length > 0) {
        await supabase.from("lot_ledger_state").delete().in("lot_id", lotIds);
        await supabase.from("lot_ledger_entries").delete().in("lot_id", lotIds);
      }
      await supabase.from("lots").delete().in("oc_id", subIds);
      await supabase.from("owners_corporations").delete().in("id", subIds);
    }
    await supabase.from("profiles").delete().eq("management_company_id", cid);
    await supabase.from("management_companies").delete().eq("id", cid);
  }

  // Orphan owner profiles.
  const { data: orphanOwners } = await supabase
    .from("profiles")
    .select("id")
    .like("auth_user_id", `${VERIFY_MARKER}_OWNER_%`);
  const orphanIds = (orphanOwners ?? []).map((p) => (p as { id: string }).id);
  if (orphanIds.length > 0) {
    await supabase.from("profiles").delete().in("id", orphanIds);
  }
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  const cleanupOnly = process.argv.includes("--cleanup");
  const noCleanup = process.argv.includes("--no-cleanup");

  if (cleanupOnly) {
    await cleanupMarker();
    process.exit(0);
  }

  console.log("My-arrears verification , PP6-D-B scenarios MA-1..MA-4\n");
  console.log("[1/3] Cleaning up stale verification data");
  await cleanupMarker();

  console.log("[2/3] Creating fixture");
  const ctx = await createFixture();

  console.log("[3/3] Running scenarios\n");
  const ma = await import("./my-arrears");
  await ma1_emptyState(ctx, ma);
  await ma2_multiLotOwner(ctx, ma);
  await ma3_penaltyInterestLinkage(ctx, ma);
  await ma4_statusFilterExcludes(ctx, ma);

  if (!noCleanup) {
    console.log("\nCleaning up");
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
