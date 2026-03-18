import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  return <SettingsTabs profile={profile} />;
}
