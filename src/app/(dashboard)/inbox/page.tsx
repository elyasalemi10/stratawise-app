import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getNotifications } from "@/lib/actions/notifications";
import { resolveInboxRowProviders } from "@/lib/actions/inbox-email";
import { InboxContent } from "./inbox-content";

export default async function InboxPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  const notifications = await getNotifications(50);

  // Pre-resolve provider hint (gmail / outlook) for every email_reply
  // row so the list shows the right glyph without per-row round-trips.
  // Newer notifications carry it on metadata; older ones get backfilled
  // by joining communication_log.recipient_email against
  // gmail_mailbox_subscriptions.
  const rowProviders = await resolveInboxRowProviders(notifications);

  // InboxContent reads `?n=<id>` via useSearchParams, which needs a
  // Suspense boundary on the server side.
  return (
    <Suspense>
      <InboxContent notifications={notifications} rowProviders={rowProviders} />
    </Suspense>
  );
}
