"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  CalendarCheck,
  Plus,
  Search,
  Shield,
  ClipboardList,
  Landmark,
  GitMerge,
  AlertTriangle,
  Pin,
  PieChart,
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getSidebarProfile, type SidebarProfile } from "@/lib/actions/profile";
import {
  getSidebarOCs,
  type SidebarOC,
} from "@/lib/actions/oc";
import {
  setCachedProfile,
  setCachedOCs,
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
      { href: "/ocs", label: "OCs", icon: Building2 },
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

function getOCNavGroups(ocCode: string, isLotOwner: boolean) {
  const base = `/ocs/${ocCode}`;

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
        label: "OC",
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
    // Finance split into three focused groups — Levies (what the lot owners
    // see / get billed), Banking (cash flow + reconciliation), Insurance
    // (separate because it's a different vendor lifecycle). Order matches
    // how managers move through a typical month: bill, reconcile, manage
    // cover.
    {
      label: "Levies",
      items: [
        { href: `${base}/levies`, label: "Levies", icon: Receipt },
        { href: `${base}/generate`, label: "Generate levies", icon: Plus },
        { href: `${base}/reconciliation/claims`, label: "Payment claims", icon: Receipt },
        { href: `${base}/budgets`, label: "Budgets", icon: PieChart },
      ],
    },
    {
      label: "Banking",
      items: [
        { href: `${base}/reconciliation`, label: "Reconciliation", icon: GitMerge, badgeKey: "unmatched_count" as const },
        { href: `${base}/bank-account`, label: "Bank account", icon: Landmark },
        { href: `${base}/reconciliation/mappings`, label: "Payer mappings", icon: Users },
      ],
    },
    {
      label: "Insurance",
      items: [
        { href: `${base}/insurance`, label: "Insurance", icon: Shield },
      ],
    },
    {
      label: "Settings",
      items: [
        { href: `${base}/settings`, label: "OC settings", icon: Settings },
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
  closeOnClick = true,
  onClose,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  side?: "bottom" | "top" | "right";
  matchWidth?: boolean;
  /** Auto-close when the user clicks anywhere inside the panel. Defaults
   *  true (the existing dropdown behaviour). The OC switcher passes false
   *  because clicks inside the search input and pin-star shouldn't dismiss. */
  closeOnClick?: boolean;
  /** Fires whenever the panel transitions to closed (click-outside, escape,
   *  or selecting an item with closeOnClick=true). Lets callers reset
   *  ephemeral state like a search query so the next open starts clean. */
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  function closePanel() {
    setOpen(false);
    onCloseRef.current?.();
  }

  // Click-outside dismiss. Considers BOTH the trigger wrapper and the
  // portaled panel — without that, clicking inside the portaled panel would
  // count as "outside" because it's not a descendant of wrapperRef.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      closePanel();
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Position the panel relative to the trigger via fixed coordinates. The
  // panel renders into a portal so it escapes the sidebar's overflow-hidden
  // clip; positioning by getBoundingClientRect keeps it pinned to the
  // trigger across scroll / resize.
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    function recompute() {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (side === "right") {
        setPanelStyle({ position: "fixed", left: rect.right + 8, top: rect.top });
      } else if (side === "top") {
        setPanelStyle({ position: "fixed", left: rect.left, top: rect.top - 8, transform: "translateY(-100%)" });
      } else {
        setPanelStyle({
          position: "fixed",
          left: rect.left,
          top: rect.bottom + 4,
          width: matchWidth ? rect.width : undefined,
        });
      }
    }
    recompute();
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open, side, matchWidth]);

  return (
    <div ref={wrapperRef} className="relative">
      <div onClick={() => (open ? closePanel() : setOpen(true))} className="cursor-pointer">{trigger}</div>
      {open && typeof window !== "undefined" && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          // z-[100] beats the sidebar (z-20) and any popover (z-50) so the
          // panel always sits on top regardless of which surface launched
          // it. animate-in keeps the open feel snappy.
          className={`z-[100] rounded-lg border border-border bg-popover shadow-md animate-in fade-in-0 zoom-in-95 duration-100 ${matchWidth ? "" : "min-w-56"}`}
          onClick={closeOnClick ? () => closePanel() : undefined}
          onMouseDown={closeOnClick ? undefined : (e) => e.stopPropagation()}
        >
          {children}
        </div>,
        document.body,
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

// One row in the OC switcher panel. Splits the click target into two regions
// — the wide left/middle (switches to that OC) and a right-edge pin star
// (toggles the pin without dismissing the panel). Pin click stops propagation
// so it doesn't also fire the row's onSwitch.
function OCSwitcherRow({
  sub,
  isCurrent,
  isLotOwner,
  isPinned,
  onSwitch,
  onTogglePin,
}: {
  sub: SidebarOC;
  isCurrent: boolean;
  isLotOwner: boolean;
  isPinned: boolean;
  onSwitch: () => void;
  onTogglePin: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md hover:bg-accent",
        // The current row is greyed (no Check icon) so the user feels "this
        // is where I am" without an explicit affordance. Slight bg tint +
        // dimmed text. Hover still works so it's not visually inert.
        isCurrent && "bg-muted/60 text-muted-foreground",
      )}
    >
      <button
        type="button"
        onClick={onSwitch}
        className="flex flex-1 cursor-pointer items-center gap-3 rounded-md px-3 py-3 text-left text-sm"
      >
        {sub.thumbnail_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={sub.thumbnail_url}
            alt=""
            className="size-9 rounded-md border border-border object-cover shrink-0"
          />
        ) : (
          <div className="flex size-9 items-center justify-center rounded-md border border-border shrink-0">
            <Building2 className="size-4 shrink-0" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <span className="block truncate font-medium">{sub.name}</span>
          {isLotOwner && sub.lots && sub.lots.length > 0 ? (
            <span className="block text-xs text-muted-foreground truncate">
              {sub.lots.map((l) => `Lot ${l.lot_number}${l.unit_number ? ` Unit ${l.unit_number}` : ""}`).join(", ")}
            </span>
          ) : (
            sub.plan_number && (
              <span className="block text-xs text-muted-foreground truncate">{sub.plan_number}</span>
            )
          )}
        </div>
      </button>
      <button
        type="button"
        aria-label={isPinned ? "Unpin OC" : "Pin OC"}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        // Pin icon is hidden until row hover, regardless of pinned state.
        // Pinned rows show a filled brand-gold pin; unpinned show outline.
        // The hover-only reveal keeps the panel visually quiet — the user
        // only sees a pin affordance when hovering a row they might act on.
        className={cn(
          "mr-1.5 inline-flex size-8 cursor-pointer items-center justify-center rounded-md opacity-0 group-hover:opacity-100",
          isPinned
            ? "text-[color:var(--brand-gold)]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Pin className={cn("size-4", isPinned && "fill-current")} />
      </button>
    </div>
  );
}

// ─── Pinned OCs (localStorage) ─────────────────────────────────
//
// Managers asked for a way to pin frequently-accessed OCs to the top of the
// swapper. Pins live in localStorage scoped by management company so two
// users sharing a browser don't trample each other's pin state. The state is
// just a list of short_codes ordered by pin-time-asc (oldest pin first).

const OC_PINS_KEY_PREFIX = "stratawise:oc-pins:";
function ocPinsKey(scope: string | null | undefined): string {
  return `${OC_PINS_KEY_PREFIX}${scope ?? "anon"}`;
}
function usePinnedOCs(scope: string | null | undefined): {
  pins: string[];
  togglePin: (shortCode: string) => void;
  isPinned: (shortCode: string) => boolean;
} {
  const [pins, setPins] = useState<string[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(ocPinsKey(scope));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setPins(parsed.filter((s) => typeof s === "string"));
      }
    } catch {
      /* corrupted storage — silently reset */
    }
  }, [scope]);
  function persist(next: string[]) {
    setPins(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(ocPinsKey(scope), JSON.stringify(next));
      } catch {
        /* quota / private mode — just hold the pins in memory */
      }
    }
  }
  function togglePin(shortCode: string) {
    if (!shortCode) return;
    persist(pins.includes(shortCode)
      ? pins.filter((p) => p !== shortCode)
      : [...pins, shortCode]);
  }
  function isPinned(shortCode: string) {
    return pins.includes(shortCode);
  }
  return { pins, togglePin, isPinned };
}

// ─── NavUser (profile card + popup) ────────────────────────────
// Matches the v0/shadcn dashboard NavUser pattern: the trigger row in the
// sidebar footer opens a DropdownMenu that pops to the right on desktop
// (bottom on mobile). The dropdown header repeats the avatar + name + email
// for context, then menu items below.

// Hand-rolled dropdown (avoids base-ui Menu which threw error #31 when
// composed inside Sidebar context). Pops up on top with a small offset.
function NavUser({
  loaded,
  profile,
  onSettings,
  onSignOut,
}: {
  loaded: boolean;
  profile: SidebarProfile | null;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function escHandler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, []);

  // Detect mobile via media query so we can pop downwards on small screens.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex h-14 w-full items-center gap-2 overflow-hidden rounded-lg border p-2 text-left text-sm text-sidebar-foreground transition-colors outline-none",
          // Thin grey outline — visible on the midnight sidebar bg.
          "border-sidebar-foreground/20 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          open && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
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
            <Avatar className="h-8 w-8 rounded-lg grayscale shrink-0">
              {profile?.userAvatarUrl ? (
                <AvatarImage src={profile.userAvatarUrl} alt="Avatar" />
              ) : null}
              <AvatarFallback className="rounded-lg">
                {profile?.userInitials ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
              <span className="truncate font-medium">
                {profile?.companyName ?? "My Company"}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {profile?.userEmail ?? ""}
              </span>
            </div>
            <MoreVertical className="ml-auto size-4 shrink-0" />
          </>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 w-56 rounded-lg border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-100",
            // Pops right on desktop, up on mobile — matches v0 template behaviour.
            isMobile
              ? "bottom-full left-0 right-0 mb-2"
              : "left-full bottom-0 ml-2",
          )}
        >
          {/* Header — avatar + company name + email, mirrors template */}
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-lg shrink-0">
              {profile?.userAvatarUrl ? (
                <AvatarImage src={profile.userAvatarUrl} alt="Avatar" />
              ) : null}
              <AvatarFallback className="rounded-lg">
                {profile?.userInitials ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
              <span className="truncate font-medium text-foreground">
                {profile?.companyName ?? "My Company"}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {profile?.userEmail ?? ""}
              </span>
            </div>
          </div>
          <div className="-mx-1 my-1 h-px bg-border" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
          <div className="-mx-1 my-1 h-px bg-border" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  initialProfile: SidebarProfile | null;
  initialOCs: SidebarOC[];
}

export function AppSidebar({
  initialProfile,
  initialOCs,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Seeded from the server layout so the initial render has no skeleton.
  // The localStorage cache is kept in sync for the dropdown switch (which
  // sometimes runs faster than a server roundtrip for repeat nav across
  // tabs) and as a fallback for the refresh-event handler.
  const [profile, setProfile] = useState<SidebarProfile | null>(initialProfile);
  const [ocs, setOCs] = useState<SidebarOC[]>(initialOCs);
  const loaded = true;
  // Pin state for the OC swapper. Scoped by userEmail so two users sharing
  // a browser don't trample each other's pins; falls back to "anon" before
  // the profile loads (will be re-keyed on next render).
  const { pins, togglePin, isPinned } = usePinnedOCs(profile?.userEmail ?? null);
  const [switcherQuery, setSwitcherQuery] = useState("");

  // Refresh listener — fires after mutations (revalidateSidebarFromClient).
  // We don't fetch on mount any more (server hands us fresh data), but we
  // do refetch on this event so badge counts update in-session without a
  // full nav.
  useEffect(() => {
    if (initialProfile) setCachedProfile(initialProfile);
    setCachedOCs(initialOCs);

    function onRefresh() {
      Promise.all([getSidebarProfile(), getSidebarOCs()])
        .then(([p, s]) => {
          setProfile(p);
          setOCs(s);
          if (p) setCachedProfile(p);
          setCachedOCs(s);
        })
        .catch(() => {});
    }
    window.addEventListener(SIDEBAR_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(SIDEBAR_REFRESH_EVENT, onRefresh);
  }, [initialProfile, initialOCs]);

  // Detect oc context from URL. The URL segment is the 8-char
  // short_code (post-rename); the variable suffix "Code" makes the shape
  // obvious to future readers.
  const ocMatch = pathname.match(/^\/ocs\/([^/]+)/);
  const currentOCCode = ocMatch?.[1] ?? null;
  const isInOC = currentOCCode !== null && currentOCCode !== "new";

  // Find current oc via its code
  const currentOC = ocs.find((s) => s.short_code === currentOCCode);

  // Pick nav items based on context and role
  const isLotOwner = profile?.userRole === "lot_owner";
  const mainNavGroups = isLotOwner ? lotOwnerMainNavGroups : managerMainNavGroups;
  const navGroups = isInOC && currentOCCode
    ? getOCNavGroups(currentOCCode, isLotOwner)
    : mainNavGroups;

  // Smart oc switching — preserve current sub-page
  function switchOC(newCode: string | null) {
    if (newCode === null) {
      router.push("/dashboard");
      return;
    }
    // The oc index page IS the dashboard now — no /dashboard segment.
    if (currentOCCode) {
      const subPage = pathname.replace(`/ocs/${currentOCCode}`, "");
      router.push(`/ocs/${newCode}${subPage}`);
    } else {
      router.push(`/ocs/${newCode}`);
    }
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      {/* Dashboard switcher — styled like shadcn TeamSwitcher */}
      <SidebarHeader className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SimpleDropdown
              side="right"
              closeOnClick={false}
              onClose={() => setSwitcherQuery("")}
              trigger={
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
                    <Building2 className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-base font-semibold">
                      {isInOC
                        ? (currentOC?.name ?? "OC")
                        : "Main dashboard"}
                    </span>
                    <span className="truncate text-xs text-sidebar-foreground/50">
                      {!loaded ? (
                        <Skeleton className="h-3 w-20 mt-0.5" />
                      ) : isInOC ? (
                        currentOC?.plan_number ?? ""
                      ) : (() => {
                        // Count only promoted (active) OCs on the header
                        // badge; draft entries are listed separately and
                        // shouldn't inflate the headline number.
                        const activeCount = ocs.filter((s) => s.kind !== "draft").length;
                        return `${activeCount} OC${activeCount !== 1 ? "s" : ""}`;
                      })()}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              }
            >
              {/* Switcher panel — opens to the RIGHT of the sidebar trigger
                  so it shows up in the main content area rather than below
                  the trigger row (which on a 256px sidebar gets squashed).
                  Structure: sticky top (Main dashboard + search) → scrolling
                  middle (OCs, pinned first) → sticky bottom (Create OC). */}
              {(() => {
                const activeOCs = ocs.filter((s) => s.kind !== "draft");
                const q = switcherQuery.trim().toLowerCase();
                const matchesQuery = (s: SidebarOC) =>
                  !q
                    || s.name.toLowerCase().includes(q)
                    || s.plan_number.toLowerCase().includes(q)
                    || s.address.toLowerCase().includes(q);
                const pinned = activeOCs.filter((s) => isPinned(s.short_code)).filter(matchesQuery);
                const unpinned = activeOCs.filter((s) => !isPinned(s.short_code)).filter(matchesQuery);
                return (
                  <div className="flex w-72 flex-col">
                    {/* Sticky header */}
                    <div className="border-b border-border bg-popover p-1">
                      <button
                        type="button"
                        onClick={() => switchOC(null)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent",
                          // Matches the OC row treatment — greyed when this
                          // is the user's current location, no check icon.
                          !isInOC ? "bg-muted/60 text-muted-foreground" : "text-foreground",
                        )}
                      >
                        <div className="flex size-9 items-center justify-center rounded-md border border-border">
                          <LayoutDashboard className="size-4 shrink-0" />
                        </div>
                        <span className="flex-1 text-left font-medium">Main dashboard</span>
                      </button>
                      <div className="relative mt-1">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={switcherQuery}
                          onChange={(e) => setSwitcherQuery(e.target.value)}
                          placeholder="Search OCs"
                          className="h-8 pl-7 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    {/* Scrollable middle. max-h is sized to ~6.5 rows so a
                        partial 7th row peeks at the bottom — that fractional
                        cut is intentional, it signals "scroll for more"
                        better than a clean edge. Row height ≈ 60px
                        (py-3 + size-9 image + two text lines). */}
                    <div className="max-h-[390px] overflow-y-auto p-1">
                      {pinned.length > 0 && (
                        <>
                          {pinned.map((sub) => (
                            <OCSwitcherRow
                              key={sub.id}
                              sub={sub}
                              isCurrent={sub.short_code === currentOCCode}
                              isLotOwner={isLotOwner}
                              isPinned
                              onSwitch={() => switchOC(sub.short_code)}
                              onTogglePin={() => togglePin(sub.short_code)}
                            />
                          ))}
                          {unpinned.length > 0 && (
                            <div className="my-1 h-px bg-border" />
                          )}
                        </>
                      )}
                      {unpinned.length === 0 && pinned.length === 0 ? (
                        <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                          {q ? "No OCs match." : "No OCs yet."}
                        </div>
                      ) : (
                        unpinned.map((sub) => (
                          <OCSwitcherRow
                            key={sub.id}
                            sub={sub}
                            isCurrent={sub.short_code === currentOCCode}
                            isLotOwner={isLotOwner}
                            isPinned={false}
                            onSwitch={() => switchOC(sub.short_code)}
                            onTogglePin={() => togglePin(sub.short_code)}
                          />
                        ))
                      )}
                    </div>
                    {/* Sticky footer */}
                    {!isLotOwner && (
                      <div className="border-t border-border bg-popover p-1">
                        <button
                          type="button"
                          onClick={() => router.push("/ocs/new")}
                          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent"
                        >
                          <div className="flex size-6 items-center justify-center rounded-md border border-border bg-transparent">
                            <Plus className="size-4" />
                          </div>
                          <span className="font-medium text-muted-foreground">Create OC</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* anchor for the unused `pins` array so linters don't drop it */}
              <span hidden>{pins.length}</span>
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
                      ? currentOC?.unmatched_count ?? 0
                      : 0;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        size="lg"
                        className="text-base [&>svg]:!size-5"
                        render={<Link href={item.href} />}
                      >
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
            <NavUser
              loaded={loaded}
              profile={profile}
              onSettings={() => router.push("/settings")}
              onSignOut={() => { window.location.href = "/logout"; }}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
