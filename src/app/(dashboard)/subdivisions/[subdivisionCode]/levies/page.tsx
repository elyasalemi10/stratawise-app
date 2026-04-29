import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { getSubdivision } from "@/lib/actions/subdivision";
import { getLevyBatches } from "@/lib/actions/levy";
import { formatDateLong } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export default async function LeviesPage({
  params,
}: {
  params: Promise<{ subdivisionCode: string }>;
}) {
  const { subdivisionCode } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;
  const [subdivision, batches] = await Promise.all([
    getSubdivision(subdivisionId),
    getLevyBatches(subdivisionId),
  ]);

  if (!subdivision) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Levies</h1>
        <Link href={`/subdivisions/${subdivisionCode}/generate`}>
          <Button size="sm">
            <Plus className="mr-2 h-3.5 w-3.5" />
            Generate levies
          </Button>
        </Link>
      </div>

      {batches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">No levies generated yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Generate levies from an approved budget to start issuing levy notices to lot owners.
            </p>
            <Link href={`/subdivisions/${subdivisionCode}/generate`}>
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Generate levies
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => (
            <Link
              key={batch.id}
              href={`/subdivisions/${subdivisionCode}/levies/${batch.id}`}
              className="block"
            >
              <Card className="transition-colors hover:border-primary/30 cursor-pointer">
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{batch.period_label}</h3>
                        <Badge variant={batch.fund_type === "administrative" ? "info" : "neutral"}>
                          {batch.fund_type === "administrative" ? "Admin" : "Capital"}
                        </Badge>
                        <Badge variant={batch.status === "sent" ? "success" : batch.status === "partially_sent" ? "warning" : "neutral"}>
                          {batch.status === "sent" ? "Sent" : batch.status === "partially_sent" ? "Partially sent" : "Draft"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateLong(batch.period_start)} — {formatDateLong(batch.period_end)} · Due {formatDateLong(batch.due_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(batch.total_amount)}</p>
                      <p className="text-xs text-muted-foreground">{batch.levy_count} levies</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
