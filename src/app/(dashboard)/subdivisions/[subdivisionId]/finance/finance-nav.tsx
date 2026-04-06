"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";

const TABS = [
  { href: "budgets", label: "Budgets" },
  // Future: { href: "levies", label: "Levies" },
  // Future: { href: "payments", label: "Payments" },
];

export function FinanceNav({ subdivisionId, subdivisionName }: { subdivisionId: string; subdivisionName: string }) {
  const pathname = usePathname();
  const base = `/subdivisions/${subdivisionId}/finance`;

  return (
    <div>
      <PageHeader title="Finance" subtitle={subdivisionName} />
      <div className="flex gap-6 border-b border-border mt-4">
        {TABS.map((tab) => {
          const href = `${base}/${tab.href}`;
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={tab.href}
              href={href}
              className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
