"use server";

import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { sendInvitationEmail } from "@/lib/email";

export async function inviteLotOwner(
  subdivisionId: string,
  lotId: string,
  data: { email: string; name: string; phone?: string }
) {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);

  const supabase = createServerClient();

  // Check if lot already has an accepted invitation
  const { data: existingAccepted } = await supabase
    .from("invitations")
    .select("id")
    .eq("lot_id", lotId)
    .eq("status", "accepted")
    .single();

  if (existingAccepted) {
    return { error: "This lot already has an accepted invitation" };
  }

  // Check for pending invitation to same email
  const { data: existingPending } = await supabase
    .from("invitations")
    .select("id")
    .eq("lot_id", lotId)
    .eq("email", data.email)
    .eq("status", "pending")
    .single();

  if (existingPending) {
    return { error: "A pending invitation already exists for this email and lot" };
  }

  // Create invitation
  const { data: invitation, error } = await supabase
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

  if (error) return { error: error.message };

  // Audit log
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "create",
    entity_type: "invitation",
    entity_id: invitation.id,
    after_state: { email: data.email, name: data.name, lot_id: lotId },
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
    .in("status", ["pending", "accepted"]);

  // Build a map: lot_id -> status
  const statusMap = new Map<string, string>();
  data?.forEach((inv) => {
    if (inv.lot_id) {
      // accepted takes priority over pending
      const current = statusMap.get(inv.lot_id);
      if (inv.status === "accepted" || !current) {
        statusMap.set(inv.lot_id, inv.status);
      }
    }
  });

  return statusMap;
}
