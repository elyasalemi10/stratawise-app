"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useBreadcrumbOverride } from "@/lib/breadcrumb-context";

// Breadcrumb for the super-admin console top bar, mirroring the manager
// dashboard header. Crumbs derive from the URL; entity pages (e.g. a firm
// detail) override with a specific label via useSetBreadcrumb.

const ADMIN_LABELS: Record<string, string> = {
  firms: "Management firms",
  blog: "Blog",
  settings: "Settings",
};

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

interface Crumb {
  label: string;
  href: string | null;
  isLast: boolean;
}

function buildAdminBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean); // ["admin", ...]
  const rest = segments.slice(1);
  if (rest.length === 0) return [{ label: "Overview", href: null, isLast: true }];

  const crumbs: Crumb[] = [];
  let path = "/admin";
  for (let i = 0; i < rest.length; i++) {
    const segment = rest[i];
    if (isUUID(segment)) continue;
    path += "/" + segment;
    const label =
      ADMIN_LABELS[segment] ??
      segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({
      label,
      href: i === rest.length - 1 ? null : path,
      isLast: i === rest.length - 1,
    });
  }
  return crumbs;
}

export function AdminHeader() {
  const pathname = usePathname();
  const override = useBreadcrumbOverride();
  const breadcrumbs: Crumb[] = override
    ? override.map((c, i, arr) => ({
        label: c.label,
        href: c.href ?? null,
        isLast: i === arr.length - 1,
      }))
    : buildAdminBreadcrumbs(pathname);

  return (
    <nav className="flex min-w-0 items-center text-sm">
      {breadcrumbs.map((crumb, i) => {
        const shouldTruncate = crumb.label.length > 30;
        const display = shouldTruncate ? `${crumb.label.slice(0, 27)}...` : crumb.label;
        const titleAttr = shouldTruncate ? crumb.label : undefined;
        return (
          <span key={i} className="flex min-w-0 items-center">
            {i > 0 && <span className="mx-2 text-muted-foreground">/</span>}
            {crumb.href && !crumb.isLast ? (
              <Link
                href={crumb.href}
                title={titleAttr}
                className="max-w-[18rem] truncate text-muted-foreground transition-colors hover:text-foreground"
              >
                {display}
              </Link>
            ) : (
              <span
                title={titleAttr}
                className={
                  crumb.isLast
                    ? "max-w-[24rem] truncate font-medium text-foreground"
                    : "max-w-[18rem] truncate text-muted-foreground"
                }
              >
                {display}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
