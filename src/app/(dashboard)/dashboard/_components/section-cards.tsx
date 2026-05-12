"use client";

import { Building2, DollarSign, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface KPICardProps {
  label: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}

function KPICard({ label, value, description, icon }: KPICardProps) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
              {value}
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function SectionCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        label="Total levies"
        value="$0.00"
        description="No levies issued yet"
        icon={<DollarSign className="h-5 w-5" />}
      />
      <KPICard
        label="Outstanding"
        value="$0.00"
        description="No outstanding amounts"
        icon={<AlertTriangle className="h-5 w-5" />}
      />
      <KPICard
        label="OCs"
        value="0"
        description="Create your first oc"
        icon={<Building2 className="h-5 w-5" />}
      />
      <KPICard
        label="Compliance"
        value="—"
        description="No data yet"
        icon={<CheckCircle2 className="h-5 w-5" />}
      />
    </div>
  );
}
