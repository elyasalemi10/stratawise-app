import { getSubdivision, getLotsWithFinancials } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LotsPageContent } from "./lots-page-content";

import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";

export default async function LotsPage({
  params,
}: {
  params: Promise<{ subdivisionCode: string }>;
}) {
  const { subdivisionCode } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;
  const [subdivision, lots, profile] = await Promise.all([
    getSubdivision(subdivisionId),
    getLotsWithFinancials(subdivisionId),
    getCurrentProfile(),
  ]);

  if (!subdivision) redirect("/dashboard");

  return (
    <LotsPageContent
      lots={lots}
      subdivisionId={subdivisionId}
      subdivisionName={subdivision.name}
      isLotOwner={profile?.role === "lot_owner"}
    />
  );
}
