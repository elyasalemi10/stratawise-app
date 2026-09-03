import { Bell, Building2, Mail, Repeat, User, Users, type LucideIcon } from "lucide-react";

// The settings rail, in one place, so the layout and every skeleton agree.
//
// Two groups because these are two different things. Account follows the
// PERSON between firms; Workspace belongs to the firm and changes when they
// switch. A flat list, or a horizontal strip, flattens that distinction.

export interface SettingsNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  managerOnly?: boolean;
}

export const SETTINGS_NAV: Array<{ label: string; items: SettingsNavItem[] }> = [
  {
    label: "Account",
    items: [
      { href: "/settings/profile", label: "Profile", icon: User },
      { href: "/settings/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/settings/company", label: "Company", icon: Building2, managerOnly: true },
      { href: "/settings/team", label: "Team", icon: Users, managerOnly: true },
      { href: "/settings/email", label: "Email", icon: Mail, managerOnly: true },
      { href: "/settings/followup", label: "Levy follow-up", icon: Repeat, managerOnly: true },
    ],
  },
];
