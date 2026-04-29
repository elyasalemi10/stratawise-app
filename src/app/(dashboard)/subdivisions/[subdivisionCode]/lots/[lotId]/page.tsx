import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getLotOwner } from "@/lib/actions/lot-ownership";
import { LotDetailContent } from "./lot-detail-content";
import type { DocumentRecord } from "@/lib/validations/documents";

import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";

export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ subdivisionCode: string; lotId: string }>;
}) {
  const { subdivisionCode, lotId } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;
  const profile = await getCurrentProfile();

  // Lot owners cannot view other lot owners' detail pages
  if (profile?.role === "lot_owner") {
    redirect(`/subdivisions/${subdivisionCode}/lots`);
  }

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

  // Get financial data + documents
  const [leviesResult, paymentsResult, documentsResult] = await Promise.all([
    supabase
      .from("levy_notices")
      .select("amount")
      .eq("lot_id", lotId)
      .in("status", ["issued", "partially_paid", "overdue"]),
    supabase
      .from("payments")
      .select("amount")
      .eq("lot_id", lotId),
    supabase
      .from("documents")
      .select("*")
      .eq("subdivision_id", subdivisionId)
      .eq("lot_id", lotId)
      .order("created_at", { ascending: false }),
  ]);

  const totalLevied = leviesResult.data?.reduce((sum, l) => sum + Number(l.amount), 0) ?? 0;
  const totalPaid = paymentsResult.data?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;
  const balance = totalLevied - totalPaid;

  const documents = (documentsResult.data as DocumentRecord[]) ?? [];

  const owner = await getLotOwner(supabase, lotId);

  return (
    <LotDetailContent
      lot={lot}
      owner={owner}
      subdivisionId={subdivisionId}
      balance={balance}
      documents={documents}
    />
  );
}
