"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { OC_SETTINGS_NAV } from "./nav";

export function OCSettingsRail({ ocCode }: { ocCode: string }) {
  const pathname = usePathname();
  const base = `/ocs/${ocCode}/settings`;

  return (
    <nav className="shrink-0 lg:w-56">
      <div className="space-y-0.5">
        {OC_SETTINGS_NAV.map((item) => {
          const href = `${base}/${item.section}`;
          const Icon = item.icon;
          // Prefetched for the same reason as the account settings rail:
          // see the note there about Next's conditional use() in Router.
          const isActive = pathname === href;
          return (
            <Link
              prefetch
              key={item.section}
              href={href}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
