"use client";

import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Will be replaced with real data from audit_log / communication_log
const activities: { id: number; action: string; reference: string; date: string }[] = [];

export function RecentActivity() {
  const hasData = activities.length > 0;

  return (
    <Card>
      <CardHeader className="border-b-0 px-5 pt-5 pb-0">
        <CardTitle className="text-base font-semibold normal-case tracking-normal">
          Recent activity
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-2">
        {hasData ? (
          <div>{/* Table will go here when data exists */}</div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">
              No activity yet. Actions will appear here as you use the platform.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
