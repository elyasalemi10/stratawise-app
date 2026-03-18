"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/subdivisions": "Subdivisions",
  "/messages": "Messages",
  "/communications": "Communications",
  "/settings": "Settings",
};

function getBreadcrumbs(pathname: string): { label: string; isLast: boolean }[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; isLast: boolean }[] = [];

  let path = "";
  for (let i = 0; i < segments.length; i++) {
    path += "/" + segments[i];
    const label = routeLabels[path] ?? segments[i].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ label, isLast: i === segments.length - 1 });
  }

  return crumbs;
}

export function Header() {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <div className="flex items-center justify-between flex-1">
      {/* Breadcrumbs */}
      <nav className="flex items-center text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center">
            {i > 0 && <span className="mx-2 text-muted-foreground">/</span>}
            <span
              className={
                crumb.isLast
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }
            >
              {crumb.label}
            </span>
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
