"use client";

// ============================================================================
// MappingsContent — bank_payer_mappings management table
// ----------------------------------------------------------------------------
// First-class nav surface (added to the sidebar in D-5-D). Renders one
// card with FilterChips for status (with multi-select via useMultiUrlState
// for symmetry with the queue, even though only one chip is meaningful at
// a time) and a hand-rolled HTML table of mappings.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox } from "lucide-react";
import { FilterChips } from "@/components/shared/filter-chips";
import { CollisionResolutionDialog } from "@/components/reconciliation/collision-resolution-dialog";
import { MappingRowActions } from "./mapping-row-actions";
import { MappingDetailDrawer } from "./mapping-detail-drawer";
import type {
  MappingCollisionPayload,
  MappingListRow,
} from "@/lib/actions/reconciliation";
import { useSubdivisionCode } from "@/lib/subdivision-context";

type StatusFilter = "active" | "ambiguous" | "disabled" | "all";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "ambiguous", label: "Ambiguous" },
  { value: "disabled", label: "Disabled" },
  { value: "all", label: "All (incl. disabled)" },
];

const STATUS_BADGE_VARIANT: Record<
  MappingListRow["status"],
  "success" | "warning" | "neutral"
> = {
  active: "success",
  ambiguous: "warning",
  disabled: "neutral",
};

const formatDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

type MappingsContentProps = {
  subdivisionId: string;
  mappings: MappingListRow[];
  activeStatus: StatusFilter;
  canDelete: boolean;
};

export function MappingsContent({
  subdivisionId,
  mappings,
  activeStatus,
  canDelete,
}: MappingsContentProps) {
  const subdivisionCode = useSubdivisionCode();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [drawerMappingId, setDrawerMappingId] = useState<string | null>(null);
  const [collisionPayload, setCollisionPayload] =
    useState<MappingCollisionPayload | null>(null);

  const base = `/subdivisions/${subdivisionCode}/reconciliation/mappings`;

  function setStatus(next: StatusFilter) {
    const params = new URLSearchParams();
    if (next !== "active") params.set("status", next);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    });
  }

  function refresh() {
    router.refresh();
  }

  // Status chip "value" is single-select but uses the FilterChips primitive
  // for visual consistency with the queue page. Translate to a Set for
  // the chip component.
  const statusValue = new Set<StatusFilter>([activeStatus]);
  const handleStatusChange = (next: Set<StatusFilter>) => {
    // Always pick the LAST clicked chip (single-select semantics).
    const arr = Array.from(next);
    const chosen = arr.find((s) => s !== activeStatus) ?? activeStatus;
    setStatus(chosen);
  };

  return (
    <div className="px-6 py-6 space-y-6">
      <Card className="shadow-none">
        <CardContent className="p-4">
          <FilterChips
            label="Status"
            options={STATUS_OPTIONS.map((o) => ({ ...o }))}
            value={statusValue}
            onChange={handleStatusChange}
          />
        </CardContent>
      </Card>

      {mappings.length === 0 ? (
        <Card className="shadow-none">
          <CardContent className="py-12 text-center">
            <Inbox className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              No mappings to show
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Mappings are created when a manager checks &quot;Remember this
              payer&quot; during a manual match, or after the same canonical
              sender has been matched to the same lot three times in a 30-day
              window.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Canonical name</th>
                    <th className="px-4 py-2.5 font-medium">Lot</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Source</th>
                    <th className="px-4 py-2.5 font-medium tabular-nums">
                      Examples
                    </th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                    <th
                      className="px-4 py-2.5 font-medium"
                      aria-label="Row actions"
                    ></th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr
                      key={m.id}
                      className="border-t border-border hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        {m.canonical_sender_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {m.lot_label}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE_VARIANT[m.status]}>
                          {m.status}
                        </Badge>
                        {m.status === "ambiguous" && m.status_reason && (
                          <div className="mt-0.5 text-xs text-muted-foreground truncate max-w-[18rem]">
                            {m.status_reason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="neutral">{m.source}</Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {m.raw_examples_count}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {formatDate(m.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MappingRowActions
                          subdivisionId={subdivisionId}
                          mapping={m}
                          canDelete={canDelete}
                          onView={(id) => setDrawerMappingId(id)}
                          onCollision={(payload) =>
                            setCollisionPayload(payload)
                          }
                          onChange={refresh}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <MappingDetailDrawer
        subdivisionId={subdivisionId}
        mappingId={drawerMappingId}
        onClose={() => setDrawerMappingId(null)}
      />

      <CollisionResolutionDialog
        open={collisionPayload !== null}
        onOpenChange={(open) => {
          if (!open) setCollisionPayload(null);
        }}
        payload={collisionPayload}
        flow="mapping_reactivate"
        subdivisionId={subdivisionId}
        onResolved={() => {
          setCollisionPayload(null);
          refresh();
        }}
      />
    </div>
  );
}
