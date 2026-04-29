import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { MyLeviesContent } from "./my-levies-content";

import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";

export default async function MyLeviesPage({
  params,
}: {
  params: Promise<{ subdivisionCode: string }>;
}) {
  const { subdivisionCode } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "lot_owner") redirect(`/subdivisions/${subdivisionCode}`);

  const supabase = createServerClient();

  const { data: memberships } = await supabase
    .from("subdivision_members")
    .select("lot_id")
    .eq("subdivision_id", subdivisionId)
    .eq("profile_id", profile.id)
    .eq("role", "lot_owner")
    .is("left_at", null);

  const lotIds = (memberships ?? []).map((m) => m.lot_id).filter(Boolean) as string[];

  if (lotIds.length === 0) {
    return <MyLeviesContent levies={[]} />;
  }

  const { data: levies } = await supabase
    .from("levy_notices")
    .select("id, lot_id, reference_number, period_start, period_end, amount, status, due_date, pdf_url, issued_at")
    .in("lot_id", lotIds)
    .in("status", ["issued", "partially_paid", "paid", "overdue"])
    .order("due_date", { ascending: false });

  const levyIds = (levies ?? []).map((l) => l.id);
  const { data: allPayments } = levyIds.length > 0
    ? await supabase.from("payments").select("levy_notice_id, amount").in("levy_notice_id", levyIds)
    : { data: [] };

  // Build payment map
  const paymentsByLevy = new Map<string, number>();
  (allPayments ?? []).forEach((p) => {
    paymentsByLevy.set(p.levy_notice_id, (paymentsByLevy.get(p.levy_notice_id) ?? 0) + Number(p.amount));
  });

  // Enrich levies with paid amount
  const enrichedLevies = (levies ?? []).map((l) => ({
    ...l,
    amount_paid: paymentsByLevy.get(l.id) ?? 0,
  }));

  return <MyLeviesContent levies={enrichedLevies} />;
}
