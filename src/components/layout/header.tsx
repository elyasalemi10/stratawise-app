"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileSidebar } from "./mobile-sidebar";

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
    <header className="flex h-14 items-center border-b border-border bg-card px-6">
      {/* Mobile: hamburger */}
      <MobileSidebar />

      {/* Mobile: centered title */}
      <span className="flex-1 text-center text-sm font-semibold text-foreground lg:hidden">
        MSM
      </span>

      {/* Desktop: breadcrumbs */}
      <nav className="hidden lg:flex items-center text-sm flex-1">
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

      {/* Right side: notification bell */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative text-muted-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
          <span className="sr-only">Notifications</span>
        </Button>
      </div>
    </header>
  );
}
