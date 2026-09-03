import { SectionHeader } from "@/components/shared/section-header";
import { EmailSkeleton } from "../settings-skeletons";

export default function Loading() {
  return (
    <>
      <SectionHeader title="Email" />
      <EmailSkeleton />
    </>
  );
}
