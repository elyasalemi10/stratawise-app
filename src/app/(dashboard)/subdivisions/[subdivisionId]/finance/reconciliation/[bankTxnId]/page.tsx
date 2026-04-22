import { redirect } from "next/navigation";
import { getBankTransactionDetail } from "@/lib/actions/reconciliation";
import { getCurrentProfile } from "@/lib/auth";
import { getSubdivision } from "@/lib/actions/subdivision";
import { MatchDetailContent } from "./match-detail-content";

interface Props {
  params: Promise<{ subdivisionId: string; bankTxnId: string }>;
}

export default async function MatchDetailPage({ params }: Props) {
  const { subdivisionId, bankTxnId } = await params;

  const [subdivision, profile, txnDetail] = await Promise.all([
    getSubdivision(subdivisionId),
    getCurrentProfile(),
    getBankTransactionDetail(bankTxnId),
  ]);

  if (!subdivision) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/subdivisions/${subdivisionId}/dashboard`);
  if (txnDetail.subdivision_id !== subdivisionId) redirect("/dashboard");

  return (
    <MatchDetailContent subdivisionId={subdivisionId} transaction={txnDetail} />
  );
}
