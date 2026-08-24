import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { SettingsClient } from "./settings-client";

// Shell only: auth and redirect. Data comes from the client through
// useCachedData, so returning to settings paints from the tab cache.
export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  return <SettingsClient />;
}
