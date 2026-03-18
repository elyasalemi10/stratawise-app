import { redirect } from "next/navigation";
import { getOnboardingRedirect } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirect to onboarding if user hasn't completed setup
  const onboardingRedirect = await getOnboardingRedirect();
  if (onboardingRedirect) {
    redirect(onboardingRedirect);
  }

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar — fixed left */}
      <Sidebar />

      {/* Main area — offset by sidebar width on desktop */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 overflow-y-auto bg-background p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
