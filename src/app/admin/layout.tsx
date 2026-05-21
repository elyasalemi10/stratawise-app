import { cookies } from "next/headers";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/layout/admin-sidebar";

// Admin chrome — same shadcn sidebar shell + styling as the manager
// dashboard, with admin-specific navigation. Each /admin page owns its own
// super_admin + MFA gate (evaluateSuperAdminGate / requireSuperAdminAal1OrAbove),
// so the layout doesn't gate — having it redirect would loop when the gate's
// destination lives inside this same layout.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AdminSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <span className="text-sm font-medium text-foreground">Super Admin</span>
        </header>
        <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-background py-4 md:py-6 px-4 lg:px-6">
          <div className="min-w-0">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
