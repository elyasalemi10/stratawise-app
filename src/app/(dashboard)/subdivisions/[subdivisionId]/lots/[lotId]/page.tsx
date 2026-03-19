import Link from "next/link";
import { ChevronLeft, Building2, DollarSign, Users } from "lucide-react";
import { createServerClient } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right max-w-[60%]">
        {value || "—"}
      </span>
    </div>
  );
}

export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ subdivisionId: string; lotId: string }>;
}) {
  const { subdivisionId, lotId } = await params;
  const supabase = createServerClient();

  const { data: lot } = await supabase
    .from("lots")
    .select("*")
    .eq("id", lotId)
    .eq("subdivision_id", subdivisionId)
    .single();

  if (!lot) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-base font-medium text-foreground">Lot not found</p>
      </div>
    );
  }

  // Get financial data
  const [leviesResult, paymentsResult] = await Promise.all([
    supabase
      .from("levy_notices")
      .select("amount")
      .eq("lot_id", lotId)
      .in("status", ["issued", "partially_paid", "overdue"]),
    supabase
      .from("payments")
      .select("amount")
      .eq("lot_id", lotId),
  ]);

  const totalLevied = leviesResult.data?.reduce((sum, l) => sum + Number(l.amount), 0) ?? 0;
  const totalPaid = paymentsResult.data?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;
  const balance = totalLevied - totalPaid;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

  const hasOwner = !!lot.owner_name;
  const statusVariant = !hasOwner ? "neutral" : balance > 0 ? "destructive" : "success";
  const statusLabel = !hasOwner ? "Unassigned" : balance > 0 ? "Behind" : "Up to date";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/subdivisions/${subdivisionId}/manage?tab=lots`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Lots
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {lot.owner_name ?? `Lot ${lot.lot_number}`}
        </h1>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Lot number
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                  {lot.lot_number}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Entitlement
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                  {Number(lot.lot_entitlement) || "—"}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Balance
                </p>
                <p className={`mt-2 text-2xl font-bold tabular-nums ${balance > 0 ? "text-destructive" : "text-[hsl(160,100%,37%)]"}`}>
                  {formatCurrency(balance)}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Lot details</h3>
            <InfoRow label="Lot number" value={String(lot.lot_number)} />
            <InfoRow label="Unit number" value={lot.unit_number} />
            <InfoRow label="Entitlement" value={lot.lot_entitlement ? String(lot.lot_entitlement) : null} />
            <InfoRow label="Liability" value={lot.lot_liability ? String(lot.lot_liability) : null} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Owner details</h3>
            <InfoRow label="Name" value={lot.owner_name} />
            <InfoRow label="Type" value={lot.owner_type === "company" ? "Company" : lot.owner_type === "individual" ? "Individual" : null} />
            <InfoRow label="Email" value={lot.owner_email} />
            <InfoRow label="Phone" value={lot.owner_phone} />
          </CardContent>
        </Card>
      </div>

      {/* Financial history placeholder */}
      <Card>
        <CardContent className="flex items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Levy history and payment records will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
