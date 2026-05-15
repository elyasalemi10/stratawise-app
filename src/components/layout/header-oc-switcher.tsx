"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, ChevronDown, LayoutDashboard, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getCachedOCs, setCachedOCs, SIDEBAR_REFRESH_EVENT } from "@/lib/sidebar-cache";
import { getSidebarOCs, type SidebarOC } from "@/lib/actions/oc";

// Stripe-style OC switcher mounted in the top header so the active OC is
// visible (and changeable) from any page. Shares the sidebar's data source
// (sidebar-cache.ts) so opening / closing the picker is instant and refresh
// events from completeWizard / draft mutations propagate to both surfaces.
//
// "Filter follows you" behaviour: picking an OC navigates to the same sub-page
// under the new code, mirroring the sidebar's switchOC logic.

function isOCCode(s: string): boolean {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(s);
}

export function HeaderOCSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [ocs, setOCs] = useState<SidebarOC[]>(() => getCachedOCs() ?? []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const segments = pathname.split("/").filter(Boolean);
  const currentOCCode =
    segments[0] === "ocs" && segments[1] && isOCCode(segments[1])
      ? segments[1]
      : null;
  const isInOC = currentOCCode !== null;
  const currentOC = ocs.find((s) => s.short_code === currentOCCode);

  // Seed from cache on mount; refetch when the wizard / draft flow fires the
  // refresh bus event. Keeps the picker in sync with sidebar mutations.
  useEffect(() => {
    function refresh() {
      getSidebarOCs()
        .then((data) => {
          setOCs(data);
          setCachedOCs(data);
        })
        .catch(() => {});
    }
    if (ocs.length === 0) refresh();
    window.addEventListener(SIDEBAR_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(SIDEBAR_REFRESH_EVENT, refresh);
    // ocs.length-on-mount is intentional — we only want to refetch if cache
    // was empty at first render. Subsequent refreshes ride the bus event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset search every time the popover opens so the next visit starts clean.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const activeOCs = ocs.filter((s) => s.kind !== "draft");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? activeOCs.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.plan_number.toLowerCase().includes(q) ||
          s.address.toLowerCase().includes(q),
      )
    : activeOCs;

  function switchTo(newCode: string | null) {
    setOpen(false);
    if (newCode === null) {
      router.push("/dashboard");
      return;
    }
    if (currentOCCode) {
      // Same sub-page under the new OC, e.g. /ocs/A/lots → /ocs/B/lots.
      const subPage = pathname.replace(`/ocs/${currentOCCode}`, "");
      router.push(`/ocs/${newCode}${subPage}`);
    } else {
      router.push(`/ocs/${newCode}`);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Switch dashboard"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 h-9 text-sm hover:border-primary/40 transition-colors cursor-pointer min-w-0"
          >
            <Building2 className="size-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground max-w-[200px] truncate">
              {isInOC ? (currentOC?.name ?? "OC") : "Main dashboard"}
            </span>
            <ChevronDown className="ml-1 size-4 text-muted-foreground shrink-0" />
          </button>
        }
      />
      <PopoverContent align="start" sideOffset={6} className="w-80 p-0">
        {/* Sticky top — Main dashboard option + search box. */}
        <div className="border-b border-border p-1.5 space-y-1.5">
          <button
            type="button"
            onClick={() => switchTo(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent text-left cursor-pointer",
              !isInOC && "bg-muted/60 text-muted-foreground",
            )}
          >
            <LayoutDashboard className="size-4 shrink-0" />
            <span className="font-medium">Main dashboard</span>
          </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search OCs"
              className="h-8 pl-7 text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        {/* Scrollable middle — OC list. */}
        <div className="max-h-[360px] overflow-y-auto overflow-x-hidden p-1">
          {filtered.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              {q ? "No OCs match." : "No OCs yet."}
            </div>
          ) : (
            filtered.map((oc) => {
              const isCurrent = oc.short_code === currentOCCode;
              return (
                <button
                  key={oc.id}
                  type="button"
                  onClick={() => switchTo(oc.short_code)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent text-left cursor-pointer",
                    isCurrent && "bg-muted/60 text-muted-foreground",
                  )}
                >
                  <div className="flex size-8 items-center justify-center rounded-md border border-border shrink-0">
                    <Building2 className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block truncate font-medium">{oc.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {oc.plan_number}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Sticky bottom — Create OC link (managers only). The sidebar swapper
            applies the same is-lot-owner guard, but the role lives on profile
            which we don't fetch here; the route itself enforces access via
            middleware. */}
        <div className="border-t border-border p-1">
          <button
            type="button"
            onClick={() => { setOpen(false); router.push("/ocs/new"); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent cursor-pointer"
          >
            <div className="flex size-6 items-center justify-center rounded-md border border-border">
              <Plus className="size-3.5" />
            </div>
            <span className="font-medium text-muted-foreground">Create OC</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
