import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ReconciliationLoading() {
  return (
    <div className="px-6 py-6 space-y-6">
      {/* Action row , structure preserved, only button widths shimmer */}
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-36 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-44 rounded-md" />
        </div>
      </div>

      {/* KPI row , labels preserved, only values shimmer */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Unmatched", sub: "transactions" },
          { label: "Oldest unmatched", sub: "days" },
          { label: "Unmatched value", sub: "awaiting reconciliation" },
          { label: "Matched this month", sub: "across all accounts" },
        ].map((k) => (
          <Card key={k.label} className="shadow-none">
            <CardContent className="p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {k.label}
              </div>
              <Skeleton className="mt-2 h-8 w-24" />
              <div className="mt-0.5 text-xs text-muted-foreground">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters row , labels preserved, selects shimmer */}
      <Card className="shadow-none">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            {[
              { label: "Bank account", w: "w-[220px]" },
              { label: "Source", w: "w-[150px]" },
              { label: "Status", w: "w-[180px]" },
            ].map((f) => (
              <div key={f.label} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </span>
                <Skeleton className={`h-9 ${f.w} rounded-md`} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table , header preserved, rows shimmer */}
      <Card className="shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Description</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                  <th className="px-4 py-2.5 font-medium text-right">Matched</th>
                  <th className="px-4 py-2.5 font-medium text-right">Remaining</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-64" />
                      <Skeleton className="h-3 w-32 mt-1.5" />
                    </td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-full" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-7 w-12 ml-auto rounded-md" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
