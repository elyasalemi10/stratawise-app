import { getOC } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { getOCLots } from "@/lib/actions/reports";
import { ReportsContent } from "./reports-content";

import { resolveOCFromCode } from "@/lib/oc-resolver";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const [oc, profile, lots] = await Promise.all([
    getOC(ocId),
    getCurrentProfile(),
    getOCLots(ocId),
  ]);

  if (!oc || !profile) redirect("/dashboard");

  // Get company logo
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

  return (
    <ReportsContent
      ocId={ocId}
      ocName={oc.name}
      ocAddress={oc.address ?? ""}
      ocPlanNumber={oc.plan_number ?? ""}
      logoUrl={logoUrl}
      isLotOwner={profile.role === "lot_owner"}
      lots={lots}
    />
  );
}
