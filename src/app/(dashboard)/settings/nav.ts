import { Bell, BookOpen, Building2, Mail, Repeat, User, Users, type LucideIcon } from "lucide-react";

// The settings rail, in one place, so the layout and every skeleton agree.
//
// Three groups because these are three different things. Account follows the
// PERSON between firms; Workspace belongs to the firm and changes when they
// switch; Financials is the firm's money setup, which is configuration rather
// than day-to-day work and so does not belong in the working nav. A flat
// list, or a horizontal strip, flattens those distinctions.

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
    ],
  },
  {
    label: "Financials",
    items: [
      { href: "/settings/chart-of-accounts", label: "Chart of accounts", icon: BookOpen, managerOnly: true },
      { href: "/settings/followup", label: "Levy follow-up", icon: Repeat, managerOnly: true },
    ],
  },
];
