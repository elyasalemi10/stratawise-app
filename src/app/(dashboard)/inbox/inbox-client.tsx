"use client";

import { Suspense } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { InboxContent } from "./inbox-content";
import { getInboxPageData, type InboxPageData } from "./data";
import { InboxSkeleton } from "./inbox-skeleton";

// Data lives here, not in page.tsx, so returning to the inbox paints the
// previous rows instantly from the tab cache instead of a server round trip.

export function InboxClient() {
  const { data, loading } = useCachedData<InboxPageData>("inbox", getInboxPageData);

  if (loading || !data) return <InboxSkeleton />;

  // InboxContent reads `?n=<id>` via useSearchParams, which needs a
  // Suspense boundary above it.
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <InboxContent
        notifications={data.notifications}
        rowProviders={data.rowProviders}
        prefetchedEmails={data.prefetchedEmails}
        allOwnerships={data.allOwnerships}
      />
    </Suspense>
  );
}
