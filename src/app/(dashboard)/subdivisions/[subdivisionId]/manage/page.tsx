import { getSubdivision, getSubdivisionManageStats, getLotsWithFinancials } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { getSubdivisionDocuments } from "./document-actions";
import { ManageContent } from "./manage-content";

export default async function ManageSubdivisionPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;

  const [subdivision, stats, lots, documents, profile] = await Promise.all([
    getSubdivision(subdivisionId),
    getSubdivisionManageStats(subdivisionId),
    getLotsWithFinancials(subdivisionId),
    getSubdivisionDocuments(subdivisionId),
    getCurrentProfile(),
  ]);

  if (!subdivision) return null;

  return (
    <ManageContent
      subdivision={subdivision}
      stats={stats}
      lots={lots}
      documents={documents}
      isLotOwner={profile?.role === "lot_owner"}
    />
  );
}
