"use client";

import { useEffect, useState } from "react";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";
import { getSidebarProfile, type SidebarProfile } from "@/lib/actions/profile";

export function Sidebar() {
  const [profile, setProfile] = useState<SidebarProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSidebarProfile().then((data) => {
      setProfile(data);
      setLoaded(true);
    });
  }, []);

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[hsl(220,26%,14%)] border-r border-white/10">
      {/* Logo */}
      <div className="flex h-14 items-center px-5 border-b border-white/10">
        {loaded && profile?.companyLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.companyLogoUrl}
            alt={profile.companyName ?? "Company logo"}
            className="h-8 max-w-[140px] object-contain"
          />
        ) : (
          <span className="text-lg font-semibold text-white">MSM</span>
        )}
      </div>

      {/* Subdivision switcher placeholder */}
      <div className="mx-3 mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-2">
        <p className="text-xs text-[hsl(215,20%,75%)]/50 uppercase tracking-wide">Subdivision</p>
        <p className="text-sm text-[hsl(215,20%,75%)] truncate mt-0.5">No subdivision selected</p>
      </div>

      {/* Navigation */}
      <SidebarNav />

      {/* User menu */}
      <UserMenu profile={profile} loaded={loaded} />
    </aside>
  );
}
