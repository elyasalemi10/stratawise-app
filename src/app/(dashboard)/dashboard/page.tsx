import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, DollarSign, Users, Plus, MapPin } from "lucide-react";
import { InviteTeamButton } from "./_components/invite-team-button";
import { getCurrentProfile } from "@/lib/auth";
import { getCompanySubdivisionSummary } from "@/lib/actions/subdivision";
import { createServerClient } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface KPICardProps {
  label: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}

function KPICard({ label, value, description, icon }: KPICardProps) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
              {value}
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  // Lot owners get redirected to their subdivision
  if (profile.role === "lot_owner") {
    const supabase = createServerClient();
    const { data: memberships } = await supabase
      .from("subdivision_members")
      .select("subdivision_id")
      .eq("profile_id", profile.id)
      .is("left_at", null)
      .limit(1);

    if (memberships && memberships.length > 0) {
      redirect(`/subdivisions/${memberships[0].subdivision_id}/dashboard`);
    }
  }

  const summary = await getCompanySubdivisionSummary();
  const subdivisions = summary?.subdivisions ?? [];
  const totalSubdivisions = summary?.totalSubdivisions ?? 0;
  const totalLots = summary?.totalLots ?? 0;

  return (
    <div className="space-y-6">
      {/* Company KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Subdivisions"
          value={String(totalSubdivisions)}
          description={totalSubdivisions === 0 ? "Create your first subdivision" : "Active subdivisions"}
          icon={<Building2 className="h-5 w-5" />}
        />
        <KPICard
          label="Total lots"
          value={String(totalLots)}
          description="Across all subdivisions"
          icon={<Users className="h-5 w-5" />}
        />
        <KPICard
          label="Total levied"
          value="$0.00"
          description="No levies issued yet"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KPICard
          label="Outstanding"
          value="$0.00"
          description="No outstanding amounts"
          icon={<DollarSign className="h-5 w-5" />}
        />
      </div>

      {/* Subdivisions section */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Subdivisions</h2>
        <div className="flex items-center gap-2">
          <InviteTeamButton />
          <Link href="/subdivisions/new">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Create subdivision
            </Button>
          </Link>
        </div>
      </div>

      {subdivisions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">
              No subdivisions yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Create your first subdivision to start managing lots, levies, and meetings.
            </p>
            <Link href="/subdivisions/new">
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Create subdivision
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subdivisions.map((sub) => (
            <Link
              key={sub.id}
              href={`/subdivisions/${sub.id}/dashboard`}
              className="block"
            >
              <Card className="transition-colors hover:border-primary/30 cursor-pointer">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {sub.name}
                        </h3>
                        <Badge variant="neutral" className="shrink-0">
                          {sub.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {sub.plan_number}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{sub.address}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
                    <div>
                      <p className="text-lg font-bold tabular-nums text-foreground">
                        {sub.total_lots}
                      </p>
                      <p className="text-xs text-muted-foreground">Lots</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
