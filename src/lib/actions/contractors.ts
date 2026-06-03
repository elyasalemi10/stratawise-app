"use server";

import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import {
  contractorSchema,
  type ContractorInput,
  type ContractorRecord,
} from "@/lib/validations/contractors";

// Contractors are management-company-wide , a reusable contact book across
// every OC the firm manages. All queries scope by the manager's
// management_company_id; mutations are audit-logged.

function mapRow(row: Record<string, unknown>): ContractorRecord {
  return {
    id: row.id as string,
    business_name: (row.business_name as string) ?? null,
    name: (row.name as string) ?? null,
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    trade: (row.trade as string) ?? null,
    abn: (row.abn as string) ?? null,
    gst_registered: !!row.gst_registered,
    bank_name: (row.bank_name as string) ?? null,
    bsb: (row.bsb as string) ?? null,
    account_number: (row.account_number as string) ?? null,
    pl_insurer: (row.pl_insurer as string) ?? null,
    pl_policy_number: (row.pl_policy_number as string) ?? null,
    pl_coverage_limit: row.pl_coverage_limit != null ? Number(row.pl_coverage_limit) : null,
    pl_document_url: (row.pl_document_url as string) ?? null,
    insurance_expiry: (row.insurance_expiry as string) ?? null,
    notes: (row.notes as string) ?? null,
    status: (row.status as ContractorRecord["status"]) ?? "active",
    created_at: row.created_at as string,
  };
}

export async function getContractors(): Promise<ContractorRecord[]> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data } = await supabase
    .from("contractors")
    .select(
      "id, business_name, name, phone, email, trade, abn, gst_registered, bank_name, bsb, account_number, pl_insurer, pl_policy_number, pl_coverage_limit, pl_document_url, insurance_expiry, notes, status, created_at",
    )
    .eq("management_company_id", profile.management_company_id)
    .order("business_name", { ascending: true });

  return (data ?? []).map(mapRow);
}

function toInsert(profileCompanyId: string | null, data: ContractorInput) {
  const email = data.contact_email?.trim() || null;
  return {
    management_company_id: profileCompanyId,
    business_name: data.business_name.trim(),
    name: data.contact_name.trim(),
    phone: data.contact_phone?.trim() || null,
    email,
    trade: data.trade?.trim() || null,
    abn: data.abn?.trim() || null,
    gst_registered: !!data.gst_registered,
    bank_name: data.bank_name?.trim() || null,
    bsb: data.bsb?.trim() || null,
    account_number: data.account_number?.trim() || null,
    pl_insurer: data.pl_insurer.trim(),
    pl_policy_number: data.pl_policy_number.trim(),
    pl_coverage_limit: data.pl_coverage_limit,
    pl_document_url: data.pl_document_url?.trim() || null,
    insurance_expiry: data.insurance_expiry,
    notes: data.notes?.trim() || null,
    status: data.status ?? "active",
  };
}

export async function createContractor(
  input: ContractorInput,
): Promise<{ contractorId?: string; error?: string }> {
  const parsed = contractorSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("contractors")
    .insert(toInsert(profile.management_company_id, parsed.data))
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not save contractor" };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: null,
    action: "create",
    entity_type: "contractor",
    entity_id: data.id,
    after_state: { business_name: parsed.data.business_name },
  });

  revalidatePath("/contractors");
  return { contractorId: data.id };
}

export async function updateContractor(
  contractorId: string,
  input: ContractorInput,
): Promise<{ error?: string }> {
  const parsed = contractorSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { error } = await supabase
    .from("contractors")
    .update(toInsert(profile.management_company_id, parsed.data))
    .eq("id", contractorId)
    .eq("management_company_id", profile.management_company_id);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: null,
    action: "update",
    entity_type: "contractor",
    entity_id: contractorId,
    after_state: { business_name: parsed.data.business_name },
  });

  revalidatePath("/contractors");
  return {};
}

// Soft activate/deactivate instead of deleting. Inactive contractors stay in
// the contact book (and on any historical jobs) but drop out of the
// new-job contractor picker (getContractorOptions filters status='active').
export async function setContractorStatus(
  contractorId: string,
  status: "active" | "inactive",
): Promise<{ error?: string }> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();
  const { error } = await supabase
    .from("contractors")
    .update({ status })
    .eq("id", contractorId)
    .eq("management_company_id", profile.management_company_id);
  if (error) return { error: error.message };
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: null,
    action: "update",
    entity_type: "contractor",
    entity_id: contractorId,
    after_state: { status },
  });
  revalidatePath("/contractors");
  return {};
}

export async function deleteContractor(contractorId: string): Promise<{ error?: string }> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { error } = await supabase
    .from("contractors")
    .delete()
    .eq("id", contractorId)
    .eq("management_company_id", profile.management_company_id);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: null,
    action: "delete",
    entity_type: "contractor",
    entity_id: contractorId,
  });

  revalidatePath("/contractors");
  return {};
}

// Lightweight list for the recurring-job drawer's contractor dropdown. Returns
// the primary contact's name/phone/email too so the picker can be searched by
// them (without displaying them). Only active contractors are pickable.
export interface ContractorOption {
  id: string;
  business_name: string;
  trade: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
}

export async function getContractorOptions(): Promise<ContractorOption[]> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();
  const { data } = await supabase
    .from("contractors")
    .select("id, business_name, trade, name, phone, email")
    .eq("management_company_id", profile.management_company_id)
    .eq("status", "active")
    .order("business_name", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    business_name: (r.business_name as string) ?? "Contractor",
    trade: (r.trade as string) ?? null,
    contact_name: (r.name as string) ?? null,
    contact_phone: (r.phone as string) ?? null,
    contact_email: (r.email as string) ?? null,
  }));
}
