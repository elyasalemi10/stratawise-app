import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getNotifications } from "@/lib/actions/notifications";
import { InboxContent } from "./inbox-content";

export default async function InboxPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  const notifications = await getNotifications(50);

  return <InboxContent notifications={notifications} />;
}
