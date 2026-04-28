import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Clock } from "lucide-react";
import { getSubdivision } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { getGapReportPageData } from "@/lib/actions/basiq";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  params: Promise<{ subdivisionId: string; reportId: string }>;
}

export default async function GapReportPage({ params }: Props) {
  const { subdivisionId, reportId } = await params;

  const [subdivision, profile] = await Promise.all([
    getSubdivision(subdivisionId),
    getCurrentProfile(),
  ]);
  if (!subdivision) redirect("/dashboard");
  if (profile?.role === "lot_owner") {
    redirect(`/subdivisions/${subdivisionId}/dashboard`);
  }

  const data = await getGapReportPageData(reportId, subdivisionId);
  if (!data) notFound();

  const { report, suppressionUntil, transactions } = data;
  const days = Math.max(1, Math.round(report.gapDurationHours / 24));

  return (
    <div className="space-y-6">
      {/* Section A — Summary */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Summary
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoRow
              label="Gap window"
              value={`${formatDateTimeMelbourne(report.gapStartAt)} → ${formatDateTimeMelbourne(report.gapEndAt)}`}
            />
            <InfoRow
              label="Duration"
              value={`${report.gapDurationHours} hour${report.gapDurationHours === 1 ? "" : "s"} (${days} day${days === 1 ? "" : "s"})`}
            />
            <InfoRow
              label="Institution"
              value={report.institutionName}
            />
            <InfoRow
              label="Nominated representative"
              value={report.nominatedRepresentativeName ?? "—"}
            />
            <InfoRow label="Report created" value={formatDateTimeMelbourne(report.createdAt)} />
            {report.dismissedAt && (
              <InfoRow
                label="Dismissed"
                value={formatDateTimeMelbourne(report.dismissedAt)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section B — Metrics */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Metrics
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-5">
            <Metric
              label="Backfilled"
              value={String(report.backfilledTransactionCount)}
              sub="transactions imported"
            />
            <Metric
              label="Auto-matched"
              value={String(report.autoMatchedCount)}
              sub="resolved automatically"
            />
            <Metric
              label="Manual review"
              value={String(report.manualReviewCount)}
              sub="needs attention"
              emphasis={report.manualReviewCount > 0 ? "warning" : undefined}
            />
            <Metric
              label="Arrears emails"
              value={String(report.arrearsNotificationsDuringGap)}
              sub={
                report.arrearsNotificationsDuringGap === 0
                  ? "(none recorded yet)"
                  : "sent during the gap"
              }
            />
            <Metric
              label="Committee notified"
              value={report.committeeNotified ? "Yes" : "No"}
              sub={report.committeeNotified ? "gap > 30 days" : "gap ≤ 30 days"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section C — Backfilled transactions table */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Transactions during the gap window
          </h3>
          {transactions.length === 0 ? (
            <div className="mt-4 rounded-md border border-border bg-muted/30 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No bank-fed transactions land within the gap window.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                This happens when the outage period had no bank activity, or the
                backfill hadn&apos;t imported anything yet when the gap report
                was generated.
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      subdivisionId={subdivisionId}
                      tx={tx}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section D — Footer: arrears suppression */}
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <p className="text-sm text-foreground">
          <Clock className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
          {suppressionUntil
            ? `Arrears notifications suppressed until ${formatDateTimeMelbourne(suppressionUntil)}`
            : "Arrears notifications are active (no suppression on this subdivision)."}
        </p>
      </div>
    </div>
  );
}

// ─── Small bits ──────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "warning";
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          emphasis === "warning" ? "text-[hsl(38,92%,50%)]" : "text-foreground",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function TransactionRow({
  subdivisionId,
  tx,
}: {
  subdivisionId: string;
  tx: {
    id: string;
    transactionDate: string;
    amount: number;
    description: string | null;
    matchStatus: string;
  };
}) {
  const href = `/subdivisions/${subdivisionId}/reconciliation/${tx.id}`;
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/30">
      <td className="px-3 py-3 text-sm text-foreground">
        <Link href={href} className="block">
          {formatDate(tx.transactionDate)}
        </Link>
      </td>
      <td className="px-3 py-3 text-sm text-foreground">
        <Link href={href} className="block truncate">
          {tx.description ?? "—"}
        </Link>
      </td>
      <td className="px-3 py-3 text-right text-sm tabular-nums">
        <Link href={href} className="block">
          <span className={tx.amount < 0 ? "text-destructive" : "text-foreground"}>
            {formatCurrency(tx.amount)}
          </span>
        </Link>
      </td>
      <td className="px-3 py-3">
        <Link href={href} className="inline-flex items-center gap-1.5">
          <MatchStatusBadge status={tx.matchStatus} />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
        </Link>
      </td>
    </tr>
  );
}

function MatchStatusBadge({ status }: { status: string }) {
  const copy =
    status === "auto_matched"
      ? "Auto-matched"
      : status === "manually_matched"
        ? "Manually matched"
        : status === "excluded"
          ? "Excluded"
          : "Needs review";
  const variant =
    status === "auto_matched" || status === "manually_matched"
      ? "bg-[hsl(160,100%,37%)]/10 text-[hsl(160,100%,37%)] hover:bg-[hsl(160,100%,37%)]/10"
      : status === "excluded"
        ? "bg-muted text-muted-foreground hover:bg-muted"
        : "bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,50%)] hover:bg-[hsl(38,92%,50%)]/10";
  return (
    <Badge className={cn("rounded-full", variant)}>
      {status === "auto_matched" || status === "manually_matched" ? (
        <Check className="mr-1 h-3 w-3" />
      ) : null}
      {copy}
    </Badge>
  );
}

// ─── Formatters ──────────────────────────────────────────────

function formatDateTimeMelbourne(iso: string): string {
  // en-AU, Australia/Melbourne, includes AEST/AEDT abbreviation.
  const parts = new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Australia/Melbourne",
    timeZoneName: "short",
  }).formatToParts(new Date(iso));
  // Rearrange to "24 Apr 2026, 3:04 PM AEST" style.
  const day = partValue(parts, "day");
  const month = partValue(parts, "month");
  const year = partValue(parts, "year");
  const hour = partValue(parts, "hour");
  const minute = partValue(parts, "minute");
  const period = partValue(parts, "dayPeriod");
  const tz = partValue(parts, "timeZoneName");
  return `${day} ${month} ${year}, ${hour}:${minute} ${period} ${tz}`;
}

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}
