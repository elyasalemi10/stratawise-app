import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getNotifications } from "@/lib/actions/notifications";
import { InboxContent } from "./inbox-content";

export default async function InboxPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  const notifications = await getNotifications(50);

  // InboxContent reads `?n=<id>` via useSearchParams, which needs a
  // Suspense boundary on the server side.
  return (
    <Suspense>
      <InboxContent notifications={notifications} />
    </Suspense>
  );
}
