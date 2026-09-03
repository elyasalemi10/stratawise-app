import { redirect } from "next/navigation";
import { SectionHeader } from "../section-header";
import { getCurrentProfile } from "@/lib/auth";
import { NotificationsTab } from "../notifications-tab";
import { getNotificationSettings } from "../data";

export default async function Page() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  const { currentPreferences, autoOptOuts } = await getNotificationSettings();
  return (
    <>
      <SectionHeader title="Notifications" />
    <NotificationsTab
      currentPreferences={currentPreferences}
      autoOptOuts={autoOptOuts}
    />
    </>
  );
}
