import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOnboardingRedirect } from "@/lib/auth";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { getSidebarProfile } from "@/lib/actions/profile";
import { getSidebarOCs } from "@/lib/actions/oc";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const onboardingRedirect = await getOnboardingRedirect();
  if (onboardingRedirect) {
    redirect(onboardingRedirect);
  }

  // Fetch shared sidebar/header data once at the layout level so it's
  // already in the initial HTML — no client-side useEffect waterfall on
  // each navigation. Both getters are cached server-side (unstable_cache
  // on ocs; profile is per-request) and revalidated by mutations.
  const [cookieStore, sidebarProfile, sidebarOCs] = await Promise.all([
    cookies(),
    getSidebarProfile(),
    getSidebarOCs(),
  ]);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        initialProfile={sidebarProfile}
        initialOCs={sidebarOCs}
      />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-4 lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <Header initialOCs={sidebarOCs} />
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto bg-background py-4 md:py-6 px-4 lg:px-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
