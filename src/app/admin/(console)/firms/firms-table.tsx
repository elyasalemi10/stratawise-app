"use client";

import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";

type SubscriptionStatus = "active" | "suspended" | "cancelled";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<SubscriptionStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  suspended: "warning",
  cancelled: "neutral",
};

export interface FirmRow {
  id: string;
  name: string;
  tradingAs: string | null;
  abn: string | null;
  status: SubscriptionStatus;
  ocCount: number;
  lotCount: number;
  managerCount: number;
}

export function FirmsTable({ firms }: { firms: FirmRow[] }) {
  const router = useRouter();

  if (firms.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No management firms yet"
        description="Firms appear here as managing agents onboard to the platform."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table variant="striped">
        <TableHeader>
          <TableRow>
            <TableHead>Firm</TableHead>
            <TableHead className="text-right">OCs</TableHead>
            <TableHead className="text-right">Lots</TableHead>
            <TableHead className="text-right">Managers</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {firms.map((firm) => (
            <TableRow
              key={firm.id}
              className="cursor-pointer"
              onClick={() => router.push(`/admin/firms/${firm.id}`)}
            >
              <TableCell>
                <div className="font-medium text-foreground">{firm.name}</div>
                {firm.tradingAs && (
                  <div className="text-xs text-muted-foreground">
                    Trading as {firm.tradingAs}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{firm.ocCount}</TableCell>
              <TableCell className="text-right tabular-nums">{firm.lotCount}</TableCell>
              <TableCell className="text-right tabular-nums">{firm.managerCount}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[firm.status]} className="rounded-full">
                  {STATUS_LABEL[firm.status]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
