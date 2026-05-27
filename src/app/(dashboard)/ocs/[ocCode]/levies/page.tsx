import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { getOC } from "@/lib/actions/oc";
import { getLevyBatches } from "@/lib/actions/levy";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { LeviesTable, type LevyBatchRow } from "./levies-table";

import { resolveOCFromCode } from "@/lib/oc-resolver";

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

  const rows: LevyBatchRow[] = batches.map((b) => ({
    id: b.id,
    financial_year: b.financial_year,
    fund_type: b.fund_type,
    period_label: b.period_label,
    due_date: b.due_date,
    total_amount: b.total_amount,
    status: b.status,
    is_special: b.is_special,
  }));

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
        <LeviesTable ocCode={ocCode} batches={rows} />
      )}
    </div>
  );
}
