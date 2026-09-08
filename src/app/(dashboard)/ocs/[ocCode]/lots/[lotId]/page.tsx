import { notFound } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { LotDetailClient } from "./lot-detail-client";

// Shell only: resolve the OC code and hand off. Data and auth live in data.ts.
export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ ocCode: string; lotId: string }>;
}) {
  const { ocCode, lotId } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) notFound();


  return <LotDetailClient ocId={resolved.id} lotId={lotId} />;
}
