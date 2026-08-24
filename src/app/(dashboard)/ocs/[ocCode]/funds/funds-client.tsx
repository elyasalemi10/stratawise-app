"use client";

import { useCallback } from "react";
import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import { useCachedData } from "@/lib/use-cached-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { getFundsPageData, type FundsPageData } from "./data";
import { FundsSkeleton } from "./funds-skeleton";

const KIND_LABEL: Record<string, string> = {
  admin: "Admin",
  maintenance_plan: "Maintenance Plan",
  custom: "Custom",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export function FundsClient({ ocId, ocCode }: { ocId: string; ocCode: string }) {
  const fetcher = useCallback(() => getFundsPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<FundsPageData>(`funds:${ocId}`, fetcher);

  if (loading || !data) return <FundsSkeleton />;

  const { funds } = data;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href={`/ocs/${ocCode}/funds/create`}>
          <Button size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create fund
          </Button>
        </Link>
      </div>

      {funds.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No funds yet"
          description="Create your first fund to start tracking balances and assigning lots."
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <Table variant="striped">
            <TableHeader>
              <TableRow>
                <TableHead>Fund</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Lots</TableHead>
                <TableHead className="text-right">Accounts</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funds.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="text-foreground font-medium">{f.name}</TableCell>
                  <TableCell>
                    <Badge variant={f.kind === "custom" ? "success" : "neutral"}>
                      {KIND_LABEL[f.kind] ?? "Custom"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">{f.lot_count}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">{f.bank_account_count}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-foreground">
                    {formatCurrency(f.total_balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
