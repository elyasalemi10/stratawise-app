import { ExternalLink, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { OwnershipHistoryEntry } from "@/lib/validations/settlement";

interface Props {
  history: OwnershipHistoryEntry[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function OwnershipHistory({ history }: Props) {
  if (history.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No ownership history"
        description="Past and current owners will appear here once the lot has had at least one accepted owner."
      />
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Ownership history</h3>
          <span className="text-xs text-muted-foreground">{history.length} {history.length === 1 ? "tenure" : "tenures"}</span>
        </div>
        <div className="divide-y divide-border">
          {history.map((entry) => {
            const isCurrent = !entry.leftAt;
            return (
              <div key={entry.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {entry.name ?? "Unknown owner"}
                      </p>
                      {isCurrent ? (
                        <Badge variant="success">Current</Badge>
                      ) : (
                        <Badge variant="neutral">Past</Badge>
                      )}
                      {entry.isPrimaryContact && <Badge variant="info">Primary</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">{entry.email ?? "—"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(entry.joinedAt)} → {entry.leftAt ? formatDate(entry.leftAt) : "Current"}
                    </p>
                  </div>
                  {entry.settlementDocument?.id && (
                    <a
                      href={`/api/documents/${entry.settlementDocument.id}?view=true`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Settlement
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
