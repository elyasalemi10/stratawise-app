"use server";

import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export interface InsurancePolicy {
  id: string;
  subdivision_id: string;
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

export async function getInsurancePolicies(subdivisionId: string): Promise<InsurancePolicy[]> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("insurance_policies")
    .select("*")
    .eq("subdivision_id", subdivisionId)
    .order("start_date", { ascending: false });

  return (data ?? []).map((p) => ({
    ...p,
    sum_insured: p.sum_insured ? Number(p.sum_insured) : null,
    premium: p.premium ? Number(p.premium) : null,
  }));
}

export async function createInsurancePolicy(
  subdivisionId: string,
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
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { error } = await supabase
    .from("insurance_policies")
    .insert({
      subdivision_id: subdivisionId,
      policy_type: data.policy_type,
      provider: data.provider,
      policy_number: data.policy_number || null,
      sum_insured: data.sum_insured || null,
      premium: data.premium || null,
      start_date: data.start_date,
      end_date: data.end_date,
      document_url: data.document_url || null,
      status: new Date(data.end_date) < new Date() ? "expired" : "active",
    });

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "create",
    entity_type: "insurance_policy",
    after_state: data,
  });

  revalidatePath(`/subdivisions/${subdivisionId}/finance`);
  return { success: true };
}
