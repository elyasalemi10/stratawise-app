"use server";

import { z } from "zod";
import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { logAudit, diffFields } from "@/lib/audit";

// Server actions for the editable fields on the lot detail page (Items 9 + 13).
// Every mutation: validates with Zod, fetches before-state, performs the update,
// then writes an audit_log entry via logAudit().

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

// ─── updateLotDetails ───────────────────────────────────────────────────────
// Edits the lots table itself. Lot number is intentionally NOT editable
// (Item 9). Unit number / entitlement / liability are; the popover enforces
// confirmation upstream.

const updateLotDetailsSchema = z.object({
  lot_id: z.string().uuid(),
  unit_number: z.string().trim().max(20).nullable().optional(),
  lot_entitlement: z.number().positive().nullable().optional(),
  lot_liability: z.number().positive().nullable().optional(),
});

export async function updateLotDetails(
  input: z.input<typeof updateLotDetailsSchema>,
): Promise<Result<{ lot_id: string }>> {
  const parsed = updateLotDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: before, error: fetchErr } = await supabase
    .from("lots")
    .select("id, oc_id, lot_number, unit_number, lot_entitlement, lot_liability")
    .eq("id", parsed.data.lot_id)
    .single();
  if (fetchErr || !before) return { ok: false, error: "Lot not found" };

  // Authorize against the lot's OC before mutating (prevents cross-tenant edits).
  await requireOCAccess(before.oc_id as string);

  const update: Record<string, unknown> = {};
  if (parsed.data.unit_number !== undefined) update.unit_number = parsed.data.unit_number;
  if (parsed.data.lot_entitlement !== undefined) update.lot_entitlement = parsed.data.lot_entitlement;
  if (parsed.data.lot_liability !== undefined) update.lot_liability = parsed.data.lot_liability;
  if (Object.keys(update).length === 0) return { ok: true, data: { lot_id: parsed.data.lot_id } };

  const { error: updErr } = await supabase.from("lots").update(update).eq("id", parsed.data.lot_id);
  if (updErr) return { ok: false, error: "Could not save changes" };

  const diff = diffFields(before, update);
  await logAudit({
    profileId: profile.id,
    ocId: before.oc_id as string,
    action: "update",
    entityType: "lot",
    entityId: parsed.data.lot_id,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  return { ok: true, data: { lot_id: parsed.data.lot_id } };
}

// ─── updateLotOwnerContact ──────────────────────────────────────────────────
// Edits the PERSON, not the lot link. Name, email, phone, postal address and
// owner type live on `owners`, so a manager fixing a typo on one lot fixes it
// on every lot that person owns , which is the reason the model was split in
// the first place.
//
// The email column here is the OC-facing contact email; it is intentionally
// separate from the platform login email on profiles. Once the owner has
// accepted their portal invite we refuse email edits, because changing it
// without their consent is a personal-data problem.

const updateLotOwnerContactSchema = z.object({
  // The ownership row's id (what v_lot_current_owners exposes as `id`).
  lot_owner_id: z.string().uuid(),
  owner_type: z.enum(["individual", "company"]).nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  postal_address: z.string().trim().max(500).nullable().optional(),
  email: z.string().email().nullable().optional(),
  // Legacy flag from the retired address-verification integration.
  verified_postal: z
    .object({
      status: z.string(),
      verification_id: z.string().nullable(),
    })
    .nullable()
    .optional(),
});

export async function updateLotOwnerContact(
  input: z.input<typeof updateLotOwnerContactSchema>,
): Promise<Result<{ lot_owner_id: string }>> {
  const parsed = updateLotOwnerContactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: ownership, error: fetchErr } = await supabase
    .from("lot_ownerships")
    .select("id, lot_id, oc_id, owner_id, invitation_id")
    .eq("id", parsed.data.lot_owner_id)
    .single();
  if (fetchErr || !ownership) return { ok: false, error: "Owner not found" };

  await requireOCAccess(ownership.oc_id as string);

  const { data: before, error: ownerErr } = await supabase
    .from("owners")
    .select("id, owner_type, name, phone, postal_address, email")
    .eq("id", ownership.owner_id as string)
    .single();
  if (ownerErr || !before) return { ok: false, error: "Owner not found" };

  // Block email edits when the owner has accepted the invite , they own their
  // login email at that point and changes need to go through the portal.
  if (parsed.data.email !== undefined && ownership.invitation_id) {
    const { data: inv } = await supabase
      .from("invitations")
      .select("status")
      .eq("id", ownership.invitation_id as string)
      .maybeSingle();
    if (inv?.status === "accepted") {
      return {
        ok: false,
        error: "This owner is already on the portal , they need to change their email themselves.",
      };
    }
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.owner_type !== undefined) update.owner_type = parsed.data.owner_type;
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.phone !== undefined) update.phone = parsed.data.phone;
  if (parsed.data.email !== undefined) update.email = parsed.data.email;

  // Postal address , stored as the manager typed it. Address
  // verification is not integrated.
  if (parsed.data.postal_address !== undefined) {
    update.postal_address = parsed.data.postal_address;
  }

  if (Object.keys(update).length === 0) {
    return { ok: true, data: { lot_owner_id: parsed.data.lot_owner_id } };
  }
  update.updated_at = new Date().toISOString();

  const { error: updErr } = await supabase
    .from("owners")
    .update(update)
    .eq("id", ownership.owner_id as string);
  if (updErr) return { ok: false, error: "Could not save changes" };

  const diff = diffFields(before, update);
  await logAudit({
    profileId: profile.id,
    ocId: ownership.oc_id as string,
    action: "update",
    entityType: "owner",
    entityId: ownership.owner_id as string,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
    metadata: { lot_id: ownership.lot_id, ownership_id: ownership.id },
  });

  return { ok: true, data: { lot_owner_id: parsed.data.lot_owner_id } };
}

// ─── updateTenant ───────────────────────────────────────────────────────────
// Tenant fields on the ownership are nullable; passing null clears them. Editing
// is only meaningful when occupancy_status='tenanted'; the UI gates this.

const updateTenantSchema = z.object({
  lot_owner_id: z.string().uuid(),
  tenant_name: z.string().trim().max(120).nullable().optional(),
  tenant_email: z.string().email().nullable().optional(),
  tenant_phone: z.string().trim().max(40).nullable().optional(),
});

export async function updateTenant(
  input: z.input<typeof updateTenantSchema>,
): Promise<Result<{ lot_owner_id: string }>> {
  const parsed = updateTenantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: before, error: fetchErr } = await supabase
    .from("lot_ownerships")
    .select("id, lot_id, oc_id, tenant_name, tenant_email, tenant_phone")
    .eq("id", parsed.data.lot_owner_id)
    .single();
  if (fetchErr || !before) return { ok: false, error: "Lot owner not found" };

  const ocId = before.oc_id as string;
  await requireOCAccess(ocId);

  const update: Record<string, unknown> = {};
  if (parsed.data.tenant_name !== undefined) update.tenant_name = parsed.data.tenant_name;
  if (parsed.data.tenant_email !== undefined) update.tenant_email = parsed.data.tenant_email;
  if (parsed.data.tenant_phone !== undefined) update.tenant_phone = parsed.data.tenant_phone;
  if (Object.keys(update).length === 0) {
    return { ok: true, data: { lot_owner_id: parsed.data.lot_owner_id } };
  }

  const { error: updErr } = await supabase
    .from("lot_ownerships")
    .update(update)
    .eq("id", parsed.data.lot_owner_id);
  if (updErr) return { ok: false, error: "Could not save changes" };

  const diff = diffFields(before, update);
  await logAudit({
    profileId: profile.id,
    ocId,
    action: "update",
    entityType: "tenant",
    entityId: parsed.data.lot_owner_id,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
    metadata: { lot_id: before.lot_id },
  });

  return { ok: true, data: { lot_owner_id: parsed.data.lot_owner_id } };
}

// ─── updateOccupancyStatus ──────────────────────────────────────────────────
// Drives the 3-state Tenancy tab. occupancy_status (enum) is the only
// column: the is_occupied_by_owner boolean was a second copy that could
// disagree with it, and is now derived in the view instead. Moving to
// 'vacant' or 'owner_occupied' also clears tenant fields so no stale
// tenant is left behind.

const updateOccupancySchema = z.object({
  lot_owner_id: z.string().uuid(),
  occupancy_status: z.enum(["owner_occupied", "tenanted", "vacant"]),
  reason: z.string().trim().max(280).nullable().optional(),
});

export async function updateOccupancyStatus(
  input: z.input<typeof updateOccupancySchema>,
): Promise<Result<{ lot_owner_id: string }>> {
  const parsed = updateOccupancySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: before, error: fetchErr } = await supabase
    .from("lot_ownerships")
    .select("id, lot_id, oc_id, occupancy_status, tenant_name, tenant_email, tenant_phone")
    .eq("id", parsed.data.lot_owner_id)
    .single();
  if (fetchErr || !before) return { ok: false, error: "Lot owner not found" };

  const ocId = before.oc_id as string;
  await requireOCAccess(ocId);

  const update: Record<string, unknown> = {
    occupancy_status: parsed.data.occupancy_status,
  };

  if (
    parsed.data.occupancy_status === "owner_occupied" ||
    parsed.data.occupancy_status === "vacant"
  ) {
    update.tenant_name = null;
    update.tenant_email = null;
    update.tenant_phone = null;
  }

  const { error: updErr } = await supabase
    .from("lot_ownerships")
    .update(update)
    .eq("id", parsed.data.lot_owner_id);
  if (updErr) return { ok: false, error: "Could not save changes" };

  await logAudit({
    profileId: profile.id,
    ocId,
    action: "update",
    entityType: "occupancy",
    entityId: parsed.data.lot_owner_id,
    before: { occupancy_status: before.occupancy_status },
    after: { occupancy_status: parsed.data.occupancy_status },
    metadata: {
      lot_id: before.lot_id,
      reason: parsed.data.reason ?? null,
    },
  });

  return { ok: true, data: { lot_owner_id: parsed.data.lot_owner_id } };
}

// ─── updateConsentCategories ────────────────────────────────────────────────
// Manager-mediated consent edits (Item 13). A reason is REQUIRED so the audit
// trail explains why the manager toggled on the owner's behalf.

const updateConsentSchema = z.object({
  lot_owner_id: z.string().uuid(),
  categories: z.array(z.string()).max(20),
  reason: z.string().trim().min(3, "Please add a short reason").max(280),
});

export async function updateConsentCategories(
  input: z.input<typeof updateConsentSchema>,
): Promise<Result<{ lot_owner_id: string }>> {
  const parsed = updateConsentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: before, error: fetchErr } = await supabase
    .from("lot_ownerships")
    .select("id, lot_id, oc_id, digital_consent_categories")
    .eq("id", parsed.data.lot_owner_id)
    .single();
  if (fetchErr || !before) return { ok: false, error: "Lot owner not found" };

  const ocId = before.oc_id as string;
  await requireOCAccess(ocId);

  const { error: updErr } = await supabase
    .from("lot_ownerships")
    .update({
      digital_consent_categories: parsed.data.categories,
      digital_consent_source: "manager_edit",
    })
    .eq("id", parsed.data.lot_owner_id);
  if (updErr) return { ok: false, error: "Could not save changes" };

  await logAudit({
    profileId: profile.id,
    ocId,
    action: "update",
    entityType: "consent",
    entityId: parsed.data.lot_owner_id,
    before: { categories: before.digital_consent_categories },
    after: { categories: parsed.data.categories },
    metadata: {
      lot_id: before.lot_id,
      reason: parsed.data.reason,
      changed_by: "manager",
    },
  });

  return { ok: true, data: { lot_owner_id: parsed.data.lot_owner_id } };
}
