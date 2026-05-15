"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NotificationBell } from "./notification-bell";
import { DocumentSearch } from "./document-search";
import { HeaderOCSwitcher } from "./header-oc-switcher";
import {
  setCachedOCs,
  SIDEBAR_REFRESH_EVENT,
} from "@/lib/sidebar-cache";
import {
  getSidebarOCs,
  type SidebarOC,
} from "@/lib/actions/oc";

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  ocs: "OCs",
  settings: "Settings",
  new: "New",
  levies: "Levies",
  meetings: "Meetings",
  lots: "Lots & owners",
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

    // OC root IS the dashboard — show just "Dashboard"
    if (subPages.length === 0) {
      return [{ label: "Dashboard", href: null, isLast: true }];
    }

    // /lots/[lotId] — show "Lots & owners > Owner details"
    if (subPages.length === 2 && subPages[0] === "lots" && isUUID(subPages[1])) {
      return [
        { label: "Lots & owners", href: `${base}/lots`, isLast: false },
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
  const breadcrumbs = buildBreadcrumbs(pathname);

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
      {/* OC switcher + breadcrumbs — left. The switcher is the primary "where
          am I?" surface; the breadcrumbs follow as a sub-path indicator. */}
      <div className="flex items-center gap-2 min-w-0">
        <HeaderOCSwitcher />
        {breadcrumbs.length > 0 && (
          <>
            <span className="text-muted-foreground/40 shrink-0">/</span>
            <nav className="flex items-center text-sm min-w-0 truncate">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center">
                  {i > 0 && <span className="mx-2 text-muted-foreground">/</span>}
                  {crumb.href && !crumb.isLast ? (
                    <Link
                      href={crumb.href}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={
                        crumb.isLast
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          </>
        )}
      </div>

      {/* Global document search — middle. Falls back to the page title when no
          query is active. */}
      <div className="flex justify-center min-w-0">
        <DocumentSearch />
      </div>

      {/* Notification bell — right. */}
      <div className="flex items-center justify-end">
        <NotificationBell />
      </div>
    </div>
  );
}
