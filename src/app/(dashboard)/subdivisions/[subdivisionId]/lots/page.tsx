import { getSubdivision, getLotsWithFinancials } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LotsPageContent } from "./lots-page-content";

export default async function LotsPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
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
