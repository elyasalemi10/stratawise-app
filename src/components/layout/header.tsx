"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NotificationBell } from "./notification-bell";
import { DocumentSearch } from "./document-search";
import {
  setCachedOCs,
  SIDEBAR_REFRESH_EVENT,
} from "@/lib/sidebar-cache";
import {
  getSidebarOCs,
  type SidebarOC,
} from "@/lib/actions/oc";
import { useBreadcrumbOverride } from "@/lib/breadcrumb-context";

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  ocs: "OCs",
  settings: "Settings",
  new: "New",
  levies: "Levies",
  meetings: "Meetings",
  lots: "Lots & Owners",
  documents: "Documents",
  budgets: "Budgets",
  create: "Create",
  generate: "Generate levies",
  insurance: "Insurance",
  "bank-account": "Bank account",
  reconciliation: "Reconciliation",
  mappings: "Payer mappings",
  "gap-reports": "Gap report",
  reports: "Reports",
  inbox: "Inbox",
  maintenance: "Maintenance",
  "my-levies": "My levies",
  "chart-of-accounts": "Chart of Accounts",
  "trust-accounts": "Trust accounts",
  "help": "Help",
};

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// OC URL segments are 8-char Crockford-32 codes (post-rename).
function isOCCode(s: string): boolean {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(s);
}

interface Crumb {
  label: string;
  href: string | null;
  isLast: boolean;
}

function buildBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);

  // OC context (/ocs/[code]/...)
  if (segments[0] === "ocs" && segments[1] && isOCCode(segments[1])) {
    const ocCode = segments[1];
    const subPages = segments.slice(2);
    const base = `/ocs/${ocCode}`;

    // OC root IS the dashboard , show just "Dashboard"
    if (subPages.length === 0) {
      return [{ label: "Dashboard", href: null, isLast: true }];
    }

    // /lots/[lotId] , show "Lots & Owners > Owner details"
    if (subPages.length === 2 && subPages[0] === "lots" && isUUID(subPages[1])) {
      return [
        { label: "Lots & Owners", href: `${base}/lots`, isLast: false },
        { label: "Owner details", href: null, isLast: true },
      ];
    }

    // Build breadcrumbs from sub-page segments, skipping UUIDs and the code
    const crumbs: Crumb[] = [];
    let path = base;
    for (let i = 0; i < subPages.length; i++) {
      const segment = subPages[i];
      if (isUUID(segment) || isOCCode(segment)) continue;
      path += "/" + segment;
      const label =
        routeLabels[segment] ??
        segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      crumbs.push({
        label,
        href: i === subPages.length - 1 ? null : path,
        isLast: i === subPages.length - 1,
      });
    }

    return crumbs;
  }

  // Normal pages
  const crumbs: Crumb[] = [];
  let path = "";
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (isUUID(segment) || isOCCode(segment)) continue;
    path += "/" + segment;

    const label =
      routeLabels[segment] ??
      segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    crumbs.push({
      label,
      href: i === segments.length - 1 ? null : path,
      isLast: i === segments.length - 1,
    });
  }

  return crumbs;
}

interface HeaderProps {
  initialOCs: SidebarOC[];
}

export function Header({ initialOCs }: HeaderProps) {
  const pathname = usePathname();
  const override = useBreadcrumbOverride();
  // Page-set override takes precedence over the URL-derived breadcrumb so detail
  // pages can render entity-specific labels (e.g. "Lot 12 · Unit 3A" , Item 4).
  const breadcrumbs: Crumb[] = override
    ? override.map((c, i, arr) => ({
        label: c.label,
        href: c.href ?? null,
        isLast: i === arr.length - 1,
      }))
    : buildBreadcrumbs(pathname);

  // Sidebar cache is read by app-sidebar.tsx; we keep this header in sync so
  // a navigation event that mutates the OC list (e.g. wizard finish) re-seeds
  // both surfaces.
  useEffect(() => {
    setCachedOCs(initialOCs);

    function onRefresh() {
      getSidebarOCs()
        .then((data) => setCachedOCs(data))
        .catch(() => {});
    }
    window.addEventListener(SIDEBAR_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(SIDEBAR_REFRESH_EVENT, onRefresh);
  }, [initialOCs]);

  return (
    <div className="grid grid-cols-3 items-center flex-1 gap-4">
      {/* Breadcrumbs , left. Each segment truncates to ~30 chars with an
          ellipsis when longer; the full label sits in a native `title`
          attribute so the OS tooltip surfaces it on hover (no visible
          hint that one exists , the user just discovers it). */}
      <nav className="flex items-center text-sm min-w-0">
        {breadcrumbs.map((crumb, i) => {
          const shouldTruncate = crumb.label.length > 30;
          const display = shouldTruncate ? `${crumb.label.slice(0, 27)}...` : crumb.label;
          const titleAttr = shouldTruncate ? crumb.label : undefined;
          return (
            <span key={i} className="flex items-center min-w-0">
              {i > 0 && <span className="mx-2 text-muted-foreground">/</span>}
              {crumb.href && !crumb.isLast ? (
                <Link
                  href={crumb.href}
                  title={titleAttr}
                  className="text-muted-foreground hover:text-foreground transition-colors max-w-[18rem] truncate"
                >
                  {display}
                </Link>
              ) : (
                <span
                  title={titleAttr}
                  className={
                    crumb.isLast
                      ? "font-medium text-foreground max-w-[24rem] truncate"
                      : "text-muted-foreground max-w-[18rem] truncate"
                  }
                >
                  {display}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {/* Global document search , middle. Falls back to the page title when no
          query is active. */}
      <div className="flex justify-center min-w-0">
        <DocumentSearch />
      </div>

      {/* Notification bell , right. Center title was removed: the sidebar's
          larger switcher already shows the current dashboard. */}
      <div className="flex items-center justify-end">
        <NotificationBell />
      </div>
    </div>
  );
}
