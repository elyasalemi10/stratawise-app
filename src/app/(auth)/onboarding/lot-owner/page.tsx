import { redirect } from "next/navigation";
import { getAuthUserId, ensureProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { TcStep } from "./tc-step";

export const dynamic = "force-dynamic";

// Lot-owner onboarding. Account-level Terms / Privacy acceptance, once per
// account, and then the dashboard.
//
// There used to be a second step per OC, asking which categories of document
// the owner consented to receive electronically. It is gone: the management
// agreement already provides for electronic delivery, so the step made every
// owner answer a question their contract had answered, and made the manager
// maintain the answer afterwards.
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

  const { count: tcCount } = await supabase
    .from("user_consents")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id);
  if (!tcCount) return <TcStep />;

  redirect("/dashboard?welcome=1");
}
