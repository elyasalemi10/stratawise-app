"use client";

import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import type { getCompanyOCSummary } from "@/lib/actions/oc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { OCStatusIcon } from "@/components/shared/oc-status-icon";
import { DraftCard } from "./_components/draft-card";

type Summary = Awaited<ReturnType<typeof getCompanyOCSummary>>;

export function OCsContent({ summary }: { summary: Summary }) {
  const ocs = summary?.ocs ?? [];
  const drafts = summary?.drafts ?? [];

  return (
    <div className="space-y-8">
      {/* Actions bar. Shown whenever the page has ANY content (OCs OR
          drafts) , previously this only fired on `ocs.length > 0` and
          a manager with drafts-only saw no Create OC button anywhere,
          because the empty state (which carries its own CTA) only
          renders when BOTH lists are empty. */}
      {(ocs.length > 0 || drafts.length > 0) && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {ocs.length > 0 && (
              <>
                {ocs.length} OC{ocs.length !== 1 ? "s" : ""}
                {" · "}
                {summary?.totalLots ?? 0} total lots
              </>
            )}
            {drafts.length > 0 && (
              <>
                {ocs.length > 0 ? " · " : ""}
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

      {/* OC grid. Empty state carries the only Create OC CTA in that
          case (no top-right one since the actions bar is hidden). When
          there are OCs the top-right Create OC appears and the empty
          state is gone , so the two never duplicate. */}
      {ocs.length === 0 && drafts.length === 0 ? (
        <EmptyState
          illustration="building"
          title="No OCs yet"
          description="Create your first OC to start managing lots, levies, and meetings."
          action={
            <Link href="/ocs/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create OC
              </Button>
            </Link>
          }
        />
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
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {sub.name}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {sub.plan_number}
                          </p>
                        </div>
                        {/* Status as an icon, top-right. It used to be a
                            <Badge> printing the raw enum ("active"), which
                            put a database value in front of the user. */}
                        <OCStatusIcon status={sub.status} />
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
                  <DraftCard key={d.id} draft={{ id: d.id, label: d.label, step: d.step, address: d.address }} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
