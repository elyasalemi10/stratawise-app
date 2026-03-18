import { SignOutButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar will be added in Phase 1 */}
      <main className="flex-1 bg-background px-6 py-6">
        <div className="flex justify-end mb-4">
          <SignOutButton redirectUrl="/">
            <button className="inline-flex items-center gap-2 rounded-md h-9 px-4 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors duration-150">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </SignOutButton>
        </div>
        {children}
      </main>
    </div>
  );
}
