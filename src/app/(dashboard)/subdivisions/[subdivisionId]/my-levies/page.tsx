import { redirect } from "next/navigation";
import { FileText, Download } from "lucide-react";
import { formatDateLong } from "@/lib/utils";
import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export default async function MyLeviesPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "lot_owner") redirect(`/subdivisions/${subdivisionId}/dashboard`);

  const supabase = createServerClient();

  // Get lot owner's lots in this subdivision
  const { data: memberships } = await supabase
    .from("subdivision_members")
    .select("lot_id")
    .eq("subdivision_id", subdivisionId)
    .eq("profile_id", profile.id)
    .eq("role", "lot_owner")
    .is("left_at", null);

  const lotIds = (memberships ?? []).map((m) => m.lot_id).filter(Boolean) as string[];

  if (lotIds.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold text-foreground">My levies</h1>
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

  // Only show issued levies (not drafts)
  const { data: levies } = await supabase
    .from("levy_notices")
    .select("id, lot_id, reference_number, period_start, period_end, amount, status, due_date, pdf_url, issued_at")
    .in("lot_id", lotIds)
    .in("status", ["issued", "partially_paid", "paid", "overdue"])
    .order("due_date", { ascending: false });

  const levyIds = (levies ?? []).map((l) => l.id);
  const { data: allPayments } = levyIds.length > 0
    ? await supabase.from("payments").select("levy_notice_id, amount").in("levy_notice_id", levyIds)
    : { data: [] };

  const paymentsByLevy = new Map<string, number>();
  (allPayments ?? []).forEach((p) => {
    paymentsByLevy.set(p.levy_notice_id, (paymentsByLevy.get(p.levy_notice_id) ?? 0) + Number(p.amount));
  });

  const totalLevied = (levies ?? []).reduce((s, l) => s + (l.amount ?? 0), 0);
  const totalPaid = Array.from(paymentsByLevy.values()).reduce((s, v) => s + v, 0);
  const outstanding = totalLevied - totalPaid;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">My levies</h1>

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
      {(levies ?? []).length === 0 ? (
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
        <div className="space-y-3">
          {(levies ?? []).map((levy) => {
            const paid = paymentsByLevy.get(levy.id) ?? 0;
            const remaining = (levy.amount ?? 0) - paid;
            const isPaid = remaining <= 0;

            return (
              <Card key={levy.id}>
                <CardContent className="pt-5">
                  {/* Top: amount + status */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-foreground">{formatCurrency(levy.amount ?? 0)}</p>
                      {isPaid ? (
                        <p className="text-sm font-medium text-[hsl(160,100%,37%)] mt-0.5">Paid in full</p>
                      ) : paid > 0 ? (
                        <p className="text-sm text-destructive mt-0.5">{formatCurrency(remaining)} remaining</p>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-0.5">Unpaid</p>
                      )}
                    </div>
                    {levy.pdf_url && (
                      <a href={levy.pdf_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <Download className="mr-2 h-3.5 w-3.5" />
                          View PDF
                        </Button>
                      </a>
                    )}
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 pt-4 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">Reference</p>
                      <p className="text-sm font-medium text-foreground mt-0.5">{levy.reference_number}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Due date</p>
                      <p className="text-sm font-medium text-foreground mt-0.5">{formatDateLong(levy.due_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Period</p>
                      <p className="text-sm text-foreground mt-0.5">{formatDateLong(levy.period_start)} — {formatDateLong(levy.period_end)}</p>
                    </div>
                    {levy.issued_at && (
                      <div>
                        <p className="text-xs text-muted-foreground">Issued</p>
                        <p className="text-sm text-foreground mt-0.5">{formatDateLong(levy.issued_at)}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
