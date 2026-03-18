import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();

  const firstName = user?.firstName ?? "there";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div>
      <PageHeader title="Dashboard" />

      <div className="space-y-6">
        {/* Welcome card */}
        <div className="rounded-lg border border-border bg-card p-5 shadow-none">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-medium text-foreground">
                Welcome back, {firstName}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{email}</p>
            </div>
            <Badge variant="neutral">Role: User</Badge>
          </div>
        </div>

        {/* Empty state — subdivisions */}
        <div className="rounded-lg border border-border bg-card shadow-none py-16">
          <div className="flex flex-col items-center text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-4 text-base font-medium text-foreground">
              No subdivisions yet
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create your first subdivision to get started.
            </p>
            <Link href="/subdivisions/new">
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Create subdivision
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
