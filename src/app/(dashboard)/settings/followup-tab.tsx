"use client";

import { useCachedData } from "@/lib/use-cached-data";
import { getCompanyFollowup } from "@/lib/actions/followup";
import { FollowupEditor } from "@/components/shared/followup-editor";
import { FollowupSkeleton } from "./followup-skeleton";
import type { FollowupWorkflow } from "@/lib/validations/escalation";

// Cached like every other data page: coming back paints the last workflow
// instantly and re-checks behind it, instead of a fresh fetch-and-spin.
export function FollowupTab() {
  const { data, loading } = useCachedData<FollowupWorkflow | null>(
    "company-followup",
    getCompanyFollowup,
  );

  if (loading) return <FollowupSkeleton />;

  if (!data) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        No follow-up workflow is set up yet.
      </p>
    );
  }

  return <FollowupEditor workflow={data} />;
}
