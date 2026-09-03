import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { SettingsRail } from "./settings-rail";

// Shared shell for every settings section. The rail renders once and stays
// put across navigations, so moving between sections only swaps the panel.
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  const isManager = profile.role === "strata_manager" || profile.role === "super_admin";

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <SettingsRail isManager={isManager} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
