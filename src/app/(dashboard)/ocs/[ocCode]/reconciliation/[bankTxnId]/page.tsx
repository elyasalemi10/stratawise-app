import { redirect } from "next/navigation";
import { getBankTransactionDetail } from "@/lib/actions/reconciliation";
import { getCurrentProfile } from "@/lib/auth";
import { getOC } from "@/lib/actions/oc";
import { MatchDetailContent } from "./match-detail-content";

import { resolveOCFromCode } from "@/lib/oc-resolver";

interface Props {
  params: Promise<{ ocCode: string; bankTxnId: string }>;
  searchParams: Promise<{ prefill_lot?: string }>;
}

export default async function MatchDetailPage({ params, searchParams }: Props) {
  const { ocCode, bankTxnId } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const sp = await searchParams;

  const [oc, profile, txnDetail] = await Promise.all([
    getOC(ocId),
    getCurrentProfile(),
    getBankTransactionDetail(bankTxnId),
  ]);

  if (!oc) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/ocs/${ocCode}`);
  if (txnDetail.oc_id !== ocId) redirect("/dashboard");

  return (
    <MatchDetailContent
      ocId={ocId}
      transaction={txnDetail}
      prefillLotId={sp.prefill_lot ?? null}
    />
  );
}
