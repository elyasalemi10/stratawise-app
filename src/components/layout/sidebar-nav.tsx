"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  MessageSquare,
  Send,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 overflow-y-auto py-2">
      {navGroups.map((group) => (
        <div key={group.label} className="pt-6 first:pt-3">
          <p className="px-5 pb-2 text-xs font-medium uppercase tracking-wider text-[hsl(215,20%,75%)]/50">
            {group.label}
          </p>
          {group.items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-9 items-center gap-3 px-5 text-sm transition-colors duration-150",
                  isActive
                    ? "border-l-2 border-primary bg-[hsl(220,26%,20%)] text-primary"
                    : "border-l-2 border-transparent text-[hsl(215,20%,75%)] hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
