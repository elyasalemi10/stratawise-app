import { getOC, getLotsWithFinancials } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LotsPageContent } from "./lots-page-content";

import { resolveOCFromCode } from "@/lib/oc-resolver";

export default async function LotsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const [oc, lots, profile] = await Promise.all([
    getOC(ocId),
    getLotsWithFinancials(ocId),
    getCurrentProfile(),
  ]);

  if (!oc) redirect("/dashboard");

  return (
    <LotsPageContent
      lots={lots}
      ocId={ocId}
      ocName={oc.name}
      isLotOwner={profile?.role === "lot_owner"}
    />
  );
}
