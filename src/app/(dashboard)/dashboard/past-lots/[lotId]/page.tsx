import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, MapPin, FileText, Mail, Inbox } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function PastLotPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  const supabase = createServerClient();

  // Fetch the user's membership for this lot. Allow both ended and active so
  // managers (super_admin) can preview, and so an owner who briefly re-bought
  // the same lot can still see their old tenure.
  const { data: membership } = await supabase
    .from("oc_members")
    .select("id, oc_id, joined_at, left_at")
    .eq("lot_id", lotId)
    .eq("profile_id", profile.id)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership) notFound();

  const { joined_at, left_at, oc_id } = membership;

  const [subResult, lotResult, leviesResult, paymentsResult, commsResult] = await Promise.all([
    supabase.from("owners_corporations").select("id, short_code, name, address, plan_number").eq("id", oc_id).single(),
    supabase.from("lots").select("id, lot_number, unit_number").eq("id", lotId).single(),
    supabase
      .from("levy_notices")
      .select("id, reference_number, fund_type, amount, amount_paid, due_date, status, issued_at, period_start, period_end")
      .eq("lot_id", lotId)
      .gte("issued_at", joined_at)
      .lte("issued_at", left_at ?? new Date().toISOString())
      .order("issued_at", { ascending: false }),
    supabase
      .from("payments")
      .select("id, reference_number, fund_type, amount, payment_date, payment_method")
      .eq("lot_id", lotId)
      .gte("payment_date", joined_at.slice(0, 10))
      .lte("payment_date", (left_at ?? new Date().toISOString()).slice(0, 10))
      .order("payment_date", { ascending: false }),
    supabase
      .from("communication_log")
      .select("id, channel, type, subject, body_preview, sent_at, created_at, status")
      .eq("recipient_id", profile.id)
      .gte("created_at", joined_at)
      .lte("created_at", left_at ?? new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const sub = subResult.data;
  const lot = lotResult.data;
  if (!sub || !lot) notFound();

  const levies = leviesResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const comms = commsResult.data ?? [];

  const totalLevied = levies.reduce((s, l) => s + Number(l.amount), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
      : ",";

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{sub.name}</h1>
          <Badge variant="neutral">Past tenure</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Lot {lot.lot_number}{lot.unit_number ? ` · Unit ${lot.unit_number}` : ""} · {sub.plan_number}
        </p>
        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {sub.address}
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Your tenure</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
            <Stat label="Owned from" value={formatDate(joined_at)} />
            <Stat label="Owned until" value={formatDate(left_at)} />
            <Stat label="Net paid" value={formatCurrency(totalPaid)} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            This is a read-only archive of records linked to your ownership period. The current
            owner&apos;s data is not shown here.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Levy notices</h2>
            <span className="text-xs text-muted-foreground">{levies.length} during your tenure · {formatCurrency(totalLevied)} levied</span>
          </div>
          {levies.length === 0 ? (
            <EmptyRow icon={<FileText className="h-5 w-5" />} text="No levies were issued while you owned this lot." />
          ) : (
            <div className="divide-y divide-border">
              {levies.map((l) => (
                <div key={l.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{l.reference_number} · {labelForFund(l.fund_type)}</p>
                    <p className="text-xs text-muted-foreground">
                      Issued {formatDate(l.issued_at)} · due {formatDate(l.due_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-foreground tabular-nums">{formatCurrency(Number(l.amount))}</p>
                    <Badge variant={statusBadgeVariant(l.status)}>{l.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Your payments</h2>
            <span className="text-xs text-muted-foreground">{payments.length} payment(s)</span>
          </div>
          {payments.length === 0 ? (
            <EmptyRow icon={<FileText className="h-5 w-5" />} text="No payments recorded during your tenure." />
          ) : (
            <div className="divide-y divide-border">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{p.reference_number ?? ","} · {labelForFund(p.fund_type)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(p.payment_date)} · {p.payment_method}</p>
                  </div>
                  <p className="font-medium text-foreground tabular-nums">{formatCurrency(Number(p.amount))}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Communications you received</h2>
            <span className="text-xs text-muted-foreground">{comms.length} item(s)</span>
          </div>
          {comms.length === 0 ? (
            <EmptyRow icon={<Inbox className="h-5 w-5" />} text="No communications were sent to you during this tenure." />
          ) : (
            <div className="divide-y divide-border">
              {comms.map((c) => (
                <div key={c.id} className="flex items-start gap-3 py-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">{c.subject ?? c.type}</p>
                    {c.body_preview && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{c.body_preview}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(c.sent_at ?? c.created_at)} · {c.channel}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function EmptyRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="text-muted-foreground/40">{icon}</div>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function labelForFund(fund: string): string {
  if (fund === "operating") return "Operating fund";
  if (fund === "maintenance_plan") return "Maintenance plan";
  return fund;
}

function statusBadgeVariant(status: string): "success" | "destructive" | "warning" | "neutral" {
  if (status === "paid") return "success";
  if (status === "overdue") return "destructive";
  if (status === "partially_paid") return "warning";
  return "neutral";
}
