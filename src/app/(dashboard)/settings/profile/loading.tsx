import { SectionHeader } from "@/components/shared/section-header";
import { ProfileSkeleton } from "../settings-skeletons";

export default function Loading() {
  return (
    <>
      <SectionHeader title="My Profile" />
      <ProfileSkeleton />
    </>
  );
}
