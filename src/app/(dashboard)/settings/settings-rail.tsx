"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_NAV } from "./nav";

// The rail reads the URL, not component state.
//
// Settings used to be one page with a ?tab= param held in useState. Reloading
// on ?tab=notifications rendered Profile, because the skeleton and the first
// client render both defaulted to it and only corrected once JS ran. Sections
// are real routes now, so the active one is whatever the URL says, on the
// server, on the first frame, every time.

export function SettingsRail({ isManager }: { isManager: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="shrink-0 lg:w-56">
      {SETTINGS_NAV.map((group) => {
        const items = group.items.filter((i) => !i.managerOnly || isManager);
        if (items.length === 0) return null;
        return (
          <div
            key={group.label}
            className="mb-4 border-t border-border pt-4 first:mb-4 first:border-t-0 first:pt-0"
          >
            <p className="pb-1.5 text-xs font-medium text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
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
          </div>
        );
      })}
    </nav>
  );
}
