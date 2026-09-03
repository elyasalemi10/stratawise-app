import {
  Banknote, Building2, Mail, Repeat, Settings2, Wallet, type LucideIcon,
} from "lucide-react";

// The OC settings rail, in one place, so the layout, every section page and
// every skeleton agree on what exists and what it is called.
//
// These were tabs holding ?tab= in component state. A reload on
// ?tab=automation rendered General, because the first client render defaulted
// to it and only corrected once JS ran, and a link to a specific section was
// not a link at all. Sections are real routes now.

export type OCSettingsSection =
  | "general"
  | "financial"
  | "communications"
  | "banking"
  | "automation"
  | "management";

export interface OCSettingsNavItem {
  section: OCSettingsSection;
  label: string;
  icon: LucideIcon;
}

export const OC_SETTINGS_NAV: OCSettingsNavItem[] = [
  { section: "general", label: "General", icon: Settings2 },
  { section: "financial", label: "Financial", icon: Wallet },
  { section: "communications", label: "Communications", icon: Mail },
  { section: "banking", label: "Banking", icon: Banknote },
  { section: "automation", label: "Automation", icon: Repeat },
  { section: "management", label: "Management", icon: Building2 },
];

export const OC_SETTINGS_LABEL: Record<OCSettingsSection, string> =
  Object.fromEntries(OC_SETTINGS_NAV.map((i) => [i.section, i.label])) as Record<
    OCSettingsSection,
    string
  >;
