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
  MoreVertical,
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
  ClipboardList,
  Landmark,
  GitMerge,
  AlertTriangle,
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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getSidebarProfile, type SidebarProfile } from "@/lib/actions/profile";
import {
  getSidebarSubdivisions,
  type SidebarSubdivision,
} from "@/lib/actions/subdivision";
import {
  setCachedProfile,
  setCachedSubdivisions,
  SIDEBAR_REFRESH_EVENT,
} from "@/lib/sidebar-cache";

// ─── Nav definitions ────────────────────────────────────────────

const managerMainNavGroups = [
  {
    label: "",
    items: [
      { href: "/inbox", label: "Inbox", icon: Inbox },
    ],
  },
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

const lotOwnerMainNavGroups = [
  {
    label: "",
    items: [
      { href: "/inbox", label: "Inbox", icon: Inbox },
    ],
  },
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/levies", label: "Levies", icon: Wallet },
      { href: "/meetings", label: "Meetings", icon: CalendarCheck },
    ],
  },
];

function getSubdivisionNavGroups(subdivisionCode: string, isLotOwner: boolean) {
  const base = `/subdivisions/${subdivisionCode}`;

  if (isLotOwner) {
    return [
      {
        label: "Overview",
        items: [
          { href: base, label: "Dashboard", icon: LayoutDashboard },
          { href: `${base}/my-levies`, label: "My levies", icon: Receipt },
          { href: `${base}/my-payments`, label: "My payments", icon: Wallet },
          { href: `${base}/my-arrears`, label: "My arrears", icon: AlertTriangle },
        ],
      },
      {
        label: "Subdivision",
        items: [
          { href: `${base}/lots`, label: "Lot owners", icon: Users },
          { href: `${base}/meetings`, label: "Meetings", icon: CalendarCheck },
          { href: `${base}/documents`, label: "Documents", icon: FileText },
          { href: `${base}/insurance`, label: "Insurance", icon: Shield },
          { href: `${base}/reports`, label: "Reports", icon: ClipboardList },
        ],
      },
    ];
  }

  return [
    {
      label: "Overview",
      items: [
        { href: base, label: "Dashboard", icon: LayoutDashboard },
      ],
    },
    {
      label: "Management",
      items: [
        { href: `${base}/lots`, label: "Lots & owners", icon: Users },
        { href: `${base}/meetings`, label: "Meetings", icon: CalendarCheck },
        { href: `${base}/documents`, label: "Documents", icon: FileText },
        { href: `${base}/reports`, label: "Reports", icon: ClipboardList },
      ],
    },
    {
      label: "Finance",
      items: [
        { href: `${base}/budgets`, label: "Budgets", icon: Wallet },
        { href: `${base}/levies`, label: "Levies", icon: Receipt },
        { href: `${base}/generate`, label: "Generate levies", icon: Plus },
        { href: `${base}/insurance`, label: "Insurance", icon: Shield },
        { href: `${base}/bank-account`, label: "Bank account", icon: Landmark },
        { href: `${base}/reconciliation`, label: "Reconciliation", icon: GitMerge, badgeKey: "unmatched_count" as const },
        { href: `${base}/reconciliation/mappings`, label: "Payer mappings", icon: Users },
        { href: `${base}/reconciliation/claims`, label: "Payment claims", icon: Receipt },
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
      <div onClick={() => setOpen((o) => !o)} className="cursor-pointer">{trigger}</div>
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

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  initialProfile: SidebarProfile | null;
  initialSubdivisions: SidebarSubdivision[];
}

export function AppSidebar({
  initialProfile,
  initialSubdivisions,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { signOut } = useClerk();
  // Seeded from the server layout so the initial render has no skeleton.
  // The localStorage cache is kept in sync for the dropdown switch (which
  // sometimes runs faster than a server roundtrip for repeat nav across
  // tabs) and as a fallback for the refresh-event handler.
  const [profile, setProfile] = useState<SidebarProfile | null>(initialProfile);
  const [subdivisions, setSubdivisions] = useState<SidebarSubdivision[]>(initialSubdivisions);
  const loaded = true;

  // Refresh listener — fires after mutations (revalidateSidebarFromClient).
  // We don't fetch on mount any more (server hands us fresh data), but we
  // do refetch on this event so badge counts update in-session without a
  // full nav.
  useEffect(() => {
    if (initialProfile) setCachedProfile(initialProfile);
    setCachedSubdivisions(initialSubdivisions);

    function onRefresh() {
      Promise.all([getSidebarProfile(), getSidebarSubdivisions()])
        .then(([p, s]) => {
          setProfile(p);
          setSubdivisions(s);
          if (p) setCachedProfile(p);
          setCachedSubdivisions(s);
        })
        .catch(() => {});
    }
    window.addEventListener(SIDEBAR_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(SIDEBAR_REFRESH_EVENT, onRefresh);
  }, [initialProfile, initialSubdivisions]);

  // Detect subdivision context from URL. The URL segment is the 8-char
  // short_code (post-rename); the variable suffix "Code" makes the shape
  // obvious to future readers.
  const subdivisionMatch = pathname.match(/^\/subdivisions\/([^/]+)/);
  const currentSubdivisionCode = subdivisionMatch?.[1] ?? null;
  const isInSubdivision = currentSubdivisionCode !== null && currentSubdivisionCode !== "new";

  // Find current subdivision via its code
  const currentSubdivision = subdivisions.find((s) => s.short_code === currentSubdivisionCode);

  // Pick nav items based on context and role
  const isLotOwner = profile?.userRole === "lot_owner";
  const mainNavGroups = isLotOwner ? lotOwnerMainNavGroups : managerMainNavGroups;
  const navGroups = isInSubdivision && currentSubdivisionCode
    ? getSubdivisionNavGroups(currentSubdivisionCode, isLotOwner)
    : mainNavGroups;

  // Smart subdivision switching — preserve current sub-page
  function switchSubdivision(newCode: string | null) {
    if (newCode === null) {
      router.push("/dashboard");
      return;
    }
    // The subdivision index page IS the dashboard now — no /dashboard segment.
    if (currentSubdivisionCode) {
      const subPage = pathname.replace(`/subdivisions/${currentSubdivisionCode}`, "");
      router.push(`/subdivisions/${newCode}${subPage}`);
    } else {
      router.push(`/subdivisions/${newCode}`);
    }
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
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
                  onClick={() => switchSubdivision(sub.short_code)}
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
                  {sub.short_code === currentSubdivisionCode && (
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
        ) : navGroups.map((group) => {
          // PP4-D: longest-prefix-wins for active highlight, so a child route
          // (e.g. /reconciliation/mappings) doesn't also light up its parent
          // (/reconciliation). Prefix-only items still match deeper routes
          // when they're the longest sibling that does.
          const longestMatchHref = (() => {
            let best = "";
            for (const it of group.items) {
              const [p, q] = it.href.split("?");
              if (q) continue; // tab-based items handled below
              if (
                (pathname === it.href ||
                  pathname.startsWith(it.href + "/")) &&
                p.length > best.length
              ) {
                best = it.href;
              }
            }
            return best;
          })();
          return (
          <SidebarGroup key={group.label || "_top"}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
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
                    isActive = item.href === longestMatchHref;
                  }
                  const badgeKey = "badgeKey" in item ? item.badgeKey : undefined;
                  const count =
                    badgeKey === "unmatched_count"
                      ? currentSubdivision?.unmatched_count ?? 0
                      : 0;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton isActive={isActive} render={<Link href={item.href} />}>
                        <item.icon />
                        <span>{item.label}</span>
                        {count > 0 && (
                          <span
                            className="ml-auto inline-flex items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold leading-none text-muted-foreground h-4 min-w-[1rem]"
                            aria-label={`${count} unmatched`}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          );
        })}
      </SidebarContent>

      {/* Footer — User profile */}
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SimpleDropdown
              side="top"
              matchWidth
              trigger={
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  {!loaded ? (
                    <>
                      <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3 w-32 mt-1" />
                      </div>
                    </>
                  ) : (
                    <>
                      <Avatar className="h-8 w-8 rounded-lg grayscale">
                        {profile?.userAvatarUrl ? (
                          <AvatarImage src={profile.userAvatarUrl} alt="Avatar" />
                        ) : null}
                        <AvatarFallback className="rounded-lg">
                          {profile?.userInitials ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">
                          {profile?.companyName ?? "My Company"}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          {profile?.userEmail ?? ""}
                        </span>
                      </div>
                      <MoreVertical className="ml-auto size-4" />
                    </>
                  )}
                </SidebarMenuButton>
              }
            >
              <div className="flex items-center gap-2 px-1 py-1.5 text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  {profile?.userAvatarUrl ? (
                    <AvatarImage src={profile.userAvatarUrl} alt="Avatar" />
                  ) : null}
                  <AvatarFallback className="rounded-lg">
                    {profile?.userInitials ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium text-foreground">
                    {profile?.companyName ?? "My Company"}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
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
