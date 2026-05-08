"use server";

import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { sendInvitationEmail } from "@/lib/email";

type LotOwnerInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

async function ensureNotAccepted(
  supabase: ReturnType<typeof createServerClient>,
  lotId: string,
) {
  const { data } = await supabase
    .from("invitations")
    .select("id")
    .eq("lot_id", lotId)
    .eq("status", "accepted")
    .maybeSingle();
  return !data;
}

async function findOpenInvitation(
  supabase: ReturnType<typeof createServerClient>,
  lotId: string,
) {
  // "Open" = pre-acceptance: either noted (saved, no email sent) or pending
  // (invite email sent, awaiting accept). Either is reusable on edit/resend.
  const { data } = await supabase
    .from("invitations")
    .select("id, token, email, status")
    .eq("lot_id", lotId)
    .in("status", ["pending", "noted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Save owner contact details for a lot without sending any email. Reuses
 * the existing pending invitation row if one exists; otherwise creates a
 * new pending row with no token consumption (the token still gets minted
 * for forward compatibility but the row stays "noted" until inviteLotOwner
 * is called).
 */
export async function updateLotOwnerDetails(
  subdivisionId: string,
  lotId: string,
  data: LotOwnerInput,
) {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);

  const supabase = createServerClient();

  if (!(await ensureNotAccepted(supabase, lotId))) {
    return { error: "This lot already has an accepted owner" };
  }

  const name = data.name.trim();
  if (!name) return { error: "Name is required" };
  const email = data.email?.trim() || null;
  const phone = data.phone?.trim() || null;

  const existing = await findOpenInvitation(supabase, lotId);

  if (existing) {
    // Don't downgrade status: a row that's already 'pending' (email sent)
    // stays 'pending' on edit. Only contact details are refreshed.
    const { error } = await supabase
      .from("invitations")
      .update({ name, email, phone, invited_by: profile.id })
      .eq("id", existing.id);
    if (error) return { error: error.message };

    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: subdivisionId,
      action: "update",
      entity_type: "invitation",
      entity_id: existing.id,
      after_state: { name, email, lot_id: lotId, status: existing.status },
    });
  } else {
    // No open row yet: create a 'noted' row. No email goes out and the
    // status badge will reflect "Owner noted" until inviteLotOwner runs.
    const { data: created, error } = await supabase
      .from("invitations")
      .insert({
        subdivision_id: subdivisionId,
        lot_id: lotId,
        email,
        name,
        phone,
        role: "lot_owner",
        status: "noted",
        invited_by: profile.id,
      })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "Failed to save owner" };

    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: subdivisionId,
      action: "create",
      entity_type: "invitation",
      entity_id: created.id,
      after_state: { name, email, lot_id: lotId, status: "noted" },
    });
  }

  revalidatePath("/subdivisions/[subdivisionCode]/manage", "page");
  return { success: true };
}

export async function inviteLotOwner(
  subdivisionId: string,
  lotId: string,
  data: { email: string; name: string; phone?: string },
) {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);

  if (!data.email?.trim()) {
    return { error: "Email is required to send an invitation" };
  }

  const supabase = createServerClient();

  if (!(await ensureNotAccepted(supabase, lotId))) {
    return { error: "This lot already has an accepted invitation" };
  }

  // Reuse any open invitation row for this lot (noted from setup or a
  // prior save, or pending from a previous send). Flip to 'pending' here
  // since we're now sending the email. Refresh contact fields + expiry.
  const existingOpen = await findOpenInvitation(supabase, lotId);

  let invitation: { id: string; token: string };
  let isResend = false;

  if (existingOpen) {
    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("invitations")
      .update({
        email: data.email,
        name: data.name,
        phone: data.phone || null,
        status: "pending",
        invited_by: profile.id,
        expires_at: newExpiry,
      })
      .eq("id", existingOpen.id)
      .select("id, token")
      .single();

    if (updateError || !updated) return { error: updateError?.message ?? "Failed to update invitation" };
    invitation = updated;
    isResend = true;
  } else {
    const { data: created, error } = await supabase
      .from("invitations")
      .insert({
        subdivision_id: subdivisionId,
        lot_id: lotId,
        email: data.email,
        name: data.name,
        phone: data.phone || null,
        role: "lot_owner",
        invited_by: profile.id,
      })
      .select("id, token")
      .single();

    if (error || !created) return { error: error?.message ?? "Failed to create invitation" };
    invitation = created;
  }

  // Audit log
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: isResend ? "update" : "create",
    entity_type: "invitation",
    entity_id: invitation.id,
    after_state: { email: data.email, name: data.name, lot_id: lotId, resend: isResend, sent: true },
  });

  // Send invitation email
  const { data: sub } = await supabase
    .from("subdivisions")
    .select("name, address")
    .eq("id", subdivisionId)
    .single();

  const { data: lot } = await supabase
    .from("lots")
    .select("lot_number")
    .eq("id", lotId)
    .single();

  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl}/invite/${invitation.token}`;
  await sendInvitationEmail({
    to: data.email,
    inviteeName: data.name,
    role: "lot_owner",
    subdivisionName: sub?.name ?? "Your subdivision",
    subdivisionAddress: sub?.address ?? "",
    lotNumber: lot?.lot_number ?? null,
    inviteUrl,
  });

  revalidatePath("/subdivisions/[subdivisionCode]/manage", "page");

  return { success: true, token: invitation.token };
}

export async function getLotInvitationStatus(subdivisionId: string, lotIds: string[]) {
  const supabase = createServerClient();

  const { data } = await supabase
    .from("invitations")
    .select("lot_id, status")
    .eq("subdivision_id", subdivisionId)
    .in("lot_id", lotIds)
    .in("status", ["noted", "pending", "accepted"]);

  // Precedence when a lot has multiple rows: accepted > pending > noted.
  const rank: Record<string, number> = { accepted: 3, pending: 2, noted: 1 };
  const statusMap = new Map<string, "accepted" | "pending" | "noted">();
  data?.forEach((inv) => {
    if (!inv.lot_id) return;
    const next = inv.status as "accepted" | "pending" | "noted";
    const current = statusMap.get(inv.lot_id);
    if (!current || rank[next] > rank[current]) statusMap.set(inv.lot_id, next);
  });

  return statusMap;
}
