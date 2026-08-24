"use server";

import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

// One aggregate fetch for a past-tenure lot archive.
//
// The membership lookup has to come first (its joined_at / left_at bound every
// other query), but everything after it is one wave.
//
// The auth check lives here, not in page.tsx: page.tsx only runs on the
// initial shell request, so a check left up there would be skipped on every
// refresh the client drives afterwards.

export interface PastLotPageData {
  found: boolean;
  joinedAt: string;
  leftAt: string | null;
  oc: { id: string; short_code: string; name: string; address: string; plan_number: string } | null;
  lot: { id: string; lot_number: number; unit_number: string | null } | null;
  levies: Array<{
    id: string;
    reference_number: string;
    fund_type: string;
    amount: number | string;
    amount_paid: number | string;
    due_date: string;
    status: string;
    issued_at: string | null;
    period_start: string;
    period_end: string;
  }>;
  payments: Array<{
    id: string;
    reference_number: string | null;
    fund_type: string;
    amount: number | string;
    payment_date: string;
    payment_method: string;
  }>;
  comms: Array<{
    id: string;
    channel: string;
    type: string;
    subject: string | null;
    body_preview: string | null;
    sent_at: string | null;
    created_at: string;
    status: string;
  }>;
}

const NOT_FOUND: PastLotPageData = {
  found: false,
  joinedAt: "",
  leftAt: null,
  oc: null,
  lot: null,
  levies: [],
  payments: [],
  comms: [],
};

export async function getPastLotPageData(lotId: string): Promise<PastLotPageData> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");

  const supabase = createServerClient();

  // Both ended and active memberships are allowed, so managers (super_admin)
  // can preview and an owner who briefly re-bought the same lot can still see
  // their old tenure.
  const { data: membership } = await supabase
    .from("oc_members")
    .select("id, oc_id, joined_at, left_at")
    .eq("lot_id", lotId)
    .eq("profile_id", profile.id)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership) return NOT_FOUND;

  const { joined_at, left_at, oc_id } = membership;
  const until = left_at ?? new Date().toISOString();

  const [subResult, lotResult, leviesResult, paymentsResult, commsResult] =
    await Promise.all([
      supabase
        .from("owners_corporations")
        .select("id, short_code, name, address, plan_number")
        .eq("id", oc_id)
        .single(),
      supabase.from("lots").select("id, lot_number, unit_number").eq("id", lotId).single(),
      supabase
        .from("levy_notices")
        .select(
          "id, reference_number, fund_type, amount, amount_paid, due_date, status, issued_at, period_start, period_end",
        )
        .eq("lot_id", lotId)
        .gte("issued_at", joined_at)
        .lte("issued_at", until)
        .order("issued_at", { ascending: false }),
      supabase
        .from("payments")
        .select("id, reference_number, fund_type, amount, payment_date, payment_method")
        .eq("lot_id", lotId)
        .gte("payment_date", joined_at.slice(0, 10))
        .lte("payment_date", until.slice(0, 10))
        .order("payment_date", { ascending: false }),
      supabase
        .from("communication_log")
        .select("id, channel, type, subject, body_preview, sent_at, created_at, status")
        .eq("recipient_id", profile.id)
        .gte("created_at", joined_at)
        .lte("created_at", until)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (!subResult.data || !lotResult.data) return NOT_FOUND;

  return {
    found: true,
    joinedAt: joined_at,
    leftAt: left_at,
    oc: subResult.data as PastLotPageData["oc"],
    lot: lotResult.data as PastLotPageData["lot"],
    levies: (leviesResult.data ?? []) as PastLotPageData["levies"],
    payments: (paymentsResult.data ?? []) as PastLotPageData["payments"],
    comms: (commsResult.data ?? []) as PastLotPageData["comms"],
  };
}
