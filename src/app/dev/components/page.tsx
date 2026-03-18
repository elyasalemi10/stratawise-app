"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  Download,
  Trash2,
  Settings,
  Building2,
  FileText,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

// ============================================
// SAMPLE FORM SCHEMA
// ============================================
const subdivisionSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  planNumber: z.string().min(1, "Plan number is required"),
  totalLots: z.coerce.number().min(1, "Must have at least 1 lot").max(999, "Maximum 999 lots"),
});

type SubdivisionForm = z.infer<typeof subdivisionSchema>;

// ============================================
// SAMPLE TABLE DATA
// ============================================
const sampleSubdivisions = [
  { id: 1, name: "Harbour View Towers", plan: "PS 123456", lots: 42, status: "Active", balance: "$125,430.00" },
  { id: 2, name: "Riverside Gardens", plan: "PS 234567", lots: 18, status: "Active", balance: "$43,210.00" },
  { id: 3, name: "Carlton Residences", plan: "PS 345678", lots: 86, status: "Compliant", balance: "$312,000.00" },
  { id: 4, name: "Docklands Quarter", plan: "PS 456789", lots: 120, status: "Overdue", balance: "-$8,450.00" },
  { id: 5, name: "South Yarra Place", plan: "PS 567890", lots: 24, status: "Draft", balance: "$0.00" },
];

// ============================================
// SHOWCASE PAGE
// ============================================
export default function ComponentShowcase() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SubdivisionForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(subdivisionSchema) as any,
  });

  const onSubmit = (data: SubdivisionForm) => {
    toast.success(`Subdivision "${data.name}" created successfully`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Page title */}
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            MSM Design System
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Component showcase for My Strata Management. Development reference only.
          </p>
        </div>

        <div className="space-y-10">
          {/* ── PAGE HEADER ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Page header</h2>
            <Card>
              <CardContent className="pt-5">
                <PageHeader
                  backLink={{ href: "/subdivisions", label: "Back to Subdivisions" }}
                  title="Harbour View Towers"
                  subtitle="PS 123456 — 42 lots — Melbourne VIC 3000"
                  badge={<Badge variant="success">Active</Badge>}
                  actions={
                    <>
                      <Button variant="secondary">
                        <Download className="mr-2 h-4 w-4" />
                        Export
                      </Button>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Create levy
                      </Button>
                    </>
                  }
                />
              </CardContent>
            </Card>
          </section>

          {/* ── BUTTONS ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Buttons</h2>
            <Card>
              <CardContent className="pt-5">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button>Primary action</Button>
                    <Button variant="secondary">Secondary action</Button>
                    <Button variant="destructive">Delete</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="link">Link style</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="sm">Small</Button>
                    <Button size="default">Default</Button>
                    <Button size="lg">Large</Button>
                    <Button size="icon" variant="ghost">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button disabled>Disabled primary</Button>
                    <Button variant="secondary" disabled>Disabled secondary</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Create subdivision
                    </Button>
                    <Button variant="secondary">
                      <Download className="mr-2 h-4 w-4" />
                      Export CSV
                    </Button>
                    <Button variant="destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove lot
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── BADGES ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Badges / Status pills</h2>
            <Card>
              <CardContent className="pt-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="success">Active</Badge>
                  <Badge variant="success">Paid</Badge>
                  <Badge variant="success">Compliant</Badge>
                  <Badge variant="warning">Approaching</Badge>
                  <Badge variant="warning">Due soon</Badge>
                  <Badge variant="destructive">Overdue</Badge>
                  <Badge variant="destructive">Expired</Badge>
                  <Badge variant="neutral">Draft</Badge>
                  <Badge variant="neutral">Pending</Badge>
                  <Badge variant="info">Sent</Badge>
                  <Badge variant="info">In progress</Badge>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── CARD WITH HEADER ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Card with header</h2>
            <Card>
              <CardHeader>
                <CardTitle>Levy summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Cards use borders for depth, never shadows. Headers have a bottom border separator.
                  Card titles are 14px, semibold, uppercase with wide tracking.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* ── KPI CARDS ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">KPI metric cards</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Total levies
                  </p>
                  <p className="mt-2 text-[1.75rem] font-bold tabular-nums text-foreground">
                    $482,640
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-[hsl(160,100%,37%)]">
                    <TrendingUp className="h-3 w-3" />
                    +12.5% from last quarter
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Outstanding
                  </p>
                  <p className="mt-2 text-[1.75rem] font-bold tabular-nums text-destructive">
                    $23,450
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <TrendingDown className="h-3 w-3" />
                    +3.2% from last quarter
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Subdivisions
                  </p>
                  <p className="mt-2 text-[1.75rem] font-bold tabular-nums text-foreground">
                    156
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    Across 4 regions
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Compliance rate
                  </p>
                  <p className="mt-2 text-[1.75rem] font-bold tabular-nums text-[hsl(160,100%,37%)]">
                    94.2%
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-[hsl(160,100%,37%)]">
                    <CheckCircle2 className="h-3 w-3" />
                    Above 90% target
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── TABLE ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Table</h2>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Subdivisions</CardTitle>
                  <Button size="sm">
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add subdivision
                  </Button>
                </div>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Plan number</TableHead>
                    <TableHead className="text-right">Lots</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleSubdivisions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.name}</TableCell>
                      <TableCell className="text-muted-foreground">{sub.plan}</TableCell>
                      <TableCell className="text-right tabular-nums">{sub.lots}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            sub.status === "Active" || sub.status === "Compliant"
                              ? "success"
                              : sub.status === "Overdue"
                                ? "destructive"
                                : "neutral"
                          }
                        >
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {sub.balance}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>

          {/* ── FORM ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Form with Zod validation</h2>
            <Card>
              <CardHeader>
                <CardTitle>Create subdivision</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">
                      Subdivision name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      placeholder="e.g. Harbour View Towers"
                      aria-invalid={!!errors.name}
                      {...register("name")}
                    />
                    {errors.name && (
                      <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="planNumber">
                      Plan number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="planNumber"
                      placeholder="e.g. PS 123456"
                      aria-invalid={!!errors.planNumber}
                      {...register("planNumber")}
                    />
                    {errors.planNumber && (
                      <p className="text-xs text-destructive mt-1">{errors.planNumber.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="totalLots">
                      Total lots <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="totalLots"
                      type="number"
                      placeholder="e.g. 42"
                      aria-invalid={!!errors.totalLots}
                      {...register("totalLots")}
                    />
                    {errors.totalLots && (
                      <p className="text-xs text-destructive mt-1">{errors.totalLots.message}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button type="submit">Create subdivision</Button>
                    <Button type="button" variant="ghost">
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </section>

          {/* ── TOASTS ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Toast notifications</h2>
            <Card>
              <CardContent className="pt-5">
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => toast.success("Levy created successfully")}
                  >
                    Success toast
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => toast.error("Failed to process payment")}
                  >
                    Error toast
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => toast.info("Meeting notice sent to all lot owners")}
                  >
                    Info toast
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => toast.warning("Levy due date is within 28 days")}
                  >
                    Warning toast
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── EMPTY STATE ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Empty state</h2>
            <Card>
              <CardContent className="py-16">
                <div className="flex flex-col items-center text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/30" />
                  <h3 className="mt-4 text-base font-medium text-foreground">
                    No documents yet
                  </h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Upload meeting minutes, insurance certificates, or other strata documents
                    to keep everything organised in one place.
                  </p>
                  <Button className="mt-4">
                    <Plus className="mr-2 h-4 w-4" />
                    Upload document
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── SKELETON LOADING ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Skeleton loading states</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-3 h-7 w-32" />
                    <Skeleton className="mt-2 h-3 w-28" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Skeleton className="h-10 w-full" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </CardContent>
            </Card>
          </section>

          {/* ── TYPOGRAPHY ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Typography scale</h2>
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Page title (24px/600)
                  </span>
                  <p className="text-2xl font-semibold tracking-tight text-foreground">
                    Harbour View Towers
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Section title (18px/600)
                  </span>
                  <p className="text-lg font-semibold text-foreground">
                    Levy schedule
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Card title (14px/600/uppercase)
                  </span>
                  <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
                    Administrative fund
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Body (14px/400)
                  </span>
                  <p className="text-sm text-foreground">
                    The annual general meeting is scheduled for 15 March 2026 at the community hall.
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Body small (12px/400)
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Last updated 2 hours ago by admin@example.com
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Label (12px/500/uppercase)
                  </span>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Due date
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Metric (28px/700/tabular-nums)
                  </span>
                  <p className="text-[1.75rem] font-bold tabular-nums text-foreground">
                    $1,234,567.89
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── COLOUR PALETTE ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Colour palette</h2>
            <Card>
              <CardContent className="pt-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {[
                    { label: "Primary", color: "bg-primary", hex: "#2b7fff" },
                    { label: "Secondary", color: "bg-secondary", hex: "#00bd7d" },
                    { label: "Destructive", color: "bg-destructive", hex: "#ef4444" },
                    { label: "Warning", color: "bg-warning", hex: "#f59e0b" },
                    { label: "Foreground", color: "bg-foreground", hex: "#1a1f2e" },
                    { label: "Muted fg", color: "bg-muted-foreground", hex: "#6b7280" },
                    { label: "Background", color: "bg-background border border-border", hex: "#f0f2f5" },
                    { label: "Card", color: "bg-card border border-border", hex: "#ffffff" },
                    { label: "Border", color: "bg-border", hex: "#e2e5ea" },
                    { label: "Sidebar", color: "bg-sidebar", hex: "#1a1f2e" },
                    { label: "Muted", color: "bg-muted border border-border", hex: "#f0f2f5" },
                    { label: "Ring", color: "bg-ring", hex: "#2b7fff" },
                  ].map((swatch) => (
                    <div key={swatch.label} className="space-y-1.5">
                      <div className={`h-10 rounded-md ${swatch.color}`} />
                      <p className="text-xs font-medium text-foreground">{swatch.label}</p>
                      <p className="text-xs text-muted-foreground">{swatch.hex}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-10 border-t border-border pt-6 pb-10">
          <p className="text-xs text-muted-foreground">
            MSM Design System v1.0 — Development reference only. Not visible in production.
          </p>
        </div>
      </div>
    </div>
  );
}
