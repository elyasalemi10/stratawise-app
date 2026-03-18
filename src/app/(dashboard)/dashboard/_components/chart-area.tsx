"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  levies: {
    label: "Levies issued",
    color: "hsl(216, 100%, 58%)",
  },
  payments: {
    label: "Payments received",
    color: "hsl(160, 100%, 37%)",
  },
} satisfies ChartConfig;

// Empty placeholder data — will be replaced with real data from Supabase
const chartData: { month: string; levies: number; payments: number }[] = [];

export function ChartArea() {
  const hasData = chartData.length > 0;

  return (
    <Card>
      <CardHeader className="border-b-0 pb-0 px-5 pt-5">
        <CardTitle className="text-base font-semibold normal-case tracking-normal">
          Financial overview
        </CardTitle>
        <CardDescription>Levies vs payments</CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-2">
        {hasData ? (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fillLevies" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-levies)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-levies)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fillPayments" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-payments)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-payments)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="hsl(220, 13%, 91%)" strokeOpacity={0.5} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 12, fill: "hsl(220, 9%, 46%)" }}
              />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              <Area
                dataKey="payments"
                type="monotone"
                fill="url(#fillPayments)"
                stroke="var(--color-payments)"
                strokeWidth={2}
              />
              <Area
                dataKey="levies"
                type="monotone"
                fill="url(#fillLevies)"
                stroke="var(--color-levies)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="flex h-[250px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Financial data will appear here once levies are issued.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
