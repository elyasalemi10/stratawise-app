import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getCompanyData } from "./actions";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  const company = profile.role !== "lot_owner" ? await getCompanyData() : null;

  return <SettingsTabs profile={profile} company={company} />;
}
