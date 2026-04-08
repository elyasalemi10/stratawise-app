"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Building2,
  Settings,
  LogOut,
  ChevronsUpDown,
  Receipt,
  Inbox,
  Users,
  FileText,
  Wallet,
  Wrench,
  CalendarCheck,
  Plus,
  Check,
  Shield,
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
import {
  getCachedProfile,
  setCachedProfile,
  getCachedSubdivisions,
  setCachedSubdivisions,
} from "@/lib/sidebar-cache";

// ─── Nav definitions ────────────────────────────────────────────

const managerMainNavGroups = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/subdivisions", label: "Subdivisions", icon: Building2 },
    ],
  },
];

const lotOwnerMainNavGroups = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/levies", label: "Levies", icon: Wallet },
      { href: "/meetings", label: "Meetings", icon: CalendarCheck },
    ],
  },
];

function getSubdivisionNavGroups(subdivisionId: string, isLotOwner: boolean) {
  const base = `/subdivisions/${subdivisionId}`;

  if (isLotOwner) {
    return [
      {
        label: "Overview",
        items: [
          { href: `${base}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
          { href: `${base}/my-levies`, label: "My levies", icon: Receipt },
        ],
      },
      {
        label: "Subdivision",
        items: [
          { href: `${base}/lots`, label: "Lot owners", icon: Users },
          { href: `${base}/meetings`, label: "Meetings", icon: CalendarCheck },
          { href: `${base}/documents`, label: "Documents", icon: FileText },
        ],
      },
    ];
  }

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
        { href: `${base}/lots`, label: "Lots & owners", icon: Users },
        { href: `${base}/meetings`, label: "Meetings", icon: CalendarCheck },
        { href: `${base}/documents`, label: "Documents", icon: FileText },
      ],
    },
    {
      label: "Finance",
      items: [
        { href: `${base}/finance/budgets`, label: "Budgets", icon: Wallet },
        { href: `${base}/finance/levies`, label: "Levies", icon: Receipt },
        { href: `${base}/finance/generate`, label: "Generate levies", icon: Plus },
        { href: `${base}/finance/insurance`, label: "Insurance", icon: Shield },
      ],
    },
    {
      label: "Settings",
      items: [
        { href: `${base}/settings`, label: "Subdivision settings", icon: Settings },
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
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  side?: "bottom" | "top";
  matchWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const positionClass = side === "top"
    ? "bottom-full mb-1"
    : "top-full mt-1";

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          className={`absolute ${positionClass} left-0 z-50 rounded-lg border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-100 ${matchWidth ? "w-full" : "min-w-56"}`}
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
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </button>
  );
}

function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

function DropdownSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" />;
}

// ─── Main component ─────────────────────────────────────────────

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { signOut } = useClerk();
  // Initialize as null to avoid hydration mismatch (localStorage only exists on client)
  const [profile, setProfile] = useState<SidebarProfile | null>(null);
  const [subdivisions, setSubdivisions] = useState<SidebarSubdivision[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Show cached data immediately while fetching fresh
    const cachedProfile = getCachedProfile();
    const cachedSubs = getCachedSubdivisions();
    if (cachedProfile) {
      setProfile(cachedProfile);
      setLoaded(true);
    }
    if (cachedSubs) {
      setSubdivisions(cachedSubs);
    }

    // Fetch fresh data in background
    Promise.all([getSidebarProfile(), getSidebarSubdivisions()])
      .then(([profileData, subdivisionData]) => {
        setProfile(profileData);
        setSubdivisions(subdivisionData);
        setLoaded(true);
        if (profileData) setCachedProfile(profileData);
        setCachedSubdivisions(subdivisionData);
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

  // Pick nav items based on context and role
  const isLotOwner = profile?.userRole === "lot_owner";
  const mainNavGroups = isLotOwner ? lotOwnerMainNavGroups : managerMainNavGroups;
  const navGroups = isInSubdivision && currentSubdivisionId
    ? getSubdivisionNavGroups(currentSubdivisionId, isLotOwner)
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
    <Sidebar collapsible="offcanvas">
      {/* Dashboard switcher — styled like shadcn TeamSwitcher */}
      <SidebarHeader className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SimpleDropdown
              matchWidth
              trigger={
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
                    <Building2 className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {isInSubdivision
                        ? (currentSubdivision?.name ?? "Subdivision")
                        : "Main dashboard"}
                    </span>
                    <span className="truncate text-xs text-sidebar-foreground/50">
                      {!loaded ? (
                        <Skeleton className="h-3 w-20 mt-0.5" />
                      ) : isInSubdivision ? (
                        currentSubdivision?.plan_number ?? ""
                      ) : (
                        `${subdivisions.length} subdivision${subdivisions.length !== 1 ? "s" : ""}`
                      )}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              }
            >
              <DropdownLabel>Dashboards</DropdownLabel>
              <DropdownSeparator />

              <DropdownItem onClick={() => switchSubdivision(null)}>
                <div className="flex size-6 items-center justify-center rounded-md border border-border">
                  <LayoutDashboard className="size-3.5 shrink-0" />
                </div>
                <span className="flex-1">{"Main dashboard"}</span>
                {!isInSubdivision && <Check className="ml-auto h-4 w-4 text-primary" />}
              </DropdownItem>

              {subdivisions.length > 0 && <DropdownSeparator />}

              {subdivisions.map((sub) => (
                <DropdownItem
                  key={sub.id}
                  onClick={() => switchSubdivision(sub.id)}
                >
                  <div className="flex size-6 items-center justify-center rounded-md border border-border shrink-0">
                    <Building2 className="size-3.5 shrink-0" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block truncate">{sub.name}</span>
                    {isLotOwner && sub.lots && sub.lots.length > 0 && (
                      <span className="block text-xs text-muted-foreground truncate">
                        {sub.lots.map((l) => `Lot ${l.lot_number}${l.unit_number ? ` Unit ${l.unit_number}` : ""}`).join(", ")}
                      </span>
                    )}
                  </div>
                  {sub.id === currentSubdivisionId && (
                    <Check className="ml-auto h-4 w-4 text-primary shrink-0" />
                  )}
                </DropdownItem>
              ))}

              {!isLotOwner && (
                <>
                  <DropdownSeparator />
                  <DropdownItem onClick={() => router.push("/subdivisions/new")}>
                    <div className="flex size-6 items-center justify-center rounded-md border border-border bg-transparent">
                      <Plus className="size-4" />
                    </div>
                    <span className="text-muted-foreground font-medium">Create subdivision</span>
                  </DropdownItem>
                </>
              )}
            </SimpleDropdown>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Navigation — show skeleton until role is known */}
      <SidebarContent>
        {!loaded ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {[1, 2, 3].map((i) => (
                  <SidebarMenuItem key={i}>
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-3.5 w-24" />
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  // Handle both path-only and path+query active detection
                  const [itemPath, itemQuery] = item.href.split("?");
                  let isActive = false;
                  if (itemQuery) {
                    // Tab-based: match path AND query param
                    const tab = new URLSearchParams(itemQuery).get("tab");
                    isActive = pathname === itemPath && searchParams.get("tab") === tab;
                  } else {
                    isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  }
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
                <Settings className="h-4 w-4" />
                Settings
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem onClick={() => signOut({ redirectUrl: "/" })}>
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownItem>
            </SimpleDropdown>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
