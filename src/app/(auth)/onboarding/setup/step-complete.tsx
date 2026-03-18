"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSetupSummary } from "./actions";

interface Summary {
  companyName: string;
  subdivisionName: string;
  totalLots: number;
}

export function StepComplete() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    getSetupSummary().then((data) => {
      if (data) setSummary(data);
    });
  }, []);

  return (
    <div className="text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(160,100%,37%)]/10">
        <CheckCircle2 className="h-8 w-8 text-[hsl(160,100%,37%)]" />
      </div>

      <h2 className="mt-4 text-lg font-semibold text-foreground">
        Your company is ready!
      </h2>

      {summary && (
        <div className="mt-4 rounded-lg border border-border bg-card p-5 shadow-none text-left">
          <p className="text-sm font-medium text-foreground">{summary.companyName}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Managing: {summary.subdivisionName} ({summary.totalLots} lots)
          </p>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-border bg-card p-5 shadow-none text-left">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
          Next steps
        </p>
        <ul className="space-y-2 text-sm text-foreground">
          <li className="flex items-center gap-2">
            <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
            Configure lot entitlements
          </li>
          <li className="flex items-center gap-2">
            <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
            Set up bank account details
          </li>
          <li className="flex items-center gap-2">
            <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
            Create your first budget
          </li>
        </ul>
      </div>

      <div className="mt-6">
        <Link href="/dashboard">
          <Button>
            Go to dashboard &rarr;
          </Button>
        </Link>
      </div>
    </div>
  );
}
