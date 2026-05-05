import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth";
import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";
import { listManagerPaymentClaims } from "@/lib/actions/owner-payment-claims";
import { ClaimsContent } from "./claims-content";

interface Props {
  params: Promise<{ subdivisionCode: string }>;
  /** PP5-D-C-A: ?orphan=1 narrows to MATCHED claims that are orphaned
   *  (bank tx voided / ledger entry voided / FK SET NULL). Default
   *  shows pending claims. Mutually exclusive lists. */
  searchParams: Promise<{ orphan?: string }>;
}

export default async function PaymentClaimsQueuePage({
  params,
  searchParams,
}: Props) {
  const { subdivisionCode } = await params;
  const sp = await searchParams;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect(`/subdivisions/${subdivisionCode}`);

  const orphanMode = sp.orphan === "1";
  const { rows } = await listManagerPaymentClaims(subdivisionId, {
    orphan: orphanMode || undefined,
  });

  return <ClaimsContent rows={rows} orphanMode={orphanMode} />;
}
