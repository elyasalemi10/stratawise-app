import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getNotifications } from "@/lib/actions/notifications";
import {
  resolveInboxRowProviders,
  prefetchInboxEmails,
} from "@/lib/actions/inbox-email";
import { InboxContent } from "./inbox-content";

export default async function InboxPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  const notifications = await getNotifications(50);

  // Two server-side enrichments in parallel:
  //   1. provider hint for each row (Gmail / Outlook glyph)
  //   2. full email body for the top 5 unread email_reply rows so the
  //      detail pane renders instantly the first time the manager clicks
  //      one (instead of flashing "Loading email…")
  const [rowProviders, prefetchedEmails] = await Promise.all([
    resolveInboxRowProviders(notifications),
    prefetchInboxEmails(notifications, 5),
  ]);

  // InboxContent reads `?n=<id>` via useSearchParams, which needs a
  // Suspense boundary on the server side.
  return (
    <Suspense>
      <InboxContent
        notifications={notifications}
        rowProviders={rowProviders}
        prefetchedEmails={prefetchedEmails}
      />
    </Suspense>
  );
}
