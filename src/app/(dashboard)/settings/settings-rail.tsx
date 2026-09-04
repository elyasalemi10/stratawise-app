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
              {/* Every tab is prefetched, not left to the default
                  hover-only prefetch. Next's useActionQueue ends with
                  `isThenable(state) ? use(state) : state`, and `use` takes a
                  hook slot, so Router renders a different number of hooks
                  depending on whether the router state is a promise. Next's
                  own comment says that happens "when navigating to a
                  non-prefetched route", which is exactly a settings tab
                  clicked without hovering first, and when it interleaves
                  with another render you get "Rendered more hooks than
                  during the previous render" thrown from inside Router.

                  That is a framework bug we cannot fix from here, but a
                  route already in the cache never puts the state in that
                  shape. These are seven small sibling pages a manager moves
                  between constantly, so prefetching them is what we would
                  want regardless. */}
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
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
