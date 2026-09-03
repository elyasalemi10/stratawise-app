import { redirect } from "next/navigation";
import { SectionHeader } from "../section-header";
import { getCurrentProfile } from "@/lib/auth";
import { FollowupTab } from "../followup-tab";

export default async function Page() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect("/settings/profile");
  return (
    <>
      <SectionHeader title="Levy follow-up" />
      <FollowupTab />
    </>
  );
}
