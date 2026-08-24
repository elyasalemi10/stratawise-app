"use server";

import { getOC } from "@/lib/actions/oc";
import { getInsurancePolicies } from "@/lib/actions/insurance";
import { getActiveManagementAgreement } from "@/lib/actions/management-transfer";
import { requireOCAccess } from "@/lib/auth";

export interface InsurancePageData {
  policies: Awaited<ReturnType<typeof getInsurancePolicies>>;
  readOnly: boolean;
  managementStartDate: string | null;
  fyStartMonth: number;
}

export async function getInsurancePageData(ocId: string): Promise<InsurancePageData> {
  const profile = await requireOCAccess(ocId);

  const [oc, policies, agreement] = await Promise.all([
    getOC(ocId),
    getInsurancePolicies(ocId),
    getActiveManagementAgreement(ocId),
  ]);
  if (!oc) throw new Error("Owners Corporation not found.");

  return {
    policies,
    readOnly: profile.role === "lot_owner",
    managementStartDate: agreement?.start_date ?? null,
    fyStartMonth: oc.financial_year_start_month ?? 7,
  };
}
