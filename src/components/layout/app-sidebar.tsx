"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Building2,
  MessageSquare,
  Send,
  Settings,
  LogOut,
  ChevronsUpDown,
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
  const router = useRouter();
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
    <Sidebar collapsible="icon">
      {/* Subdivision switcher */}
      <SidebarHeader className="p-2">
        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted transition-colors cursor-pointer">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate text-foreground group-data-[collapsible=icon]:hidden">
                No subdivision selected
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom" className="w-56">
            <DropdownMenuLabel>Subdivisions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              No subdivisions yet
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
              <DropdownMenuTrigger>
                <SidebarMenuButton size="lg" className="w-full">
                  {!loaded ? (
                    <>
                      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                      <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
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
                      <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                        <span className="truncate font-medium">
                          {profile?.companyName ?? "My Company"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {profile?.userEmail ?? ""}
                        </span>
                      </div>
                      <ChevronsUpDown className="ml-auto h-4 w-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                    </>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="end"
                className="w-56 rounded-lg"
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
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
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/settings")}>
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
