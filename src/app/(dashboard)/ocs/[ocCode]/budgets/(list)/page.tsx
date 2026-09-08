import { notFound } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { BudgetsClient } from "../budgets-client";

// Shell only: resolve the OC code (a bad code has to redirect before
// anything renders) and hand off. Data and auth live in data.ts.
export default async function BudgetsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) notFound();

  return <BudgetsClient ocId={resolved.id} />;
}
