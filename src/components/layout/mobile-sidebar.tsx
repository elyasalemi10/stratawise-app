"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "./sidebar-nav";

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const { user } = useUser();

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
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Sidebar panel */}
          <div className="fixed inset-y-0 left-0 z-50 w-64 bg-[hsl(220,26%,14%)] border-r border-white/10 flex flex-col">
            {/* Logo */}
            <div className="flex h-14 items-center px-5 border-b border-white/10">
              <span className="text-lg font-semibold text-white">MSM</span>
            </div>

            {/* Subdivision switcher placeholder */}
            <div className="mx-3 mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-xs text-[hsl(215,20%,75%)]/50 uppercase tracking-wide">Subdivision</p>
              <p className="text-sm text-[hsl(215,20%,75%)] truncate mt-0.5">No subdivision selected</p>
            </div>

            {/* Navigation */}
            <div onClick={() => setOpen(false)}>
              <SidebarNav />
            </div>

            {/* User section */}
            <div className="border-t border-white/10 p-4 mt-auto">
              <div className="flex items-center gap-3">
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "h-8 w-8",
                    },
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {user?.fullName ?? "Loading..."}
                  </p>
                  <p className="text-xs text-[hsl(215,20%,75%)] truncate">
                    {user?.primaryEmailAddress?.emailAddress ?? ""}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
