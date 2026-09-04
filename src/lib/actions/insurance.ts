"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import type { InsurancePolicy, PaymentFrequency } from "@/lib/insurance-shared";

// Re-exported as TYPES only. A "use server" file may export nothing but
// async functions, and a value export here is a runtime error on first
// render. The values live in insurance-shared.ts.
export type { InsurancePolicy, PaymentFrequency };
import { revalidatePath } from "next/cache";

export async function getInsurancePolicies(ocId: string): Promise<InsurancePolicy[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("insurance_policies")
    .select("*")
    .eq("oc_id", ocId)
    .order("start_date", { ascending: false });

  return (data ?? []).map((p) => ({
    ...p,
    sum_insured: p.sum_insured ? Number(p.sum_insured) : null,
    premium: p.premium ? Number(p.premium) : null,
    excess: p.excess ? Number(p.excess) : null,
    payment_frequency: (p.payment_frequency ?? "annual") as PaymentFrequency,
  }));
}

export async function createInsurancePolicy(
  ocId: string,
  data: {
    policy_type: string;
    provider: string;
    policy_number?: string;
    broker?: string;
    sum_insured?: number;
    premium?: number;
    excess?: number;
    payment_frequency?: PaymentFrequency;
    start_date: string;
    end_date: string;
    document_url?: string;
    certificate_of_currency_document_id?: string;
    certificate_of_currency_expiry?: string;
  }
) {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertData: Record<string, any> = {
    oc_id: ocId,
    policy_type: data.policy_type,
    provider: data.provider,
    policy_number: data.policy_number || null,
    broker: data.broker || null,
    sum_insured: data.sum_insured || null,
    premium: data.premium || null,
    excess: data.excess || null,
    payment_frequency: data.payment_frequency ?? "annual",
    start_date: data.start_date,
    end_date: data.end_date,
    certificate_of_currency_document_id: data.certificate_of_currency_document_id || null,
    certificate_of_currency_expiry: data.certificate_of_currency_expiry || null,
    status: new Date(data.end_date) < new Date() ? "expired" : "active",
  };
  if (data.document_url) insertData.document_url = data.document_url;

  const { data: inserted, error } = await supabase
    .from("insurance_policies")
    .insert(insertData)
    .select("id")
    .single();

  if (error) return { error: error.message };

  const policyId = (inserted as { id: string } | null)?.id;
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "create",
    entity_type: "insurance_policy",
    entity_id: policyId,
    after_state: data,
  });

  revalidatePath("/ocs/[ocCode]/insurance", "page");
  return { success: true, policyId };
}

export async function updateInsurancePolicy(
  ocId: string,
  policyId: string,
  data: {
    policy_type?: string;
    provider?: string;
    policy_number?: string;
    broker?: string;
    sum_insured?: number;
    premium?: number;
    excess?: number;
    payment_frequency?: PaymentFrequency;
    certificate_of_currency_document_id?: string | null;
    certificate_of_currency_expiry?: string | null;
    start_date?: string;
    end_date?: string;
    document_url?: string;
  }
) {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  if (data.policy_type !== undefined) updateData.policy_type = data.policy_type;
  if (data.provider !== undefined) updateData.provider = data.provider;
  if (data.policy_number !== undefined) updateData.policy_number = data.policy_number || null;
  if (data.sum_insured !== undefined) updateData.sum_insured = data.sum_insured || null;
  if (data.premium !== undefined) updateData.premium = data.premium || null;
  if (data.broker !== undefined) updateData.broker = data.broker || null;
  if (data.excess !== undefined) updateData.excess = data.excess || null;
  if (data.payment_frequency !== undefined) updateData.payment_frequency = data.payment_frequency;
  if (data.certificate_of_currency_document_id !== undefined) {
    updateData.certificate_of_currency_document_id = data.certificate_of_currency_document_id || null;
  }
  if (data.certificate_of_currency_expiry !== undefined) {
    updateData.certificate_of_currency_expiry = data.certificate_of_currency_expiry || null;
  }
  if (data.start_date !== undefined) updateData.start_date = data.start_date;
  if (data.end_date !== undefined) {
    updateData.end_date = data.end_date;
    updateData.status = new Date(data.end_date) < new Date() ? "expired" : "active";
  }
  if (data.document_url !== undefined) updateData.document_url = data.document_url || null;

  const { error } = await supabase
    .from("insurance_policies")
    .update(updateData)
    .eq("id", policyId)
    .eq("oc_id", ocId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "update",
    entity_type: "insurance_policy",
    entity_id: policyId,
    after_state: data,
  });

  revalidatePath("/ocs/[ocCode]/insurance", "page");
  return { success: true };
}

export async function deleteInsurancePolicy(ocId: string, policyId: string) {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { error } = await supabase
    .from("insurance_policies")
    .delete()
    .eq("id", policyId)
    .eq("oc_id", ocId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "delete",
    entity_type: "insurance_policy",
    entity_id: policyId,
  });

  revalidatePath("/ocs/[ocCode]/insurance", "page");
  return { success: true };
}
