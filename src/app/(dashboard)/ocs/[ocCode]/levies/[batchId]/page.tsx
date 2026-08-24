import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { BatchDetailClient } from "./batch-detail-client";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ ocCode: string; batchId: string }>;
}) {
  const { ocCode, batchId } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");

  return <BatchDetailClient ocId={resolved.id} batchId={batchId} />;
}
