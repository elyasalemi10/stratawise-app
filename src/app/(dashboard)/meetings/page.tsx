import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { EmptyState } from "@/components/shared/empty-state";

export default async function MeetingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "lot_owner") redirect("/dashboard");

  return (
    <EmptyState
      icon={CalendarDays}
      title="No meetings yet"
      description="Meeting notices, agendas, and minutes will appear here once your strata manager schedules them."
    />
  );
}
