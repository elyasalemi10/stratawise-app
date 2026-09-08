import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOnboardingRedirect } from "@/lib/auth";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { getSidebarProfile } from "@/lib/actions/profile";
import { getSidebarOCs } from "@/lib/actions/oc";
import { BreadcrumbProvider } from "@/lib/breadcrumb-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The onboarding gate used to await on its own line, ahead of everything
  // else. It is two to three Supabase round trips, and against this project
  // a round trip measures ~120ms, so every dashboard navigation began with a
  // third of a second of nothing , sequentially, before the sidebar even
  // started loading.
  //
  // It goes out WITH the sidebar fetches instead. In the case that matters ,
  // an onboarded user, i.e. every navigation after the first day , nothing
  // is wasted and the wall-clock is one round trip instead of two. In the
  // redirect case we throw away work we were about to discard anyway.
  const [onboardingRedirect, cookieStore, sidebarProfile, sidebarOCs] =
    await Promise.all([
      getOnboardingRedirect(),
      cookies(),
      getSidebarProfile(),
      getSidebarOCs(),
    ]);

  if (onboardingRedirect) {
    redirect(onboardingRedirect);
  }
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <BreadcrumbProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar
          initialProfile={sidebarProfile}
          initialOCs={sidebarOCs}
        />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <Header initialOCs={sidebarOCs} />
          </header>
          <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-background py-4 md:py-6 px-4 lg:px-6">
            {/* Centred in the space the sidebar leaves, not stretched across
                it. Without a ceiling, a three-column grid on a wide monitor
                spreads until the cards are enormous and the content hugs
                both edges, which reads as off-centre even though it is
                technically full width. The cap is generous enough that
                laptops and ordinary desktops are unaffected. */}
            <div className="mx-auto w-full min-w-0 max-w-[1600px]">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </BreadcrumbProvider>
  );
}
