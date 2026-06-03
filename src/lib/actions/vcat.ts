"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { buildVcatPack } from "@/lib/vcat/generate";
import { vcatPackInputsSchema, type VcatPackInputs } from "@/lib/validations/vcat";
import { notifyOcManagers } from "@/lib/escalation/runner";

export interface VcatStatus {
  eligible: boolean;
  reason: string | null;       // why not eligible (shown when !eligible)
  levyNoticeId: string | null; // the notice past its final notice
  eligibleFrom: string | null;
  latestPackId: string | null;
  hasArrears: boolean;         // any overdue/unpaid notice on this lot
}

// Is there an overdue notice for this lot whose final notice has been served
// long enough to lodge a VCAT application? Returns the most pressing one.
export async function getVcatStatus(lotId: string): Promise<VcatStatus> {
  await requireCompanyRole();
  const supabase = createServerClient();

  const { data: lot } = await supabase.from("lots").select("oc_id").eq("id", lotId).maybeSingle();
  if (!lot) return { eligible: false, reason: "Lot not found", levyNoticeId: null, eligibleFrom: null, latestPackId: null, hasArrears: false };
  await requireOCAccess(lot.oc_id as string);

  const today = new Date().toISOString().slice(0, 10);
  const { count: arrearsCount } = await supabase
    .from("levy_notices")
    .select("id", { count: "exact", head: true })
    .eq("lot_id", lotId)
    .in("status", ["issued", "partially_paid", "overdue"])
    .lt("due_date", today);
  const hasArrears = (arrearsCount ?? 0) > 0;

  const { data: inst } = await supabase
    .from("escalation_instances")
    .select("levy_notice_id, final_notice_served_at, final_notice_pdf_url")
    .eq("lot_id", lotId)
    .not("final_notice_pdf_url", "is", null)
    .order("final_notice_served_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: pack } = await supabase
    .from("vcat_packs").select("id").eq("lot_id", lotId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const latestPackId = (pack?.id as string) ?? null;

  if (!inst || !inst.final_notice_served_at) {
    return {
      eligible: false,
      reason: hasArrears
        ? "Follow-up runs automatically. A VCAT pack can be prepared once a final notice has been served for 28 days."
        : "No overdue levies on this lot.",
      levyNoticeId: null, eligibleFrom: null, latestPackId, hasArrears,
    };
  }
  const eligibleFrom = new Date(new Date(inst.final_notice_served_at as string).getTime() + 28 * 86_400_000);
  const eligible = eligibleFrom.getTime() <= Date.now();
  return {
    eligible,
    reason: eligible ? null : `Recovery can proceed from ${eligibleFrom.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })} (28 days after the final notice).`,
    levyNoticeId: inst.levy_notice_id as string,
    eligibleFrom: eligibleFrom.toISOString().slice(0, 10),
    latestPackId,
    hasArrears,
  };
}

export async function generateVcatPack(
  lotId: string,
  levyNoticeId: string,
  inputs: VcatPackInputs,
): Promise<{ packId?: string; error?: string }> {
  const parsed = vcatPackInputsSchema.safeParse(inputs);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confirm the acknowledgement to continue." };
  const profile = await requireCompanyRole();
  const supabase = createServerClient();
  const { data: lot } = await supabase.from("lots").select("oc_id").eq("id", lotId).maybeSingle();
  if (!lot) return { error: "Lot not found" };
  await requireOCAccess(lot.oc_id as string);

  // Run inline (the manager waits for the download). Could be backgrounded for
  // very large packs; inline keeps the "Download" link immediate.
  const res = await buildVcatPack({ lotId, levyNoticeId, performerId: profile.id, inputs: parsed.data });
  if (res.error || !res.packId) return { error: res.error ?? "Could not generate the pack" };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: lot.oc_id,
    action: "vcat.pack_generated",
    entity_type: "vcat_pack",
    entity_id: res.packId,
  });

  // Notify the OC's managers the pack is ready (toggleable, opt-out respected).
  await notifyOcManagers(supabase, lot.oc_id as string, "VCAT pack ready to download", "The VCAT fee-recovery pack has been generated and is ready to download.");

  revalidatePath("/ocs/[ocCode]/lots/[lotId]", "page");
  return { packId: res.packId };
}
