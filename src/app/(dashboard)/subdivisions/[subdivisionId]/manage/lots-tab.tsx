"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Mail, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LotWithFinancials } from "@/lib/actions/subdivision";

interface LotsTabProps {
  lots: LotWithFinancials[];
  subdivisionId: string;
}

function ActionsDropdown({
  lotId,
  subdivisionId,
  hasOwner,
}: {
  lotId: string;
  subdivisionId: string;
  hasOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-40 rounded-lg border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
          onClick={() => setOpen(false)}
        >
          {!hasOwner && (
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground"
            >
              <Mail className="h-4 w-4" />
              Invite owner
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push(`/subdivisions/${subdivisionId}/lots/${lotId}`)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground"
          >
            <Eye className="h-4 w-4" />
            View details
          </button>
        </div>
      )}
    </div>
  );
}

export function LotsTab({ lots, subdivisionId }: LotsTabProps) {
  const router = useRouter();
  const [sortAsc, setSortAsc] = useState(true);

  const sortedLots = [...lots].sort((a, b) =>
    sortAsc ? a.lot_number - b.lot_number : b.lot_number - a.lot_number
  );

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(n));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th
              className="px-4 py-2.5 text-left cursor-pointer hover:text-foreground select-none"
              onClick={() => setSortAsc((v) => !v)}
            >
              Lot # {sortAsc ? "↑" : "↓"}
            </th>
            <th className="px-4 py-2.5 text-left">Entitlement</th>
            <th className="px-4 py-2.5 text-left">Liability</th>
            <th className="px-4 py-2.5 text-left">Owner</th>
            <th className="px-4 py-2.5 text-left">Financial status</th>
            <th className="px-4 py-2.5 text-right">Balance</th>
            <th className="px-4 py-2.5 text-right w-14">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedLots.map((lot) => (
            <tr
              key={lot.id}
              onClick={() => router.push(`/subdivisions/${subdivisionId}/lots/${lot.id}`)}
              className="border-t border-border/50 h-12 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <td className="px-4 font-medium text-foreground">
                {lot.lot_number}
              </td>
              <td className="px-4">
                {lot.lot_entitlement > 0 ? (
                  <span className="tabular-nums">{lot.lot_entitlement}</span>
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </td>
              <td className="px-4">
                {lot.lot_liability > 0 ? (
                  <span className="tabular-nums">{lot.lot_liability}</span>
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </td>
              <td className="px-4">
                {lot.owner_name ? (
                  <span className="text-foreground">{lot.owner_name}</span>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </td>
              <td className="px-4">
                {lot.financial_status === "up_to_date" && (
                  <Badge variant="success">Up to date</Badge>
                )}
                {lot.financial_status === "unassigned" && (
                  <Badge variant="neutral">Unassigned</Badge>
                )}
                {lot.financial_status === "behind" && (
                  <Badge variant="destructive">Behind</Badge>
                )}
              </td>
              <td className="px-4 text-right tabular-nums">
                {lot.balance === 0 ? (
                  <span className="text-[hsl(160,100%,37%)]">{formatCurrency(0)}</span>
                ) : lot.balance > 0 ? (
                  <span className="text-destructive">{formatCurrency(lot.balance)}</span>
                ) : (
                  <span className="text-[hsl(160,100%,37%)]">{formatCurrency(lot.balance)}</span>
                )}
              </td>
              <td className="px-4 text-right" onClick={(e) => e.stopPropagation()}>
                <ActionsDropdown
                  lotId={lot.id}
                  subdivisionId={subdivisionId}
                  hasOwner={!!lot.owner_name}
                />
              </td>
            </tr>
          ))}
          {sortedLots.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                No lots found. Create lots from the subdivision setup wizard.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
