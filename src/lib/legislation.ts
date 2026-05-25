// Per-state legislation defaults. Reads from the legislation_rules table so
// expanding to NSW / QLD is a row insert, not a code change. Calls cache the
// result in-process for the request lifetime.

import { createServerClient } from "@/lib/supabase";

export interface LegislationRules {
  state: string;
  levy_due_default_days: number;
  levies_postal_buffer_default_days: number;
  meeting_notice_days: number;
  overdue_grace_days: number;
}

const FALLBACK: LegislationRules = {
  state: "VIC",
  levy_due_default_days: 28,
  levies_postal_buffer_default_days: 14,
  meeting_notice_days: 14,
  overdue_grace_days: 14,
};

const cache = new Map<string, LegislationRules>();

export async function getLegislationRules(state: string | null | undefined): Promise<LegislationRules> {
  const key = (state ?? "VIC").toUpperCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const supabase = createServerClient();
  const { data } = await supabase
    .from("legislation_rules")
    .select("state, levy_due_default_days, levies_postal_buffer_default_days, meeting_notice_days, overdue_grace_days")
    .eq("state", key)
    .maybeSingle();

  const rules = (data as LegislationRules | null) ?? { ...FALLBACK, state: key };
  cache.set(key, rules);
  return rules;
}
