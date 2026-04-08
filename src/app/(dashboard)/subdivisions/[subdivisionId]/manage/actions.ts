"use server";

import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function updateSubdivisionField(
  subdivisionId: string,
  field: string,
  value: string | number | boolean | null
) {
  await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);

  const allowedFields = [
    "name", "address", "plan_number", "common_property_description",
    "rules_type", "financial_year_start_month", "billing_cycle",
    "is_developer_period", "subdivision_type", "abn", "tfn",
    "street_number", "street_name", "suburb", "state",
    "levy_year_start_month", "levies_per_year",
  ];

  if (!allowedFields.includes(field)) {
    return { error: "Field not editable" };
  }

  const supabase = createServerClient();

  const { data: before } = await supabase
    .from("subdivisions")
    .select(field)
    .eq("id", subdivisionId)
    .single();

  const { error } = await supabase
    .from("subdivisions")
    .update({ [field]: value })
    .eq("id", subdivisionId);

  if (error) return { error: error.message };

  const profile = await requireCompanyRole();
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "update",
    entity_type: "subdivision",
    entity_id: subdivisionId,
    before_state: before,
    after_state: { [field]: value },
  });

  revalidatePath(`/subdivisions/${subdivisionId}/manage`);
  return { success: true };
}

export async function updateLotField(
  subdivisionId: string,
  lotId: string,
  field: string,
  value: string | number | boolean | null
) {
  await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);

  const allowedFields = [
    "owner_name", "owner_email", "owner_phone", "owner_type",
    "lot_entitlement", "lot_liability", "unit_number", "lot_number",
    "owner_occupied",
  ];

  if (!allowedFields.includes(field)) {
    return { error: "Field not editable" };
  }

  const supabase = createServerClient();

  // Duplicate lot number check
  if (field === "lot_number" && value !== null) {
    const { data: existing } = await supabase
      .from("lots")
      .select("id")
      .eq("subdivision_id", subdivisionId)
      .eq("lot_number", Number(value))
      .neq("id", lotId)
      .single();

    if (existing) {
      return { error: `Lot number ${value} already exists in this subdivision` };
    }
  }

  const { data: before } = await supabase
    .from("lots")
    .select(field)
    .eq("id", lotId)
    .single();

  const { error } = await supabase
    .from("lots")
    .update({ [field]: value })
    .eq("id", lotId)
    .eq("subdivision_id", subdivisionId);

  if (error) return { error: error.message };

  const profile = await requireCompanyRole();
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "update",
    entity_type: "lot",
    entity_id: lotId,
    before_state: before,
    after_state: { [field]: value },
  });

  revalidatePath(`/subdivisions/${subdivisionId}/manage`);
  revalidatePath(`/subdivisions/${subdivisionId}/lots/${lotId}`);
  return { success: true };
}
