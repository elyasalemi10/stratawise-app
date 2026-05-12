"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NotificationBell } from "./notification-bell";
import {
  setCachedSubdivisions,
  SIDEBAR_REFRESH_EVENT,
} from "@/lib/sidebar-cache";
import {
  getSidebarSubdivisions,
  type SidebarSubdivision,
} from "@/lib/actions/subdivision";

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  subdivisions: "Subdivisions",
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

// Subdivision URL segments are 8-char Crockford-32 codes (post-rename).
function isSubdivisionCode(s: string): boolean {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(s);
}

interface Crumb {
  label: string;
  href: string | null;
  isLast: boolean;
}

function buildBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);

  // Subdivision context (/subdivisions/[code]/...)
  if (segments[0] === "subdivisions" && segments[1] && isSubdivisionCode(segments[1])) {
    const subdivisionCode = segments[1];
    const subPages = segments.slice(2);
    const base = `/subdivisions/${subdivisionCode}`;

    // Subdivision root IS the dashboard — show just "Dashboard"
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
      if (isUUID(segment) || isSubdivisionCode(segment)) continue;
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
    if (isUUID(segment) || isSubdivisionCode(segment)) continue;
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
  initialSubdivisions: SidebarSubdivision[];
}

export function Header({ initialSubdivisions }: HeaderProps) {
  const pathname = usePathname();
  const breadcrumbs = buildBreadcrumbs(pathname);

  const [subdivisions, setSubdivisions] = useState<SidebarSubdivision[]>(initialSubdivisions);

  // No on-mount fetch — server layout already handed us fresh data.
  // Only refetch when a mutation broadcasts a refresh event.
  useEffect(() => {
    setCachedSubdivisions(initialSubdivisions);

    function onRefresh() {
      getSidebarSubdivisions()
        .then((data) => {
          setSubdivisions(data);
          setCachedSubdivisions(data);
        })
        .catch(() => {});
    }
    window.addEventListener(SIDEBAR_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(SIDEBAR_REFRESH_EVENT, onRefresh);
  }, [initialSubdivisions]);

  const subdivisionMatch = pathname.match(/^\/subdivisions\/([^/]+)/);
  const currentCode = subdivisionMatch?.[1] ?? null;
  const isInSubdivision = currentCode !== null && isSubdivisionCode(currentCode);
  const currentSubdivision = subdivisions.find((s) => s.short_code === currentCode);

  const centerTitle = isInSubdivision
    ? (currentSubdivision?.name ?? null)
    : "Main dashboard";

  return (
    <div className="grid grid-cols-3 items-center flex-1 gap-4">
      {/* Breadcrumbs — left */}
      <nav className="flex items-center text-sm min-w-0">
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

      {/* Centered title — middle */}
      <div className="flex justify-center min-w-0">
        {centerTitle ? (
          <span className="font-bold text-foreground truncate">{centerTitle}</span>
        ) : null}
      </div>

      {/* Notification bell — right */}
      <div className="flex justify-end">
        <NotificationBell />
      </div>
    </div>
  );
}
