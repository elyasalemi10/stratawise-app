import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOnboardingRedirect } from "@/lib/auth";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const onboardingRedirect = await getOnboardingRedirect();
  if (onboardingRedirect) {
    redirect(onboardingRedirect);
  }

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-4 lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <Header />
        </header>
        <main className="flex-1 overflow-y-auto bg-background py-4 md:py-6 px-4 lg:px-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
