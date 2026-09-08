import { notFound } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { OCOverviewClient } from "../oc-overview-client";

// Shell only: resolve the OC code and hand off. Data and auth live in data.ts.
//
// The old DRN-import prompt block that used to run here computed
// `showDrnPrompt` and `lotsForDrn` and then discarded both through `void`,
// costing up to three round trips on any arrival carrying ?created=1. It is
// gone; DRN onboarding will be rebuilt as part of the new flow.
export default async function OCOverviewPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) notFound();

  return <OCOverviewClient ocId={resolved.id} ocCode={ocCode} />;
}
