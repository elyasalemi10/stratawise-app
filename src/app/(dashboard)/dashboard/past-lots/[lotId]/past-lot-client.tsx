"use client";

import { useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, MapPin, FileText, Mail, Inbox } from "lucide-react";
import { useCachedData } from "@/lib/use-cached-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { LevyStatusBadge } from "@/components/shared/levy-status-badge";
import { getPastLotPageData, type PastLotPageData } from "./data";
import { PastLotSkeleton } from "./past-lot-skeleton";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

// Missing dates render as nothing, not a placeholder character. The old
// fallback here was a bare "," , an em dash that the copy purge replaced with
// a comma and nobody noticed, so a lot with no end date showed a lone comma.
const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

/** Fund type is a database enum; the user never sees the raw value. */
const FUND_LABEL: Record<string, string> = {
  operating: "Admin fund",
  maintenance_plan: "Maintenance plan",
};

/** Payment method is a database enum; same rule. */
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bpay: "BPAY",
  eft: "EFT",
  direct_debit: "Direct debit",
  card: "Card",
  cash: "Cash",
  cheque: "Cheque",
  manual: "Manual",
  other: "Other",
};

const labelFor = (map: Record<string, string>, v: string | null | undefined) =>
  (v && map[v]) || "";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
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

export function PastLotClient({ lotId }: { lotId: string }) {
  const fetcher = useCallback(() => getPastLotPageData(lotId), [lotId]);
  const { data, loading } = useCachedData<PastLotPageData>(`past-lot:${lotId}`, fetcher);

  if (loading || !data) return <PastLotSkeleton />;

  if (!data.found || !data.oc || !data.lot) {
    return (
      <EmptyState
        icon={FileText}
        title="Records not found"
        description="There is no ownership record for this lot on your account."
        card={false}
      />
    );
  }

  const { oc, lot, levies, payments, comms } = data;
  const totalLevied = levies.reduce((s, l) => s + Number(l.amount), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);

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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{oc.name}</h1>
          <Badge variant="neutral">Past tenure</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Lot {lot.lot_number}
          {lot.unit_number ? ` · Unit ${lot.unit_number}` : ""} · {oc.plan_number}
        </p>
        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {oc.address}
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Your tenure</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
            <Stat label="Owned from" value={formatDate(data.joinedAt)} />
            <Stat label="Owned until" value={formatDate(data.leftAt)} />
            <Stat label="Net paid" value={formatCurrency(totalPaid)} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            This is a read-only archive of records linked to your ownership period. The
            current owner&apos;s data is not shown here.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Levy notices</h2>
            <span className="text-xs text-muted-foreground">
              {levies.length} during your tenure · {formatCurrency(totalLevied)} levied
            </span>
          </div>
          {levies.length === 0 ? (
            <EmptyRow
              icon={<FileText className="h-5 w-5" />}
              text="No levies were issued while you owned this lot."
            />
          ) : (
            <div className="divide-y divide-border">
              {levies.map((l) => (
                <div key={l.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">
                      {l.reference_number} · {labelFor(FUND_LABEL, l.fund_type)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Issued {formatDate(l.issued_at)} · due {formatDate(l.due_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-foreground tabular-nums">
                      {formatCurrency(Number(l.amount))}
                    </p>
                    {/* Was <Badge>{l.status}</Badge>, which printed the raw
                        enum ("partially_paid") straight at the owner. */}
                    <LevyStatusBadge
                      status={
                        l.status as
                          | "draft"
                          | "issued"
                          | "partially_paid"
                          | "paid"
                          | "overdue"
                          | "written_off"
                      }
                      dueDate={l.due_date}
                    />
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
            <span className="text-xs text-muted-foreground">
              {payments.length} payment{payments.length !== 1 ? "s" : ""}
            </span>
          </div>
          {payments.length === 0 ? (
            <EmptyRow
              icon={<FileText className="h-5 w-5" />}
              text="No payments recorded during your tenure."
            />
          ) : (
            <div className="divide-y divide-border">
              {payments.map((p) => {
                // Reference and fund read as one line; when there is no
                // reference the line is just the fund, never a stray
                // separator. The old fallback here was a literal ",".
                const parts = [p.reference_number, labelFor(FUND_LABEL, p.fund_type)].filter(
                  Boolean,
                );
                const meta = [
                  formatDate(p.payment_date),
                  labelFor(PAYMENT_METHOD_LABEL, p.payment_method),
                ].filter(Boolean);
                return (
                  <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium text-foreground">{parts.join(" · ")}</p>
                      <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>
                    </div>
                    <p className="font-medium text-foreground tabular-nums">
                      {formatCurrency(Number(p.amount))}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">
              Communications you received
            </h2>
            <span className="text-xs text-muted-foreground">
              {comms.length} item{comms.length !== 1 ? "s" : ""}
            </span>
          </div>
          {comms.length === 0 ? (
            <EmptyRow
              icon={<Inbox className="h-5 w-5" />}
              text="No communications were sent to you during this tenure."
            />
          ) : (
            <div className="divide-y divide-border">
              {comms.map((c) => (
                <div key={c.id} className="flex items-start gap-3 py-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">
                      {c.subject ?? c.type}
                    </p>
                    {c.body_preview && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {c.body_preview}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(c.sent_at ?? c.created_at)} · {c.channel}
                    </p>
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
