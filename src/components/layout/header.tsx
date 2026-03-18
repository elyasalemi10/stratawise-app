"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSidebarSubdivisions, type SidebarSubdivision } from "@/lib/actions/subdivision";

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  subdivisions: "Subdivisions",
  messages: "Messages",
  communications: "Communications",
  settings: "Settings",
  new: "New",
  levies: "Levies",
  meetings: "Meetings",
  lots: "Lots",
  documents: "Documents",
  financials: "Financials",
  maintenance: "Maintenance",
};

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

interface Crumb {
  label: string;
  href: string | null;
  isLast: boolean;
}

function buildBreadcrumbs(
  pathname: string,
  subdivisionMap: Map<string, string>
): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];

  let path = "";
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    path += "/" + segment;

    // Replace UUID with subdivision name
    if (isUUID(segment) && i > 0 && segments[i - 1] === "subdivisions") {
      const name = subdivisionMap.get(segment) ?? "Subdivision";
      crumbs.push({
        label: name,
        href: i === segments.length - 1 ? null : `${path}/dashboard`,
        isLast: i === segments.length - 1,
      });
      continue;
    }

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

export function Header() {
  const pathname = usePathname();
  const [subdivisionMap, setSubdivisionMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    getSidebarSubdivisions()
      .then((subs: SidebarSubdivision[]) => {
        const map = new Map<string, string>();
        subs.forEach((s) => map.set(s.id, s.name));
        setSubdivisionMap(map);
      })
      .catch(() => {});
  }, []);

  const breadcrumbs = buildBreadcrumbs(pathname, subdivisionMap);

  return (
    <div className="flex items-center justify-between flex-1">
      {/* Breadcrumbs */}
      <nav className="flex items-center text-sm">
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

      {/* Notification bell */}
      <Button variant="ghost" size="icon" className="relative text-muted-foreground">
        <Bell className="h-4 w-4" />
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
        <span className="sr-only">Notifications</span>
      </Button>
    </div>
  );
}
