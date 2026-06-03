"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { buildVcatPack } from "@/lib/vcat/generate";
import { tasks } from "@trigger.dev/sdk";

export interface VcatStatus {
  eligible: boolean;
  reason: string | null;       // why not eligible (shown when !eligible)
  levyNoticeId: string | null; // the notice past its final notice
  eligibleFrom: string | null;
  latestPackId: string | null;
}

// Is there an overdue notice for this lot whose final notice has been served
// long enough to lodge a VCAT application? Returns the most pressing one.
export async function getVcatStatus(lotId: string): Promise<VcatStatus> {
  await requireCompanyRole();
  const supabase = createServerClient();

  const { data: lot } = await supabase.from("lots").select("oc_id").eq("id", lotId).maybeSingle();
  if (!lot) return { eligible: false, reason: "Lot not found", levyNoticeId: null, eligibleFrom: null, latestPackId: null };
  await requireOCAccess(lot.oc_id as string);

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
    return { eligible: false, reason: "A final notice must be served before a VCAT pack can be prepared.", levyNoticeId: null, eligibleFrom: null, latestPackId };
  }
  const eligibleFrom = new Date(new Date(inst.final_notice_served_at as string).getTime() + 28 * 86_400_000);
  const eligible = eligibleFrom.getTime() <= Date.now();
  return {
    eligible,
    reason: eligible ? null : `Recovery can proceed from ${eligibleFrom.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })} (28 days after the final notice).`,
    levyNoticeId: inst.levy_notice_id as string,
    eligibleFrom: eligibleFrom.toISOString().slice(0, 10),
    latestPackId,
  };
}

export async function generateVcatPack(lotId: string, levyNoticeId: string): Promise<{ packId?: string; error?: string }> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();
  const { data: lot } = await supabase.from("lots").select("oc_id").eq("id", lotId).maybeSingle();
  if (!lot) return { error: "Lot not found" };
  await requireOCAccess(lot.oc_id as string);

  // Run inline (the manager waits for the download). Could be backgrounded for
  // very large packs; inline keeps the "Download" link immediate.
  const res = await buildVcatPack({ lotId, levyNoticeId, performerId: profile.id });
  if (res.error || !res.packId) return { error: res.error ?? "Could not generate the pack" };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: lot.oc_id,
    action: "vcat.pack_generated",
    entity_type: "vcat_pack",
    entity_id: res.packId,
  });

  revalidatePath("/ocs/[ocCode]/lots/[lotId]", "page");
  return { packId: res.packId };
}

// Optional background variant (kept for parity; the UI uses the inline action).
export async function queueVcatPack(lotId: string, levyNoticeId: string): Promise<{ queued?: boolean; error?: string }> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();
  const { data: lot } = await supabase.from("lots").select("oc_id").eq("id", lotId).maybeSingle();
  if (!lot) return { error: "Lot not found" };
  await requireOCAccess(lot.oc_id as string);

  if (process.env.TRIGGER_SECRET_KEY) {
    try {
      await tasks.trigger("generate-vcat-pack", { lotId, levyNoticeId, performerId: profile.id });
      return { queued: true };
    } catch (err) {
      console.error("queueVcatPack: failed to queue", err);
    }
  }
  const res = await buildVcatPack({ lotId, levyNoticeId, performerId: profile.id });
  if (res.error) return { error: res.error };
  return { queued: true };
}
