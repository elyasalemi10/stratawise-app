import { cookies } from "next/headers";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { AdminHeader } from "@/components/layout/admin-header";
import { BreadcrumbProvider } from "@/lib/breadcrumb-context";
import { getSidebarProfile } from "@/lib/actions/profile";

// Admin console chrome , same shadcn sidebar shell + styling as the manager
// dashboard, with admin-specific navigation. Each console page owns its own
// super_admin + MFA gate (evaluateSuperAdminGate), so this layout doesn't
// gate. The MFA enrol / challenge pages live OUTSIDE this group so they
// render with no sidebar , a user who hasn't finished MFA has nothing to
// click and can't reach the console.
export default async function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cookieStore, profile] = await Promise.all([cookies(), getSidebarProfile()]);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <BreadcrumbProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AdminSidebar profile={profile} />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <AdminHeader />
          </header>
          <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-background py-4 md:py-6 px-4 lg:px-6">
            <div className="min-w-0">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </BreadcrumbProvider>
  );
}
