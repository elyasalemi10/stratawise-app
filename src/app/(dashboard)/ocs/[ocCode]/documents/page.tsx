import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { DocumentsClient } from "./documents-client";

// Shell only. Data fetching lives in DocumentsClient via useCachedData so a
// return visit paints from the tab cache instead of a server round trip.

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");

  return <DocumentsClient ocId={resolved.id} />;
}
