import { createServerClient } from "@/lib/supabase";
import { LotDetailContent } from "./lot-detail-content";

export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ subdivisionId: string; lotId: string }>;
}) {
  const { subdivisionId, lotId } = await params;
  const supabase = createServerClient();

  const { data: lot } = await supabase
    .from("lots")
    .select("*")
    .eq("id", lotId)
    .eq("subdivision_id", subdivisionId)
    .single();

  if (!lot) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-base font-medium text-foreground">Lot not found</p>
      </div>
    );
  }

  // Get financial data
  const [leviesResult, paymentsResult] = await Promise.all([
    supabase
      .from("levy_notices")
      .select("amount")
      .eq("lot_id", lotId)
      .in("status", ["issued", "partially_paid", "overdue"]),
    supabase
      .from("payments")
      .select("amount")
      .eq("lot_id", lotId),
  ]);

  const totalLevied = leviesResult.data?.reduce((sum, l) => sum + Number(l.amount), 0) ?? 0;
  const totalPaid = paymentsResult.data?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;
  const balance = totalLevied - totalPaid;

  return (
    <LotDetailContent
      lot={lot}
      subdivisionId={subdivisionId}
      balance={balance}
    />
  );
}
