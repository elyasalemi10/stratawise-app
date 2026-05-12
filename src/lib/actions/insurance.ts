"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export interface InsurancePolicy {
  id: string;
  oc_id: string;
  policy_type: string;
  provider: string;
  policy_number: string | null;
  sum_insured: number | null;
  premium: number | null;
  start_date: string;
  end_date: string;
  document_url: string | null;
  status: string;
  created_at: string;
}

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
  }));
}

export async function createInsurancePolicy(
  ocId: string,
  data: {
    policy_type: string;
    provider: string;
    policy_number?: string;
    sum_insured?: number;
    premium?: number;
    start_date: string;
    end_date: string;
    document_url?: string;
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
    sum_insured: data.sum_insured || null,
    premium: data.premium || null,
    start_date: data.start_date,
    end_date: data.end_date,
    status: new Date(data.end_date) < new Date() ? "expired" : "active",
  };
  if (data.document_url) insertData.document_url = data.document_url;

  const { error } = await supabase
    .from("insurance_policies")
    .insert(insertData);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "create",
    entity_type: "insurance_policy",
    after_state: data,
  });

  revalidatePath("/ocs/[ocCode]/insurance", "page");
  return { success: true };
}

export async function updateInsurancePolicy(
  ocId: string,
  policyId: string,
  data: {
    policy_type?: string;
    provider?: string;
    policy_number?: string;
    sum_insured?: number;
    premium?: number;
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
