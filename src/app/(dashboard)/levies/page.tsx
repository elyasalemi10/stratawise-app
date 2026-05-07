import { redirect } from "next/navigation";
import { FileText, DollarSign, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { LevyStatusBadge } from "@/components/shared/levy-status-badge";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export default async function LeviesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "lot_owner") redirect("/dashboard");

  const supabase = createServerClient();

  // Get lot owner's lots across all subdivisions
  const { data: memberships } = await supabase
    .from("subdivision_members")
    .select("subdivision_id, lot_id")
    .eq("profile_id", profile.id)
    .eq("role", "lot_owner")
    .is("left_at", null);

  const lotIds = (memberships ?? []).map((m) => m.lot_id).filter(Boolean) as string[];

  if (lotIds.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Levies" subtitle="View all your levy notices" />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">No levies yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              You&apos;ll see your levy notices here once they&apos;ve been issued.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch levies, lots, subdivisions, and payments
  const [leviesResult, lotsResult, paymentsResult] = await Promise.all([
    supabase
      .from("levy_notices")
      .select("id, lot_id, reference_number, period_start, period_end, amount, status, due_date, created_at, pdf_url")
      .in("lot_id", lotIds)
      .in("status", ["issued", "partially_paid", "paid", "overdue"])
      .order("due_date", { ascending: false }),
    supabase
      .from("lots")
      .select("id, subdivision_id, lot_number, unit_number, subdivisions:subdivision_id (name)")
      .in("id", lotIds),
    supabase
      .from("payments")
      .select("levy_notice_id, amount")
      .in("levy_notice_id",
        // We'll filter after
        lotIds
      ),
  ]);

  const levies = leviesResult.data ?? [];
  const lots = lotsResult.data ?? [];

  // Get payments for these levies
  const levyIds = levies.map((l) => l.id);
  const { data: allPayments } = levyIds.length > 0
    ? await supabase.from("payments").select("levy_notice_id, amount").in("levy_notice_id", levyIds)
    : { data: [] };

  // Payment totals per levy
  const paymentsByLevy = new Map<string, number>();
  (allPayments ?? []).forEach((p) => {
    paymentsByLevy.set(p.levy_notice_id, (paymentsByLevy.get(p.levy_notice_id) ?? 0) + Number(p.amount));
  });

  // PP6-D-A: per-levy reminder_sent flag for the LevyStatusBadge.
  // Single LEFT JOIN-style lookup against escalation_instances; row presence
  // with current_step >= 1 indicates PP6-C-1's overdue cron fired step 1.
  const { data: escalations } = levyIds.length > 0
    ? await supabase
        .from("escalation_instances")
        .select("levy_notice_id, current_step")
        .in("levy_notice_id", levyIds)
    : { data: [] };
  const reminderSentLevyIds = new Set(
    (escalations ?? [])
      .filter((e) => (e as { current_step: number }).current_step >= 1)
      .map((e) => (e as { levy_notice_id: string }).levy_notice_id),
  );

  // Lot lookup
  const lotMap = new Map(lots.map((l) => [l.id, l]));

  const totalLevied = levies.reduce((s, l) => s + (l.amount ?? 0), 0);
  const totalPaid = Array.from(paymentsByLevy.values()).reduce((s, v) => s + v, 0);
  const outstanding = totalLevied - totalPaid;

  return (
    <div className="space-y-6">
      <PageHeader title="Levies" subtitle="View all your levy notices across all subdivisions" />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total levied</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(totalLevied)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total paid</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-[hsl(160,100%,37%)]">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outstanding</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(outstanding)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Levies list */}
      {levies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">No levies issued yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your levy notices will appear here once issued by your strata manager.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-5">
            <div className="space-y-0 divide-y divide-border">
              {levies.map((levy) => {
                const lot = lotMap.get(levy.lot_id);
                const paid = paymentsByLevy.get(levy.id) ?? 0;
                const remaining = (levy.amount ?? 0) - paid;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const subdivisionName = (lot as any)?.subdivisions?.name ?? "";

                return (
                  <div key={levy.id} className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{levy.reference_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {subdivisionName}{lot ? ` · Lot ${lot.lot_number}` : ""} · Due {levy.due_date}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">{formatCurrency(levy.amount ?? 0)}</p>
                        {remaining > 0 && (
                          <p className="text-xs text-destructive tabular-nums">{formatCurrency(remaining)} remaining</p>
                        )}
                      </div>
                      <LevyStatusBadge
                        status={levy.status as "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "written_off"}
                        dueDate={levy.due_date}
                        reminderSent={reminderSentLevyIds.has(levy.id)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
