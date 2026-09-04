"use client";

import { useParams } from "next/navigation";
import { PastLotClient } from "./past-lot-client";
import { PastLotSkeleton } from "./past-lot-skeleton";

// Renders the REAL page, not a skeleton.
//
// A loading.tsx is the only thing on screen while the server shell resolves,
// and a skeleton here overwrites content the tab already has: PastLotClient
// reads the client cache and paints the lot you were looking at a moment
// ago, but it never got the chance, because this boundary shimmered over the
// top of it first and then handed over. The lot id is a route segment, so
// this boundary can read it straight off the URL. The two mounts share one
// request (see use-cached-data).
export default function Loading() {
  const { lotId } = useParams<{ lotId: string }>();
  if (!lotId) return <PastLotSkeleton />;
  return <PastLotClient lotId={lotId} />;
}
