import { getSubdivision, getSubdivisionManageStats, getLotsWithFinancials } from "@/lib/actions/subdivision";
import { ManageContent } from "./manage-content";

export default async function ManageSubdivisionPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;

  const [subdivision, stats, lots] = await Promise.all([
    getSubdivision(subdivisionId),
    getSubdivisionManageStats(subdivisionId),
    getLotsWithFinancials(subdivisionId),
  ]);

  if (!subdivision) return null;

  return (
    <ManageContent
      subdivision={subdivision}
      stats={stats}
      lots={lots}
    />
  );
}
