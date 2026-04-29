import { getSubdivision } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { getSubdivisionLots } from "@/lib/actions/reports";
import { ReportsContent } from "./reports-content";

import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ subdivisionCode: string }>;
}) {
  const { subdivisionCode } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;
  const [subdivision, profile, lots] = await Promise.all([
    getSubdivision(subdivisionId),
    getCurrentProfile(),
    getSubdivisionLots(subdivisionId),
  ]);

  if (!subdivision || !profile) redirect("/dashboard");

  // Get company logo
  let logoUrl: string | null = null;
  if (subdivision.management_company_id) {
    const supabase = createServerClient();
    const { data: company } = await supabase
      .from("management_companies")
      .select("logo_url")
      .eq("id", subdivision.management_company_id)
      .single();
    logoUrl = company?.logo_url ?? null;
  }

  return (
    <ReportsContent
      subdivisionId={subdivisionId}
      subdivisionName={subdivision.name}
      subdivisionAddress={subdivision.address ?? ""}
      subdivisionPlanNumber={subdivision.plan_number ?? ""}
      logoUrl={logoUrl}
      isLotOwner={profile.role === "lot_owner"}
      lots={lots}
    />
  );
}
