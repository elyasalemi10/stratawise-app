"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Settings, LogOut, ChevronUp } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { SidebarProfile } from "@/lib/actions/profile";

interface UserMenuProps {
  profile: SidebarProfile | null;
  loaded: boolean;
}

export function UserMenu({ profile, loaded }: UserMenuProps) {
  const { signOut } = useClerk();
  const router = useRouter();

  if (!loaded) {
    return (
      <div className="flex items-center gap-3 p-4 border-t border-white/10">
        <Skeleton className="h-8 w-8 rounded-full bg-white/10" />
        <div className="flex-1 min-w-0">
          <Skeleton className="h-3.5 w-24 bg-white/10" />
          <Skeleton className="h-3 w-32 bg-white/10 mt-1.5" />
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-white/10 p-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors outline-none"
        >
          <UserAvatar
            src={profile?.userAvatarUrl}
            initials={profile?.userInitials ?? "?"}
          />
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-white truncate">
              {profile?.companyName ?? "My Company"}
            </p>
            <p className="text-xs text-[hsl(215,20%,75%)] truncate">
              {profile?.userEmail ?? ""}
            </p>
          </div>
          <ChevronUp className="h-4 w-4 text-[hsl(215,20%,75%)] shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className="w-56 mb-1"
        >
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
    </div>
  );
}
