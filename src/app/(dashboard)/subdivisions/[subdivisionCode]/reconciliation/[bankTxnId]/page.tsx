import { redirect } from "next/navigation";
import { getBankTransactionDetail } from "@/lib/actions/reconciliation";
import { getCurrentProfile } from "@/lib/auth";
import { getSubdivision } from "@/lib/actions/subdivision";
import { MatchDetailContent } from "./match-detail-content";

import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";

interface Props {
  params: Promise<{ subdivisionCode: string; bankTxnId: string }>;
  searchParams: Promise<{ prefill_lot?: string }>;
}

export default async function MatchDetailPage({ params, searchParams }: Props) {
  const { subdivisionCode, bankTxnId } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;
  const sp = await searchParams;

  const [subdivision, profile, txnDetail] = await Promise.all([
    getSubdivision(subdivisionId),
    getCurrentProfile(),
    getBankTransactionDetail(bankTxnId),
  ]);

  if (!subdivision) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/subdivisions/${subdivisionCode}`);
  if (txnDetail.subdivision_id !== subdivisionId) redirect("/dashboard");

  return (
    <MatchDetailContent
      subdivisionId={subdivisionId}
      transaction={txnDetail}
      prefillLotId={sp.prefill_lot ?? null}
    />
  );
}
