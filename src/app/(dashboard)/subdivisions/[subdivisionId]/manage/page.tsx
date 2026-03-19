import { getSubdivision, getSubdivisionManageStats } from "@/lib/actions/subdivision";
import { ManageContent } from "./manage-content";

export default async function ManageSubdivisionPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;

  const [subdivision, stats] = await Promise.all([
    getSubdivision(subdivisionId),
    getSubdivisionManageStats(subdivisionId),
  ]);

  if (!subdivision) return null;

  return (
    <ManageContent
      subdivision={subdivision}
      stats={stats}
    />
  );
}
