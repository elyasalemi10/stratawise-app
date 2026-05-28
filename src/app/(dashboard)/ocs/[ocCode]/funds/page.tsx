import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Wallet } from "lucide-react";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { requireOCAccess } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { getFunds } from "@/lib/actions/funds";

const KIND_LABEL: Record<string, string> = {
  operating: "Operating",
  maintenance_plan: "Maintenance Plan",
  custom: "Custom",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export default async function FundsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  await requireOCAccess(resolved.id);
  const funds = await getFunds(resolved.id);

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
                  <TableCell className="text-right tabular-nums font-semibold text-foreground">{formatCurrency(f.total_balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
