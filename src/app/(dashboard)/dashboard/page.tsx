import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { SectionCards } from "./_components/section-cards";
import { ChartArea } from "./_components/chart-area";
import { RecentActivity } from "./_components/recent-activity";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  return (
    <div className="space-y-6">
      <SectionCards />
      <ChartArea />
      <RecentActivity />
    </div>
  );
}
