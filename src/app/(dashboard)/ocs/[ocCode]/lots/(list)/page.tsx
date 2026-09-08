import { notFound } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { LotsClient } from "../lots-client";

// Shell only. Resolving the OC code needs the server (and a bad code has to
// redirect before anything renders), but no page data is fetched here: that
// is LotsClient's job through useCachedData, so a return visit paints from
// the tab cache instead of waiting on a server round trip.
//
// Per-request auth for the data itself lives in data.ts, which is where it
// has to be now that the client drives every fetch after the first.

export default async function LotsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) notFound();

  return <LotsClient ocId={resolved.id} />;
}
