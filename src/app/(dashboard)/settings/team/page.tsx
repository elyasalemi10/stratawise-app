import { redirect } from "next/navigation";
import { SectionHeader } from "../section-header";
import { getCurrentProfile } from "@/lib/auth";
import { TeamTab } from "../team-tab";
import { getTeamMembers } from "@/lib/actions/team";

export default async function Page() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect("/settings/profile");
  return (
    <>
      <SectionHeader title="Team" />
    <TeamTab
      members={await getTeamMembers()}
      currentUserId={profile.id}
      isAdmin={profile.company_role === "admin"}
    />
    </>
  );
}
