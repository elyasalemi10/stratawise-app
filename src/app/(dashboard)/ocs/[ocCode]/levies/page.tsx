import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { getOC } from "@/lib/actions/oc";
import { getLevyBatches } from "@/lib/actions/levy";
import { formatDateLong } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";

import { resolveOCFromCode } from "@/lib/oc-resolver";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

// Recognised fund types , anything else falls into the "Other" column.
const KNOWN_FUNDS = new Set(["administrative", "capital_works", "maintenance_plan"]);

function fundAmount(
  batch: { fund_type: string; total_amount: number },
  target: "administrative" | "capital_works" | "maintenance_plan" | "other",
): number | null {
  if (target === "other") {
    return KNOWN_FUNDS.has(batch.fund_type) ? null : batch.total_amount;
  }
  return batch.fund_type === target ? batch.total_amount : null;
}

export default async function LeviesPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const [oc, batches] = await Promise.all([
    getOC(ocId),
    getLevyBatches(ocId),
  ]);

  if (!oc) redirect("/dashboard");

  return (
    <div className="space-y-4">
      {batches.length > 0 && (
        <div className="flex justify-end">
          <Link href={`/ocs/${ocCode}/generate`}>
            <Button size="sm">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Generate levies
            </Button>
          </Link>
        </div>
      )}

      {batches.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No levies generated yet"
          description="Generate levies from an approved budget to start issuing levy notices to lot owners."
          action={
            <Link href={`/ocs/${ocCode}/generate`}>
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Generate levies
              </Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <div className="overflow-hidden rounded-md border border-border">
              <Table variant="striped">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead className="w-40">Financial Year</TableHead>
                    <TableHead className="text-right">Admin</TableHead>
                    <TableHead className="text-right">Capital Works</TableHead>
                    <TableHead className="text-right">Maintenance</TableHead>
                    <TableHead className="text-right">Other</TableHead>
                    <TableHead className="w-36">Due date</TableHead>
                    <TableHead className="w-36">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => {
                    const admin = fundAmount(batch, "administrative");
                    const capital = fundAmount(batch, "capital_works");
                    const maintenance = fundAmount(batch, "maintenance_plan");
                    const other = fundAmount(batch, "other");
                    return (
                      <TableRow key={batch.id}>
                        <TableCell>
                          <Link
                            href={`/ocs/${ocCode}/levies/${batch.id}`}
                            className="text-foreground hover:underline"
                          >
                            {batch.is_special ? "Special" : "Regular"}
                          </Link>
                        </TableCell>
                        <TableCell className="text-foreground">
                          {batch.period_label} {batch.financial_year}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {admin !== null ? formatCurrency(admin) : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {capital !== null ? formatCurrency(capital) : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {maintenance !== null ? formatCurrency(maintenance) : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {other !== null ? formatCurrency(other) : ""}
                        </TableCell>
                        <TableCell className="text-foreground text-sm">
                          {formatDateLong(batch.due_date)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              batch.status === "sent" ? "success"
                              : batch.status === "partially_sent" ? "warning"
                              : batch.status === "cancelled" ? "destructive"
                              : "neutral"
                            }
                          >
                            {batch.status === "sent" ? "Sent"
                              : batch.status === "partially_sent" ? "Partially sent"
                              : batch.status === "cancelled" ? "Cancelled"
                              : "Draft"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
