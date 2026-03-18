"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Building2,
  MessageSquare,
  Send,
  Settings,
  LogOut,
  ChevronsUpDown,
  Check,
  PanelLeft,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getSidebarProfile, type SidebarProfile } from "@/lib/actions/profile";

const navGroups = [
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
    label: "Communication",
    items: [
      { href: "/messages", label: "Messages", icon: MessageSquare },
      { href: "/communications", label: "Communications", icon: Send },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

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

export function AppSidebar() {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const [profile, setProfile] = useState<SidebarProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSidebarProfile().then((data) => {
      setProfile(data);
      setLoaded(true);
    });
  }, []);

  return (
    <Sidebar>
      {/* Subdivision switcher */}
      <SidebarHeader className="px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/20">
                <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-left hover:bg-muted transition-colors">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 text-sm truncate text-foreground">
                    No subdivision selected
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Subdivisions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <span className="text-muted-foreground">No subdivisions yet</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

        {/* Collapse toggle inside sidebar */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarToggle />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — User profile card */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/20">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left">
                  {!loaded ? (
                    <>
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 min-w-0">
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
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium text-foreground truncate">
                          {profile?.companyName ?? "My Company"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {profile?.userEmail ?? ""}
                        </p>
                      </div>
                      <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    </>
                  )}
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{profile?.companyName ?? "My Company"}</span>
                    <span className="text-xs text-muted-foreground">{profile?.userEmail ?? ""}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.location.href = "/settings"}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/" })}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
