"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";
import { getSidebarProfile, type SidebarProfile } from "@/lib/actions/profile";

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<SidebarProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSidebarProfile().then((data) => {
      setProfile(data);
      setLoaded(true);
    });
  }, []);

  return (
    <div className="lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="text-muted-foreground"
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Open menu</span>
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div className="fixed inset-y-0 left-0 z-50 w-64 bg-[hsl(220,26%,14%)] border-r border-white/10 flex flex-col">
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

            <div className="mx-3 mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-xs text-[hsl(215,20%,75%)]/50 uppercase tracking-wide">Subdivision</p>
              <p className="text-sm text-[hsl(215,20%,75%)] truncate mt-0.5">No subdivision selected</p>
            </div>

            <div onClick={() => setOpen(false)}>
              <SidebarNav />
            </div>

            <div className="mt-auto">
              <UserMenu profile={profile} loaded={loaded} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
