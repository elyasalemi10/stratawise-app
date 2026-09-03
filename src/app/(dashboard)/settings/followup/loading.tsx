import { SectionHeader } from "@/components/shared/section-header";
import { FollowupSkeleton } from "../followup-skeleton";

export default function Loading() {
  return (
    <>
      <SectionHeader title="Levy follow-up" />
      <FollowupSkeleton />
    </>
  );
}
