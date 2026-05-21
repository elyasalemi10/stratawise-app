import { redirect } from "next/navigation";
import { getAuthUserId, ensureProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { TcStep } from "./tc-step";
import { OcConsentStep } from "./oc-consent-step";

export const dynamic = "force-dynamic";

// Lot-owner onboarding router. Runs, in order:
//   1. Account-level Terms / Privacy acceptance (once per account).
//   2. Per-OC digital-consent — one step for each OC the owner belongs to
//      that they haven't consented for yet. Consent is per (owner, OC), so an
//      owner who already has an account still completes this for each new OC.
// Falls through to the dashboard once everything's done.
export default async function LotOwnerOnboardingPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/sign-in");
  await ensureProfile();

  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", userId)
    .single();

  if (!profile) redirect("/onboarding");
  if (profile.role !== "lot_owner") redirect("/onboarding");

  // Step 1 — account-level T&C.
  const { count: tcCount } = await supabase
    .from("user_consents")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id);
  if (!tcCount) return <TcStep />;

  // Step 2 — per-OC consent. Find OC memberships missing a consent record.
  const { data: memberships } = await supabase
    .from("oc_members")
    .select("oc_id, lot_id, owners_corporations(name)")
    .eq("profile_id", profile.id)
    .eq("role", "lot_owner")
    .is("left_at", null);

  const ocIds = [...new Set((memberships ?? []).map((m) => m.oc_id))];
  if (ocIds.length === 0) redirect("/dashboard?welcome=1");

  const { data: consents } = await supabase
    .from("oc_member_consents")
    .select("oc_id")
    .eq("profile_id", profile.id)
    .in("oc_id", ocIds);
  const consented = new Set((consents ?? []).map((c) => c.oc_id));

  const pending = (memberships ?? []).find((m) => !consented.has(m.oc_id));
  if (!pending) redirect("/dashboard?welcome=1");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ocName = (pending as any).owners_corporations?.name ?? "your Owners Corporation";

  // Prefill from what the manager recorded the owner wants asked at signup
  // (falls back to all categories inside the step when empty).
  let initialCategories: string[] = [];
  if (pending.lot_id) {
    const { data: lotOwner } = await supabase
      .from("lot_owners")
      .select("at_portal_signup_categories, digital_consent_categories")
      .eq("lot_id", pending.lot_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    initialCategories =
      (lotOwner?.at_portal_signup_categories as string[] | null) ??
      (lotOwner?.digital_consent_categories as string[] | null) ??
      [];
  }

  return (
    <OcConsentStep ocId={pending.oc_id} ocName={ocName} initialCategories={initialCategories} />
  );
}
