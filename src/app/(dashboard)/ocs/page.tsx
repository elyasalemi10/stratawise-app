import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, CircleDashed, MapPin, Plus } from "lucide-react";
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
  const drafts = summary?.drafts ?? [];

  return (
    <div className="space-y-8">
      {/* Actions bar. The top-right Create OC button is hidden when there are
          no OCs — two CTAs (top-right + center empty state) felt noisy. The
          centered Create OC in the empty state is the only one in that case. */}
      {ocs.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {ocs.length} OC{ocs.length !== 1 ? "s" : ""}
            {" · "}
            {summary?.totalLots ?? 0} total lots
            {drafts.length > 0 && (
              <>
                {" · "}
                {drafts.length} draft{drafts.length !== 1 ? "s" : ""} in progress
              </>
            )}
          </p>
          <Link href="/ocs/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create OC
            </Button>
          </Link>
        </div>
      )}

      {/* OC grid */}
      {ocs.length === 0 && drafts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-base font-medium text-foreground">
            No OCs yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Create your first OC to start managing lots, levies, and meetings.
          </p>
          <Link href="/ocs/new">
            <Button className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create OC
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {ocs.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ocs.map((sub) => (
                <Link
                  key={sub.id}
                  href={`/ocs/${sub.short_code}`}
                  className="block"
                >
                  <Card className="transition-colors hover:border-primary/30 cursor-pointer">
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between gap-3">
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
                        {sub.thumbnail_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={sub.thumbnail_url}
                            alt=""
                            className="h-10 w-16 shrink-0 rounded-md border border-border object-cover"
                          />
                        ) : null}
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

          {drafts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">In progress</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {drafts.map((d) => (
                  <Link
                    key={d.id}
                    href={`/ocs/new?draft=${d.id}&step=${d.step}`}
                    className="block"
                  >
                    <Card className="transition-colors hover:border-primary/30 cursor-pointer border-dashed">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start gap-3">
                          <CircleDashed className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {d.label} — {d.step}/8
                            </p>
                            {d.address ? (
                              <p className="mt-1 text-xs text-muted-foreground truncate">{d.address}</p>
                            ) : (
                              <p className="mt-1 text-xs text-muted-foreground">Continue setting up this OC</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
