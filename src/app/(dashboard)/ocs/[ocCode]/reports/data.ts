"use server";

import { getOC } from "@/lib/actions/oc";
import { ocLegalName } from "@/lib/oc-legal-name";
import { requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getOCLots } from "@/lib/actions/reports";

export interface ReportsPageData {
  ocName: string;
  ocAddress: string;
  ocPlanNumber: string;
  logoUrl: string | null;
  isLotOwner: boolean;
  lots: Awaited<ReturnType<typeof getOCLots>>;
}

export async function getReportsPageData(ocId: string): Promise<ReportsPageData> {
  const profile = await requireOCAccess(ocId);

  const [oc, lots] = await Promise.all([getOC(ocId), getOCLots(ocId)]);
  if (!oc) throw new Error("Owners Corporation not found.");

  // The logo lookup needs the company id off the OC, so it cannot join the
  // batch above.
  let logoUrl: string | null = null;
  if (oc.management_company_id) {
    const supabase = createServerClient();
    const { data: company } = await supabase
      .from("management_companies")
      .select("logo_url")
      .eq("id", oc.management_company_id)
      .single();
    logoUrl = company?.logo_url ?? null;
  }

  return {
    // The LEGAL name, not the manager's nickname: every report here is a
    // document a lot owner or a purchaser can end up holding, and "Melia St"
    // names nothing. See src/lib/oc-legal-name.ts.
    ocName: ocLegalName(oc),
    ocAddress: oc.address ?? "",
    ocPlanNumber: oc.plan_number ?? "",
    logoUrl,
    isLotOwner: profile.role === "lot_owner",
    lots,
  };
}
