"use client";

import { Plus, ShieldCheck, CalendarIcon, Wallet, FileCheck } from "lucide-react";
import { OCPageTitle } from "@/components/shared/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// Mirrors insurance-timeline.tsx: four summary cards, the Add action, the
// policy table, then the cover timeline underneath.
//
// Everything the app already knows renders for real , the card labels and
// their icons, the column names, the button, the section heading, the
// gantt's hatch. Only the server's values shimmer. The page used to be the
// gantt alone and this skeleton matched that; it has to move with it or the
// loading state describes a page that no longer exists.

const SUMMARY = [
  { label: "Cover", icon: ShieldCheck },
  { label: "Next renewal", icon: CalendarIcon },
  { label: "Premium a year", icon: Wallet },
  { label: "Certificates", icon: FileCheck },
];

const COLUMNS = [
  { label: "Cover", w: "w-28" },
  { label: "Insurer", w: "w-32" },
  { label: "Sum insured", w: "w-24", right: true },
  { label: "Premium", w: "w-20", right: true },
  { label: "Expires", w: "w-28" },
  { label: "Certificate", w: "w-20" },
  { label: "Status", w: "w-16" },
];

const ROW_H = 90;
// Left offset / width as percentages, so the bars sit at plausible spots on
// the axis without pretending to know the real dates.
const BARS = [
  { left: "6%", width: "38%" },
  { left: "30%", width: "44%" },
  { left: "52%", width: "30%" },
];

export function InsuranceSkeleton() {
  return (
    <div className="space-y-6">
      <OCPageTitle page="Insurance" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SUMMARY.map(({ label, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <Skeleton className="mt-2 h-7 w-24" />
                  <Skeleton className="mt-1.5 h-3 w-28" />
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-end">
        <Button disabled>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add policy
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <Table variant="striped">
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead key={c.label} className={c.right ? "text-right" : undefined}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 3 }).map((_, r) => (
              <TableRow key={r}>
                {COLUMNS.map((c) => (
                  <TableCell key={c.label} className={c.right ? "text-right" : undefined}>
                    <Skeleton className={`h-4 ${c.w} ${c.right ? "ml-auto" : ""}`} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Cover timeline</h2>
        <div className="relative rounded-md border border-border bg-card">
          <div className="overflow-hidden">
            {/* Time axis. The quarter labels are dates we do not have yet. */}
            <div className="border-b border-border bg-card">
              <div className="relative flex h-9 items-start">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="relative flex flex-1 flex-col items-start">
                    <Skeleton className="mt-1 ml-1 h-2.5 w-12" />
                    <div className="mt-auto h-6 w-px bg-border" />
                  </div>
                ))}
              </div>
            </div>

            {BARS.map((bar, i) => (
              <div key={i} className="border-b border-border/50 last:border-b-0">
                <div
                  className="relative"
                  style={{
                    height: ROW_H,
                    backgroundImage:
                      "repeating-linear-gradient(45deg, hsl(0, 72%, 92%) 0 8px, hsl(0, 0%, 100%) 8px 16px)",
                  }}
                >
                  <Skeleton
                    className="absolute top-4 bottom-4 rounded-md"
                    style={{ left: bar.left, width: bar.width }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
