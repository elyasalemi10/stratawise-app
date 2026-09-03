import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { TeamTab } from "../team-tab";
import { getTeamMembers } from "@/lib/actions/team";

export default async function Page() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect("/settings/profile");
  return (
    <TeamTab
      members={await getTeamMembers()}
      currentUserId={profile.id}
      isAdmin={profile.company_role === "admin"}
    />
  );
}
