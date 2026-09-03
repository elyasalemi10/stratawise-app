import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { NotificationsTab } from "../notifications-tab";
import { getNotificationSettings } from "../data";

export default async function Page() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  const { currentPreferences, autoOptOuts } = await getNotificationSettings();
  return (
    <NotificationsTab
      currentPreferences={currentPreferences}
      autoOptOuts={autoOptOuts}
    />
  );
}
