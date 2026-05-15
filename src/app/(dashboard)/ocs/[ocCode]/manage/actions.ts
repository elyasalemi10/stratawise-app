"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function updateOCField(
  ocId: string,
  field: string,
  value: string | number | boolean | null
) {
  await requireCompanyRole();
  await requireOCAccess(ocId);

  const allowedFields = [
    "name", "address", "plan_number", "common_property_description",
    "rules_type", "financial_year_start_month", "billing_cycle",
    "is_developer_period", "abn", "tfn",
    "street_number", "street_name", "suburb", "state", "postcode",
    "levy_year_start_month", "levies_per_year",
    "common_seal_text", "inspection_address", "manager_appointed", "administrator_appointed",
    "bank_bsb", "bank_account_number", "bank_account_name",
    // Added in the wizard-redesign PR: editable on the OC settings page so
    // wizard-captured data is round-trippable post-creation.
    "building_name",
    "annual_interest_rate_percent", "interest_free_period_days",
    "early_payment_incentive_percent", "arrears_action_threshold_cents",
    "levy_calculation_basis",
    "meetings_postal_buffer_days", "levies_postal_buffer_days", "financial_postal_buffer_days",
    "default_delivery_method",
  ];

  if (!allowedFields.includes(field)) {
    return { error: "Field not editable" };
  }

  const supabase = createServerClient();

  const { data: before } = await supabase
    .from("owners_corporations")
    .select(field)
    .eq("id", ocId)
    .single();

  const { error } = await supabase
    .from("owners_corporations")
    .update({ [field]: value })
    .eq("id", ocId);

  if (error) return { error: error.message };

  const profile = await requireCompanyRole();
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "update",
    entity_type: "oc",
    entity_id: ocId,
    before_state: before,
    after_state: { [field]: value },
  });

  revalidatePath("/ocs/[ocCode]/manage", "page");
  return { success: true };
}

export async function updateLotField(
  ocId: string,
  lotId: string,
  field: string,
  value: string | number | boolean | null
) {
  await requireCompanyRole();
  await requireOCAccess(ocId);

  // Owner fields are NOT editable here — ownership lives on
  // oc_members + profiles and changes via the invitation flow.
  const allowedFields = [
    "lot_entitlement", "lot_liability", "unit_number", "lot_number",
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
      .eq("oc_id", ocId)
      .eq("lot_number", Number(value))
      .neq("id", lotId)
      .single();

    if (existing) {
      return { error: `Lot number ${value} already exists in this oc` };
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
    .eq("oc_id", ocId);

  if (error) return { error: error.message };

  const profile = await requireCompanyRole();
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "update",
    entity_type: "lot",
    entity_id: lotId,
    before_state: before,
    after_state: { [field]: value },
  });

  revalidatePath("/ocs/[ocCode]/manage", "page");
  revalidatePath("/ocs/[ocCode]/lots/[lotId]", "page");
  return { success: true };
}
