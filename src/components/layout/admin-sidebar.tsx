"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Newspaper, Building2, Settings, ShieldCheck, LogOut, MoreVertical,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { SidebarProfile } from "@/lib/actions/profile";

const NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Management firms", href: "/admin/firms", icon: Building2, exact: false },
  { label: "Blog", href: "/admin/blog", icon: Newspaper, exact: false },
];

export function AdminSidebar({ profile }: { profile: SidebarProfile | null }) {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-2">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <ShieldCheck className="h-6 w-6 text-[color:var(--brand-gold)] shrink-0" />
          <div className="grid leading-tight">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">StrataWise</span>
            <span className="text-xs text-sidebar-foreground/70">Super Admin</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive(item.href, item.exact)}
                    size="lg"
                    className="text-base [&>svg]:!size-5"
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <AdminNavUser profile={profile} />
      </SidebarFooter>
    </Sidebar>
  );
}

function AdminNavUser({ profile }: { profile: SidebarProfile | null }) {
  const [open, setOpen] = useState(false);
  const { isMobile } = useSidebar();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the popup when clicking anywhere outside it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors cursor-pointer",
          "border-sidebar-foreground/20 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          open && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
      >
        <Avatar className="h-8 w-8 rounded-lg grayscale shrink-0">
          {profile?.userAvatarUrl ? <AvatarImage src={profile.userAvatarUrl} alt="Avatar" /> : null}
          <AvatarFallback className="rounded-lg">{profile?.userInitials ?? "SA"}</AvatarFallback>
        </Avatar>
        <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
          <span className="truncate font-medium">Super Admin</span>
          <span className="text-sidebar-foreground/70 truncate text-xs">{profile?.userEmail ?? ""}</span>
        </div>
        <MoreVertical className="ml-auto size-4 shrink-0" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 w-56 rounded-lg border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-100",
            isMobile ? "bottom-full left-0 right-0 mb-2" : "left-full bottom-0 ml-2",
          )}
        >
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-lg shrink-0">
              {profile?.userAvatarUrl ? <AvatarImage src={profile.userAvatarUrl} alt="Avatar" /> : null}
              <AvatarFallback className="rounded-lg">{profile?.userInitials ?? "SA"}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
              <span className="truncate font-medium text-foreground">Super Admin</span>
              <span className="truncate text-xs text-muted-foreground">{profile?.userEmail ?? ""}</span>
            </div>
          </div>
          <div className="-mx-1 my-1 h-px bg-border" />
          <Link
            href="/admin/settings"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="h-4 w-4" /> Settings
          </Link>
          <div className="-mx-1 my-1 h-px bg-border" />
          <form action="/logout" method="post">
            <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent hover:text-accent-foreground">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
