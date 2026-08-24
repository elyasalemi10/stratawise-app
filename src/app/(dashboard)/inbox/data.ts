"use server";

import { getCurrentProfile } from "@/lib/auth";
import { getInboxNotifications } from "@/lib/actions/notifications";
import {
  resolveInboxRowProviders,
  prefetchInboxEmails,
  listAllPeopleOwnerships,
} from "@/lib/actions/inbox-email";

// One aggregate fetch, called from the client through useCachedData.
//
// The auth check lives HERE as well as in page.tsx: page.tsx only runs on the
// initial shell request, so once the client owns every subsequent refresh a
// check left only up there would be skipped.

export interface InboxPageData {
  notifications: Awaited<ReturnType<typeof getInboxNotifications>>;
  rowProviders: Awaited<ReturnType<typeof resolveInboxRowProviders>>;
  prefetchedEmails: Awaited<ReturnType<typeof prefetchInboxEmails>>;
  allOwnerships: Awaited<ReturnType<typeof listAllPeopleOwnerships>>;
}

export async function getInboxPageData(): Promise<InboxPageData> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");

  const notifications = await getInboxNotifications(50);

  // Three server-side enrichments in parallel:
  //   1. provider hint for each row (Gmail glyph)
  //   2. full email body for the top 5 unread email_reply rows so the
  //      detail pane renders instantly the first time the manager clicks
  //      one (instead of flashing "Loading email…")
  //   3. full ownership list for the firm so the link-to-lot popover
  //      filters client-side with zero network round trips per keystroke
  const [rowProviders, prefetchedEmails, allOwnerships] = await Promise.all([
    resolveInboxRowProviders(notifications),
    prefetchInboxEmails(notifications, 5),
    listAllPeopleOwnerships(),
  ]);

  return { notifications, rowProviders, prefetchedEmails, allOwnerships };
}
