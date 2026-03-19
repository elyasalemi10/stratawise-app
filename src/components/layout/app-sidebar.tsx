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
  PanelLeft,
  Receipt,
  Users,
  FileText,
  Wallet,
  Wrench,
  CalendarCheck,
  Plus,
  Check,
  Home,
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
  SidebarSeparator,
  useSidebar,
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
  {
    label: "Account",
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
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
    {
      label: "Account",
      items: [
        { href: `${base}/settings`, label: "Settings", icon: Settings },
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
  align = "start",
  side = "bottom",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  side?: "bottom" | "top";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const positionClass = side === "top"
    ? "bottom-full mb-1"
    : "top-full mt-1";

  const alignClass = align === "end" ? "right-0" : "left-0";

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          className={`absolute ${positionClass} ${alignClass} z-50 min-w-56 rounded-lg border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-100`}
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
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${className}`}
    >
      {children}
    </button>
  );
}

function DropdownLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-2 py-1 text-xs font-medium text-muted-foreground ${className}`}>
      {children}
    </div>
  );
}

function DropdownSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" />;
}

// ─── Sidebar toggle ─────────────────────────────────────────────

function SidebarToggle() {
  const { toggleSidebar } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={toggleSidebar}>
        <PanelLeft />
        <span>Collapse</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
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
      {/* Subdivision switcher */}
      <SidebarHeader className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SimpleDropdown
              trigger={
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    {isInSubdivision ? (
                      <Building2 className="size-4" />
                    ) : (
                      <Home className="size-4" />
                    )}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {isInSubdivision
                        ? (currentSubdivision?.name ?? "Subdivision")
                        : "All subdivisions"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {isInSubdivision
                        ? (currentSubdivision?.plan_number ?? "")
                        : `${subdivisions.length} subdivision${subdivisions.length !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              }
            >
              <DropdownLabel>Switch view</DropdownLabel>
              <DropdownSeparator />

              <DropdownItem onClick={() => switchSubdivision(null)}>
                <Home className="mr-2 h-4 w-4" />
                <span className="flex-1">All subdivisions</span>
                {!isInSubdivision && <Check className="ml-2 h-4 w-4 text-primary" />}
              </DropdownItem>

              {subdivisions.length > 0 && <DropdownSeparator />}

              {subdivisions.map((sub) => (
                <DropdownItem
                  key={sub.id}
                  onClick={() => switchSubdivision(sub.id)}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  <span className="flex-1 truncate">{sub.name}</span>
                  {sub.id === currentSubdivisionId && (
                    <Check className="ml-2 h-4 w-4 text-primary" />
                  )}
                </DropdownItem>
              ))}

              <DropdownSeparator />
              <DropdownItem onClick={() => router.push("/subdivisions/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Create subdivision
              </DropdownItem>
            </SimpleDropdown>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

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

        {/* Collapse toggle */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarToggle />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — User profile */}
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SimpleDropdown
              side="top"
              align="start"
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
              <DropdownLabel className="p-0 pb-1">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
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
              </DropdownLabel>
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
