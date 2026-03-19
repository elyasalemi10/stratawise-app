"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Building2,
  Settings,
  LogOut,
  ChevronsUpDown,
  Receipt,
  Users,
  FileText,
  Wallet,
  Wrench,
  CalendarCheck,
  Plus,
  Check,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getSidebarProfile, type SidebarProfile } from "@/lib/actions/profile";
import {
  getSidebarSubdivisions,
  type SidebarSubdivision,
} from "@/lib/actions/subdivision";

// ─── Nav definitions ────────────────────────────────────────────

const mainNavGroups = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/subdivisions", label: "Subdivisions", icon: Building2 },
    ],
  },
];

function getSubdivisionNavGroups(subdivisionId: string) {
  const base = `/subdivisions/${subdivisionId}`;
  return [
    {
      label: "Overview",
      items: [
        { href: `${base}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
      ],
    },
    {
      label: "Management",
      items: [
        { href: `${base}/levies`, label: "Levies", icon: Receipt },
        { href: `${base}/meetings`, label: "Meetings", icon: CalendarCheck },
        { href: `${base}/lots`, label: "Lots", icon: Users },
        { href: `${base}/documents`, label: "Documents", icon: FileText },
        { href: `${base}/financials`, label: "Financials", icon: Wallet },
        { href: `${base}/maintenance`, label: "Maintenance", icon: Wrench },
      ],
    },
  ];
}

// ─── Simple dropdown (avoids base-ui Menu.Trigger conflict) ─────

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose]);
}

function SimpleDropdown({
  trigger,
  children,
  side = "bottom",
  matchWidth = false,
  variant = "light",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  side?: "bottom" | "top";
  matchWidth?: boolean;
  variant?: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const positionClass = side === "top"
    ? "bottom-full mb-1"
    : "top-full mt-1";

  const bgClass = variant === "dark"
    ? "bg-sidebar border-sidebar-border"
    : "bg-popover border-border";

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          className={`absolute ${positionClass} left-0 z-50 rounded-lg border ${bgClass} p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-100 ${matchWidth ? "w-full" : "min-w-56"}`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  children,
  onClick,
  variant = "light",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "light" | "dark";
}) {
  const hoverClass = variant === "dark"
    ? "hover:bg-white/10 text-sidebar-foreground"
    : "hover:bg-accent hover:text-accent-foreground text-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm outline-none ${hoverClass}`}
    >
      {children}
    </button>
  );
}

function DropdownLabel({ children, variant = "light" }: { children: React.ReactNode; variant?: "light" | "dark" }) {
  const colorClass = variant === "dark" ? "text-sidebar-foreground/50" : "text-muted-foreground";
  return (
    <div className={`px-2 py-1 text-xs font-medium ${colorClass}`}>
      {children}
    </div>
  );
}

function DropdownSeparator({ variant = "light" }: { variant?: "light" | "dark" }) {
  const borderClass = variant === "dark" ? "bg-white/10" : "bg-border";
  return <div className={`-mx-1 my-1 h-px ${borderClass}`} />;
}

// ─── Main component ─────────────────────────────────────────────

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useClerk();
  const [profile, setProfile] = useState<SidebarProfile | null>(null);
  const [subdivisions, setSubdivisions] = useState<SidebarSubdivision[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([getSidebarProfile(), getSidebarSubdivisions()])
      .then(([profileData, subdivisionData]) => {
        setProfile(profileData);
        setSubdivisions(subdivisionData);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, []);

  // Detect subdivision context from URL
  const subdivisionMatch = pathname.match(/^\/subdivisions\/([^/]+)/);
  const currentSubdivisionId = subdivisionMatch?.[1] ?? null;
  const isInSubdivision = currentSubdivisionId !== null && currentSubdivisionId !== "new";

  // Find current subdivision name
  const currentSubdivision = subdivisions.find((s) => s.id === currentSubdivisionId);

  // Pick nav items based on context
  const navGroups = isInSubdivision && currentSubdivisionId
    ? getSubdivisionNavGroups(currentSubdivisionId)
    : mainNavGroups;

  // Smart subdivision switching — preserve current sub-page
  function switchSubdivision(newId: string | null) {
    if (newId === null) {
      router.push("/dashboard");
      return;
    }
    if (currentSubdivisionId) {
      const subPage = pathname.replace(`/subdivisions/${currentSubdivisionId}`, "");
      router.push(`/subdivisions/${newId}${subPage || "/dashboard"}`);
    } else {
      router.push(`/subdivisions/${newId}/dashboard`);
    }
  }

  return (
    <Sidebar collapsible="icon">
      {/* Subdivision switcher — bordered, no icon, dark dropdown */}
      <SidebarHeader className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SimpleDropdown
              matchWidth
              variant="dark"
              trigger={
                <SidebarMenuButton
                  size="lg"
                  className="border border-sidebar-border rounded-md"
                >
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {isInSubdivision
                        ? (currentSubdivision?.name ?? "Subdivision")
                        : "Main dashboard"}
                    </span>
                    <span className="truncate text-xs text-sidebar-foreground/50">
                      {isInSubdivision
                        ? (currentSubdivision?.plan_number ?? "")
                        : `${subdivisions.length} subdivision${subdivisions.length !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              }
            >
              <DropdownLabel variant="dark">Dashboards</DropdownLabel>
              <DropdownSeparator variant="dark" />

              <DropdownItem variant="dark" onClick={() => switchSubdivision(null)}>
                <span className="flex-1">Main dashboard</span>
                {!isInSubdivision && <Check className="ml-2 h-4 w-4 text-primary" />}
              </DropdownItem>

              {subdivisions.length > 0 && <DropdownSeparator variant="dark" />}

              {subdivisions.map((sub) => (
                <DropdownItem
                  key={sub.id}
                  variant="dark"
                  onClick={() => switchSubdivision(sub.id)}
                >
                  <span className="flex-1 truncate">{sub.name}</span>
                  {sub.id === currentSubdivisionId && (
                    <Check className="ml-2 h-4 w-4 text-primary" />
                  )}
                </DropdownItem>
              ))}

              <DropdownSeparator variant="dark" />
              <DropdownItem variant="dark" onClick={() => router.push("/subdivisions/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Create subdivision
              </DropdownItem>
            </SimpleDropdown>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton isActive={isActive} render={<Link href={item.href} />}>
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Footer — User profile */}
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SimpleDropdown
              side="top"
              matchWidth
              trigger={
                <SidebarMenuButton size="lg">
                  {!loaded ? (
                    <>
                      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3 w-32 mt-1" />
                      </div>
                    </>
                  ) : (
                    <>
                      <UserAvatar
                        src={profile?.userAvatarUrl}
                        initials={profile?.userInitials ?? "?"}
                      />
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">
                          {profile?.companyName ?? "My Company"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {profile?.userEmail ?? ""}
                        </span>
                      </div>
                      <ChevronsUpDown className="ml-auto size-4" />
                    </>
                  )}
                </SidebarMenuButton>
              }
            >
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <UserAvatar
                  src={profile?.userAvatarUrl}
                  initials={profile?.userInitials ?? "?"}
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium text-foreground">
                    {profile?.companyName ?? "My Company"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {profile?.userEmail ?? ""}
                  </span>
                </div>
              </div>
              <DropdownSeparator />
              <DropdownItem onClick={() => router.push("/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem onClick={() => signOut({ redirectUrl: "/" })}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownItem>
            </SimpleDropdown>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
