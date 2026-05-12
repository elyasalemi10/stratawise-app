import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { listMyPaymentClaims } from "@/lib/actions/owner-payment-claims";
import { MyPaymentsContent } from "./my-payments-content";

export default async function MyPaymentsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "lot_owner") redirect(`/ocs/${ocCode}`);

  const supabase = createServerClient();

  // Active lots for this owner in this oc (for the lot picker).
  const { data: memberships } = await supabase
    .from("oc_members")
    .select("lot_id, lots(id, lot_number, unit_number)")
    .eq("oc_id", ocId)
    .eq("profile_id", profile.id)
    .eq("role", "lot_owner")
    .is("left_at", null);

  const ownerLots = (memberships ?? [])
    .map((m) => {
      const row = m as unknown as {
        lot_id: string | null;
        lots:
          | { id: string; lot_number: number | null; unit_number: string | null }
          | Array<{ id: string; lot_number: number | null; unit_number: string | null }>
          | null;
      };
      if (!row.lot_id || !row.lots) return null;
      const lot = Array.isArray(row.lots) ? row.lots[0] : row.lots;
      if (!lot) return null;
      return {
        id: row.lot_id,
        lot_number: lot.lot_number,
        unit_number: lot.unit_number,
      };
    })
    .filter((l): l is { id: string; lot_number: number | null; unit_number: string | null } => l !== null);

  const claims = await listMyPaymentClaims(ocId);

  return (
    <MyPaymentsContent
      ocId={ocId}
      ownerLots={ownerLots}
      claims={claims.rows}
    />
  );
}
