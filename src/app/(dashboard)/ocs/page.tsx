import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Plus, MapPin } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { getCompanyOCSummary } from "@/lib/actions/oc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function OCsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  const summary = await getCompanyOCSummary();
  const ocs = summary?.ocs ?? [];

  return (
    <div className="space-y-6">
      {/* Actions bar — hide the 0/0 count when there's nothing to count yet */}
      <div className="flex items-center justify-between">
        <div>
          {ocs.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {ocs.length} oc{ocs.length !== 1 ? "s" : ""}
              {" · "}
              {summary?.totalLots ?? 0} total lots
            </p>
          )}
        </div>
        <Link href="/ocs/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create oc
          </Button>
        </Link>
      </div>

      {/* OC grid */}
      {ocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-base font-medium text-foreground">
            No ocs yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Create your first oc to start managing lots, levies, and meetings.
          </p>
          <Link href="/ocs/new">
            <Button className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create oc
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ocs.map((sub) => (
            <Link
              key={sub.id}
              href={`/ocs/${sub.short_code}`}
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
