import { getSubdivision } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSubdivisionLots } from "@/lib/actions/reports";
import { ReportsContent } from "./reports-content";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const [subdivision, profile, lots] = await Promise.all([
    getSubdivision(subdivisionId),
    getCurrentProfile(),
    getSubdivisionLots(subdivisionId),
  ]);

  if (!subdivision || !profile) redirect("/dashboard");

  return (
    <ReportsContent
      subdivisionId={subdivisionId}
      isLotOwner={profile.role === "lot_owner"}
      lots={lots}
    />
  );
}
