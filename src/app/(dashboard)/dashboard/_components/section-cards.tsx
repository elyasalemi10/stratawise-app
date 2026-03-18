"use client";

import { TrendingUp, TrendingDown, Building2, DollarSign, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface KPICardProps {
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  description: string;
  icon: React.ReactNode;
}

function KPICard({ label, value, trend, trendUp, description, icon }: KPICardProps) {
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
        <div className="mt-3 flex items-center gap-2">
          {trend && (
            <Badge variant={trendUp ? "success" : "destructive"} className="text-xs">
              {trendUp ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
              {trend}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function SectionCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        label="Total levies"
        value="$482,640"
        trend="+12.5%"
        trendUp={true}
        description="from last quarter"
        icon={<DollarSign className="h-5 w-5" />}
      />
      <KPICard
        label="Outstanding"
        value="$23,450"
        trend="+3.2%"
        trendUp={false}
        description="from last quarter"
        icon={<AlertTriangle className="h-5 w-5" />}
      />
      <KPICard
        label="Subdivisions"
        value="156"
        description="across 4 regions"
        icon={<Building2 className="h-5 w-5" />}
      />
      <KPICard
        label="Compliance"
        value="94.2%"
        trend="+2.1%"
        trendUp={true}
        description="above 90% target"
        icon={<CheckCircle2 className="h-5 w-5" />}
      />
    </div>
  );
}
