import { redirect } from "next/navigation";
import { getSubdivision } from "@/lib/actions/subdivision";
import { getLevyBatchDetail } from "@/lib/actions/levy";
import { BatchDetailContent } from "./batch-detail-content";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ subdivisionId: string; batchId: string }>;
}) {
  const { subdivisionId, batchId } = await params;
  const [subdivision, batch] = await Promise.all([
    getSubdivision(subdivisionId),
    getLevyBatchDetail(subdivisionId, batchId),
  ]);

  if (!subdivision || !batch) redirect(`/subdivisions/${subdivisionId}/finance/levies`);

  return (
    <BatchDetailContent
      subdivisionId={subdivisionId}
      batch={batch}
    />
  );
}
