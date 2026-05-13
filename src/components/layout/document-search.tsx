"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  FileText,
  Building2,
  User,
  Receipt,
  CalendarCheck,
  Wrench,
  AlertCircle,
  Shield,
  Bell,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { globalSearch, type SearchHit, type SearchHitType } from "@/lib/actions/global-search";

// Global search. Lives in the header. Hits every searchable entity in one
// call (OCs, lot owners, documents, levies, meetings, maintenance,
// complaints, insurance, notifications, in-app pages). Scoped automatically:
// inside an OC (/ocs/{code}/...) it searches just that OC; everywhere else
// it searches across the whole management company.

const TYPE_META: Record<SearchHitType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  page:        { label: "Pages",          icon: ArrowRight },
  oc:          { label: "Owners Corporations", icon: Building2 },
  lot_owner:   { label: "Lot owners",      icon: User },
  document:    { label: "Documents",       icon: FileText },
  levy:        { label: "Levies",          icon: Receipt },
  meeting:     { label: "Meetings",        icon: CalendarCheck },
  maintenance: { label: "Maintenance",     icon: Wrench },
  complaint:   { label: "Complaints",      icon: AlertCircle },
  insurance:   { label: "Insurance",       icon: Shield },
  notification:{ label: "Notifications",   icon: Bell },
};

// Visual priority — same order pages were appended in the server action.
const TYPE_ORDER: SearchHitType[] = [
  "page",
  "oc",
  "lot_owner",
  "document",
  "levy",
  "meeting",
  "maintenance",
  "complaint",
  "insurance",
  "notification",
];

export function DocumentSearch() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Detect "we're inside an OC" so the server can scope results. Excludes
  // the wizard route (/ocs/new) — it's not a real OC context.
  const ocShortCode = useMemo(() => {
    const m = pathname?.match(/^\/ocs\/([^/]+)/);
    if (!m) return null;
    if (m[1] === "new") return null;
    return m[1];
  }, [pathname]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  function onInput(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) {
      setHits([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    debounceRef.current = setTimeout(async () => {
      const res = await globalSearch(v, ocShortCode);
      setHits(res.hits ?? []);
      setLoading(false);
    }, 200);
  }

  // Group hits by type, preserving the priority order.
  const grouped = useMemo(() => {
    const m = new Map<SearchHitType, SearchHit[]>();
    for (const h of hits) {
      const list = m.get(h.type) ?? [];
      list.push(h);
      m.set(h.type, list);
    }
    return TYPE_ORDER
      .map((t) => ({ type: t, items: m.get(t) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [hits]);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <div className="flex h-11 items-center rounded-xl border-2 border-border bg-card focus-within:border-primary/40">
        <div className="flex items-center pl-4 pr-3 border-r border-border">
          <Search className="h-4 w-4 text-foreground" />
        </div>
        <input
          type="search"
          placeholder={ocShortCode ? "Search this OC" : "Search anything"}
          value={query}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          className="flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {loading ? (
            <SearchSkeleton />
          ) : grouped.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm font-medium text-foreground">
                Couldn&apos;t find anything matching &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try different keywords, a partial name, a reference number, or an address.
              </p>
            </div>
          ) : (
            <div>
              {grouped.map((group) => {
                const Icon = TYPE_META[group.type].icon;
                return (
                  <div key={group.type} className="border-t border-border first:border-t-0">
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {TYPE_META[group.type].label}
                    </p>
                    <ul>
                      {group.items.map((hit) => (
                        <li key={`${hit.type}-${hit.id}`}>
                          <Link
                            href={hit.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "flex items-start gap-2 px-3 py-2 text-sm hover:bg-muted",
                            )}
                          >
                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-foreground">
                                {hit.title}
                              </p>
                              {hit.subtitle && (
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {hit.subtitle}
                                </p>
                              )}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Skeleton mirrors the loaded result row layout: an icon column on the left
// and a two-line text block on the right. Three placeholder rows so the user
// has a sense of scale.
function SearchSkeleton() {
  return (
    <div className="space-y-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-2 py-1.5">
          <Skeleton className="mt-0.5 h-4 w-4 rounded shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
