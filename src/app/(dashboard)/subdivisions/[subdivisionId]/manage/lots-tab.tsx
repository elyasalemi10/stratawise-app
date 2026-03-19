"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import type { LotWithFinancials } from "@/lib/actions/subdivision";

interface LotsTabProps {
  lots: LotWithFinancials[];
  subdivisionId: string;
}

export function LotsTab({ lots, subdivisionId }: LotsTabProps) {
  const router = useRouter();
  const [sortAsc, setSortAsc] = useState(true);

  const sortedLots = [...lots].sort((a, b) =>
    sortAsc ? a.lot_number - b.lot_number : b.lot_number - a.lot_number
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 text-left">Owner name</th>
            <th className="px-4 py-2.5 text-left">Email</th>
            <th className="px-4 py-2.5 text-left">Units of entitlement</th>
            <th className="px-4 py-2.5 text-left">Unit number</th>
            <th
              className="px-4 py-2.5 text-left cursor-pointer hover:text-foreground select-none"
              onClick={() => setSortAsc((v) => !v)}
            >
              Lot # {sortAsc ? "↑" : "↓"}
            </th>
            <th className="px-4 py-2.5 text-left">Owner occupied</th>
            <th className="px-4 py-2.5 text-left">Accepted invite</th>
          </tr>
        </thead>
        <tbody>
          {sortedLots.map((lot) => (
            <tr
              key={lot.id}
              onClick={() => router.push(`/subdivisions/${subdivisionId}/lots/${lot.id}`)}
              className="border-t border-border/50 h-12 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <td className="px-4">
                {lot.owner_name ? (
                  <span className="font-medium text-foreground">{lot.owner_name}</span>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </td>
              <td className="px-4">
                {lot.owner_email ? (
                  <span className="text-foreground">{lot.owner_email}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4">
                {lot.lot_entitlement > 0 ? (
                  <span className="tabular-nums">{lot.lot_entitlement}</span>
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </td>
              <td className="px-4">
                {lot.unit_number ? (
                  <span className="text-foreground">{lot.unit_number}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 font-medium text-foreground">
                {lot.lot_number}
              </td>
              <td className="px-4">
                <Badge variant="success">Yes</Badge>
              </td>
              <td className="px-4">
                <Badge variant="neutral">No</Badge>
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
