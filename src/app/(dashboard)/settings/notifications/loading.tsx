import { SectionHeader } from "@/components/shared/section-header";
import { NotificationsSkeleton } from "../notifications-skeleton";

export default function Loading() {
  return (
    <>
      <SectionHeader title="Notifications" />
      <NotificationsSkeleton />
    </>
  );
}
