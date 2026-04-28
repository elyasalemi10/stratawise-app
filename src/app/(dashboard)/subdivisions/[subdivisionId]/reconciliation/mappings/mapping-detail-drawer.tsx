"use client";

// ============================================================================
// MappingDetailDrawer — read-only Sheet showing raw_examples + audit history
// ----------------------------------------------------------------------------
// Loads on demand via getMappingDetail when the parent sets `mappingId`.
// The drawer renders skeletons while the detail is loading, then displays
// the canonicalised examples that established this mapping plus a tail of
// the audit log entries scoped to entity_type='bank_payer_mapping'.
// ============================================================================

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  getMappingDetail,
  type MappingDetail,
} from "@/lib/actions/reconciliation";
import { cn } from "@/lib/utils";

type MappingDetailDrawerProps = {
  subdivisionId: string;
  mappingId: string | null;
  onClose: () => void;
};

const STATUS_VARIANT: Record<
  "active" | "ambiguous" | "disabled",
  "success" | "warning" | "neutral"
> = {
  active: "success",
  ambiguous: "warning",
  disabled: "neutral",
};

const ACTION_LABEL: Record<string, string> = {
  "bank_payer_mapping.created": "Created",
  "bank_payer_mapping.reactivated": "Re-activated",
  "bank_payer_mapping.disabled": "Disabled",
  "bank_payer_mapping.restored": "Restored",
  "bank_payer_mapping.deleted": "Deleted",
  "bank_payer_mapping.swept_owner_change": "Owner-change sweep",
};

export function MappingDetailDrawer({
  subdivisionId,
  mappingId,
  onClose,
}: MappingDetailDrawerProps) {
  // Track the resolved fetch alongside its mappingId so we can derive the
  // displayed value during render. This avoids synchronous setState inside
  // the effect (which the linter flags as a cascading-render risk) while
  // still showing a "loading" state when the user switches between rows.
  const [resolved, setResolved] = useState<{
    mappingId: string;
    data: MappingDetail | null;
  } | null>(null);

  useEffect(() => {
    if (!mappingId) return;
    let active = true;
    void (async () => {
      const result = await getMappingDetail(subdivisionId, mappingId);
      if (active) setResolved({ mappingId, data: result });
    })();
    return () => {
      active = false;
    };
  }, [mappingId, subdivisionId]);

  const detail: MappingDetail | null | undefined = !mappingId
    ? undefined
    : resolved && resolved.mappingId === mappingId
      ? resolved.data
      : undefined;

  return (
    <Sheet open={mappingId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col gap-0 p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Mapping details</SheetTitle>
          <SheetDescription>
            Raw payer descriptions and audit history for this mapping.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {detail === undefined && (
            <div className="space-y-3">
              <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-20 animate-pulse rounded bg-muted" />
            </div>
          )}

          {detail === null && (
            <p className="text-sm text-muted-foreground">
              Mapping not found.
            </p>
          )}

          {detail && (
            <>
              <section className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Canonical name
                </div>
                <p className="text-sm font-medium">
                  {detail.canonical_sender_name}
                </p>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Lot
                  </div>
                  <p className="text-sm">{detail.lot_label}</p>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </div>
                  <Badge variant={STATUS_VARIANT[detail.status]}>
                    {detail.status}
                  </Badge>
                </div>
              </section>

              {detail.status_reason && (
                <section className="rounded-md border border-border bg-muted/40 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status reason
                  </div>
                  <p className="mt-0.5 text-sm">{detail.status_reason}</p>
                </section>
              )}

              <section className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Raw examples ({detail.raw_examples.length})
                </div>
                {detail.raw_examples.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No raw examples — this mapping was created manually.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {detail.raw_examples.map((ex, i) => (
                      <li
                        key={i}
                        className={cn(
                          "rounded-md border border-border px-2.5 py-1.5",
                          "text-xs font-mono text-foreground bg-muted/40 break-words",
                        )}
                      >
                        {ex}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Audit history
                </div>
                {detail.audit.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No audit entries.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {detail.audit.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-md border border-border p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {ACTION_LABEL[entry.action] ?? entry.action}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {new Date(entry.created_at).toLocaleString()}
                          </span>
                        </div>
                        {Object.keys(entry.metadata).length > 0 && (
                          <pre className="mt-1.5 text-xs text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
