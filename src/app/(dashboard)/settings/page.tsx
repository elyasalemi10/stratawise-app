import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getCompanyData } from "./actions";
import { getTeamMembers } from "@/lib/actions/team";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  const isManager = profile.role === "strata_manager" || profile.role === "super_admin";
  const [company, teamMembers] = isManager
    ? await Promise.all([getCompanyData(), getTeamMembers()])
    : [null, []];

  return (
    <SettingsTabs
      profile={profile}
      company={company}
      teamMembers={teamMembers}
    />
  );
}
