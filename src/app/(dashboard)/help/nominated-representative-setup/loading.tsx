import { PageSkeleton } from "@/components/shared/page-skeleton";

// CLAUDE.md "Snappy navigation": Next.js streams this component while the
// real page.tsx fetches server data, so the user sees layout immediately
// instead of waiting for the route to resolve.
export default function Loading() {
  return <PageSkeleton />;
}
