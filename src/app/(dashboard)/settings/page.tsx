import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  return (
    <div>
      <PageHeader title="Settings" />
      <SettingsTabs profile={profile} />
    </div>
  );
}
