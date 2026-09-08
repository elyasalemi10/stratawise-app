import { notFound } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { LeviesClient } from "../levies-client";

export default async function LeviesPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) notFound();

  return <LeviesClient ocId={resolved.id} ocCode={ocCode} />;
}
