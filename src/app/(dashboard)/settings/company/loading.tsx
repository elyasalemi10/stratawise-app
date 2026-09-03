import { SectionHeader } from "@/components/shared/section-header";
import { CompanySkeleton } from "../settings-skeletons";

export default function Loading() {
  return (
    <>
      <SectionHeader title="Company" />
      <CompanySkeleton />
    </>
  );
}
