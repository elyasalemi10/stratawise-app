import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/user-avatar";

const roleBadge: Record<string, { label: string; variant: "info" | "success" | "neutral" }> = {
  super_admin: { label: "Super admin", variant: "info" },
  strata_manager: { label: "Strata manager", variant: "success" },
  lot_owner: { label: "Lot owner", variant: "neutral" },
};

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  // Get company name for greeting
  let companyName: string | null = null;
  if (profile.management_company_id) {
    const supabase = createServerClient();
    const { data: company } = await supabase
      .from("management_companies")
      .select("name")
      .eq("id", profile.management_company_id)
      .single();
    companyName = company?.name ?? null;
  }

  const badge = roleBadge[profile.role] ?? roleBadge.lot_owner;
  const initials = companyName?.[0]?.toUpperCase() ?? profile.email[0]?.toUpperCase() ?? "?";

  return (
    <div className="space-y-6">
      {/* Welcome card */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-none">
        <div className="flex items-center gap-4">
          <UserAvatar
            src={profile.avatar_url}
            initials={initials}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-medium text-foreground">
              {companyName ?? "Welcome"}
            </p>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
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
  );
}
