import { redirect } from "next/navigation";
import { getBankTransactionDetail } from "@/lib/actions/reconciliation";
import { getCurrentProfile } from "@/lib/auth";
import { getSubdivision } from "@/lib/actions/subdivision";
import { MatchDetailContent } from "./match-detail-content";

interface Props {
  params: Promise<{ subdivisionId: string; bankTxnId: string }>;
  searchParams: Promise<{ prefill_lot?: string }>;
}

export default async function MatchDetailPage({ params, searchParams }: Props) {
  const { subdivisionId, bankTxnId } = await params;
  const sp = await searchParams;

  const [subdivision, profile, txnDetail] = await Promise.all([
    getSubdivision(subdivisionId),
    getCurrentProfile(),
    getBankTransactionDetail(bankTxnId),
  ]);

  if (!subdivision) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/subdivisions/${subdivisionId}/dashboard`);
  if (txnDetail.subdivision_id !== subdivisionId) redirect("/dashboard");

  return (
    <MatchDetailContent
      subdivisionId={subdivisionId}
      transaction={txnDetail}
      prefillLotId={sp.prefill_lot ?? null}
    />
  );
}
