import { SectionHeader } from "@/components/shared/section-header";
import { TeamSkeleton } from "../settings-skeletons";

export default function Loading() {
  return (
    <>
      <SectionHeader title="Team" />
      <TeamSkeleton />
    </>
  );
}
