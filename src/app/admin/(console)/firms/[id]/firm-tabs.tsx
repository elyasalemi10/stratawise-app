"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";

type SubscriptionStatus = "active" | "suspended" | "cancelled";
type OcStatus = "active" | "archived" | "suspended";
type CompanyRole = "admin" | "manager" | "viewer" | null;

const SUB_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  cancelled: "Cancelled",
};
const SUB_STATUS_VARIANT: Record<SubscriptionStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  suspended: "warning",
  cancelled: "neutral",
};
const OC_STATUS_LABEL: Record<OcStatus, string> = {
  active: "Active",
  archived: "Archived",
  suspended: "Suspended",
};
const OC_STATUS_VARIANT: Record<OcStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  suspended: "warning",
  archived: "neutral",
};
const COMPANY_ROLE_LABEL: Record<"admin" | "manager" | "viewer", string> = {
  admin: "Admin",
  manager: "Manager",
  viewer: "Viewer",
};

export interface FirmDetail {
  id: string;
  name: string;
  tradingAs: string | null;
  registeredName: string | null;
  abn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: SubscriptionStatus;
  createdAt: string;
  ocs: Array<{
    id: string;
    name: string;
    tradingName: string | null;
    planNumber: string;
    totalLots: number;
    tier: number | null;
    status: OcStatus;
  }>;
  managers: Array<{
    id: string;
    name: string;
    email: string;
    companyRole: CompanyRole;
  }>;
}

const dateFmt = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function FirmTabsInner({ firm }: { firm: FirmDetail }) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") ?? "overview");
  const totalLots = firm.ocs.reduce((sum, o) => sum + o.totalLots, 0);

  function onTabChange(value: string) {
    setActiveTab(value);
    window.history.replaceState(null, "", `/admin/firms/${firm.id}?tab=${value}`);
  }

  return (
    <div>
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ocs">Owners corporations</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-6">
        {/* Overview */}
        <div className={activeTab === "overview" ? "" : "hidden"}>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardContent className="pt-5 space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Owners corporations</p>
                <p className="text-3xl font-bold tabular-nums text-foreground">{firm.ocs.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Lots managed</p>
                <p className="text-3xl font-bold tabular-nums text-foreground">{totalLots}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Managers</p>
                <p className="text-3xl font-bold tabular-nums text-foreground">{firm.managers.length}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardContent className="pt-5">
              <Row label="Legal name" value={firm.name} />
              <Row label="Registered name" value={firm.registeredName} />
              <Row label="ABN" value={firm.abn} />
              <Row label="Address" value={firm.address} />
              <Row label="Phone" value={firm.phone} />
              <Row label="Email" value={firm.email} />
              <Row
                label="Status"
                value={
                  <Badge variant={SUB_STATUS_VARIANT[firm.status]} className="rounded-full">
                    {SUB_STATUS_LABEL[firm.status]}
                  </Badge>
                }
              />
              <Row label="On platform since" value={dateFmt.format(new Date(firm.createdAt))} />
            </CardContent>
          </Card>
        </div>

        {/* Owners corporations */}
        <div className={activeTab === "ocs" ? "" : "hidden"}>
          {firm.ocs.length === 0 ? (
            <EmptyState icon={Building2} title="No owners corporations" description="This firm hasn't created any OCs yet." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table variant="striped">
                <TableHeader>
                  <TableRow>
                    <TableHead>Owners corporation</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Lots</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {firm.ocs.map((oc) => (
                    <TableRow key={oc.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{oc.tradingName || oc.name}</div>
                        {oc.tradingName && (
                          <div className="text-xs text-muted-foreground">{oc.name}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{oc.planNumber}</TableCell>
                      <TableCell className="text-right tabular-nums">{oc.totalLots}</TableCell>
                      <TableCell>{oc.tier ? `Tier ${oc.tier}` : ""}</TableCell>
                      <TableCell>
                        <Badge variant={OC_STATUS_VARIANT[oc.status]} className="rounded-full">
                          {OC_STATUS_LABEL[oc.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Team */}
        <div className={activeTab === "team" ? "" : "hidden"}>
          {firm.managers.length === 0 ? (
            <EmptyState icon={Users} title="No managers" description="No strata managers belong to this firm yet." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table variant="striped">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {firm.managers.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-foreground">{m.name}</TableCell>
                      <TableCell className="text-muted-foreground">{m.email}</TableCell>
                      <TableCell>{m.companyRole ? COMPANY_ROLE_LABEL[m.companyRole] : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FirmTabs({ firm }: { firm: FirmDetail }) {
  return (
    <Suspense>
      <FirmTabsInner firm={firm} />
    </Suspense>
  );
}
