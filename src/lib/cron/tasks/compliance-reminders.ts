import { createServerClient } from "@/lib/supabase";
import { sendComplianceReminderEmail } from "@/lib/email";
import { isNotificationOptedOut, resolveCompanyLogo } from "@/lib/notifications";

import { formatDateLong } from "@/lib/format-date";
// Daily compliance sweep. Notifies managers (in-app + email, opt-out
// respected) about:
//   - OC insurance policies expiring within 30 days  (type insurance_expiring)
//   - contractor public-liability expiring within 30 days (insurance_expiring)
//   - OCs whose AGM deadline falls within a month (type agm_due_soon)
//   - OCs whose AGM deadline has passed           (type agm_due)
// De-duped: skips if the same notification (by link) was sent recently.

const INSURANCE_WINDOW_DAYS = 30;
const INSURANCE_DEDUPE_DAYS = 25;
// An owners corporation must hold its AGM within 15 months of the last one
// (Owners Corporations Act 2006 (Vic) s.68). Twelve months is the cadence;
// fifteen is the deadline, and the deadline is what a manager gets in
// trouble for missing , so that is what we count to.
const AGM_DEADLINE_MONTHS = 15;
// How far ahead to warn. A month is enough notice to book a venue, prepare
// the notice period and still send it: the statutory notice period alone is
// 14 days.
const AGM_WARN_DAYS = 30;
const AGM_DEDUPE_DAYS = 45;
const AGM_SOON_DEDUPE_DAYS = 21;

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp for short months: 31 Jan + 1 month is 28/29 Feb, not 3 March.
  const lastOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastOfMonth));
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function humanDate(iso: string): string {
  return formatDateLong(new Date(`${iso.slice(0, 10)}T00:00:00`));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recentlyNotified(supabase: any, profileId: string, type: string, link: string, days: number): Promise<boolean> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId).eq("type", type).eq("link", link).gte("created_at", since);
  return (count ?? 0) > 0;
}

// Sends an in-app + email reminder to one manager (opt-out respected, de-duped).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyManager(supabase: any, opts: {
  profileId: string; type: string; ocId: string | null; title: string; body: string;
  link: string; ctaShortCode: string | null; ctaPath: string | null; ctaLabel: string; dedupeDays: number;
}): Promise<boolean> {
  if (await recentlyNotified(supabase, opts.profileId, opts.type, opts.link, opts.dedupeDays)) return false;

  const { data: prof } = await supabase.from("profiles").select("email, first_name, management_company_id").eq("id", opts.profileId).maybeSingle();
  const email = prof?.email as string | undefined;

  if (!(await isNotificationOptedOut(supabase, opts.profileId, opts.type, "in_app"))) {
    await supabase.from("notifications").insert({ profile_id: opts.profileId, oc_id: opts.ocId, type: opts.type, title: opts.title, body: opts.body, link: opts.link });
  }
  if (email && !(await isNotificationOptedOut(supabase, opts.profileId, opts.type, "email"))) {
    const logo = opts.ocId
      ? await resolveCompanyLogo(supabase, { ocId: opts.ocId })
      : (prof?.management_company_id ? await resolveCompanyLogo(supabase, { managementCompanyId: prof.management_company_id as string }) : null);
    await sendComplianceReminderEmail({
      to: email, managerName: (prof?.first_name as string) ?? null,
      heading: opts.title, body: opts.body,
      ctaPath: opts.ctaPath, ctaShortCode: opts.ctaShortCode, ctaLabel: opts.ctaLabel,
      companyLogoUrl: logo, ocId: opts.ocId,
    });
  }
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ocManagers(supabase: any, ocId: string): Promise<string[]> {
  const { data } = await supabase.from("oc_members").select("profile_id").eq("oc_id", ocId).eq("role", "strata_manager").is("left_at", null);
  return (data ?? []).map((m: { profile_id: string }) => m.profile_id);
}

//
// Was `0 8 * * *` Australia/Melbourne on Trigger.dev. The schedule now
// lives in src/lib/cron/registry.ts.
export async function runComplianceReminders() {
  const supabase = createServerClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
  const insuranceCutoff = addDays(today, INSURANCE_WINDOW_DAYS);
  let sent = 0;

  // 1) OC insurance policies expiring soon.
  const { data: policies } = await supabase
    .from("insurance_policies")
    .select("id, oc_id, policy_type, provider, end_date, status, owners_corporations(name, short_code)")
    .lte("end_date", insuranceCutoff).gte("end_date", today).neq("status", "expired");
  for (const p of (policies ?? []) as Array<Record<string, unknown>>) {
    const oc = (p.owners_corporations as { name?: string; short_code?: string } | null) ?? {};
    const link = `/ocs/${oc.short_code ?? ""}/insurance`;
    const title = `Insurance expiring , ${oc.name ?? "OC"}`;
    const body = `The ${String(p.policy_type ?? "insurance")} policy with ${String(p.provider ?? "the insurer")} expires on ${humanDate(p.end_date as string)}. Arrange renewal.`;
    for (const pid of await ocManagers(supabase, p.oc_id as string)) {
      if (await notifyManager(supabase, { profileId: pid, type: "insurance_expiring", ocId: p.oc_id as string, title, body, link, ctaShortCode: (oc.short_code as string) ?? null, ctaPath: "insurance", ctaLabel: "Review insurance", dedupeDays: INSURANCE_DEDUPE_DAYS })) sent++;
    }
  }

  // 2) Contractor public-liability expiring soon (company-wide).
  const { data: contractors } = await supabase
    .from("contractors")
    .select("id, management_company_id, business_name, insurance_expiry, status")
    .lte("insurance_expiry", insuranceCutoff).gte("insurance_expiry", today).eq("status", "active").not("management_company_id", "is", null);
  for (const c of (contractors ?? []) as Array<Record<string, unknown>>) {
    const { data: mgrs } = await supabase.from("profiles").select("id").eq("management_company_id", c.management_company_id).eq("role", "strata_manager").eq("status", "active");
    const link = `/contractors`;
    const title = `Contractor insurance expiring`;
    const body = `${String(c.business_name ?? "A contractor")}'s public liability insurance expires on ${humanDate(c.insurance_expiry as string)}. Request an updated certificate.`;
    for (const m of (mgrs ?? []) as Array<{ id: string }>) {
      if (await notifyManager(supabase, { profileId: m.id, type: "insurance_expiring", ocId: null, title, body, link, ctaShortCode: null, ctaPath: null, ctaLabel: "Open contractors", dedupeDays: INSURANCE_DEDUPE_DAYS })) sent++;
    }
  }

  // 3) AGM. Two notifications off one deadline: a warning while there is
  //    still time to act, and an overdue alert once there is not.
  //
  //    This used to fetch the last AGM once per OC, inside the loop. At ~55ms
  //    of network each that is a query per row, which is the thing the schema
  //    rules forbid , one query for every OC's AGMs, grouped here instead.
  const { data: ocs } = await supabase
    .from("owners_corporations")
    .select("id, name, short_code, created_at")
    .eq("kind", "active");
  const ocList = (ocs ?? []) as Array<{ id: string; name: string; short_code: string; created_at: string }>;

  if (ocList.length > 0) {
    const { data: agms } = await supabase
      .from("meetings")
      .select("oc_id, date_time")
      .eq("meeting_type", "agm")
      .in("oc_id", ocList.map((o) => o.id))
      .order("date_time", { ascending: false });

    const lastAgmByOc = new Map<string, string>();
    for (const m of (agms ?? []) as Array<{ oc_id: string; date_time: string }>) {
      // Ordered newest-first, so the first hit per OC is the latest AGM.
      if (!lastAgmByOc.has(m.oc_id)) lastAgmByOc.set(m.oc_id, m.date_time);
    }

    const warnCutoff = addDays(today, AGM_WARN_DAYS);

    for (const oc of ocList) {
      const lastDate = lastAgmByOc.get(oc.id) ?? null;
      // An OC that has never held one counts from when it came onto the
      // platform , otherwise every new OC is instantly overdue.
      const from = (lastDate ?? oc.created_at).slice(0, 10);
      const deadline = addMonths(from, AGM_DEADLINE_MONTHS);

      const link = `/ocs/${oc.short_code}/meetings`;
      const heldLine = lastDate
        ? `The last AGM was held on ${humanDate(lastDate)}.`
        : `No AGM is on record for this Owners Corporation.`;

      if (deadline < today) {
        const title = `AGM overdue , ${oc.name}`;
        const body = `${heldLine} The 15-month deadline passed on ${humanDate(deadline)}. Schedule the annual general meeting.`;
        for (const pid of await ocManagers(supabase, oc.id)) {
          if (await notifyManager(supabase, { profileId: pid, type: "agm_due", ocId: oc.id, title, body, link, ctaShortCode: oc.short_code, ctaPath: "meetings", ctaLabel: "Schedule meeting", dedupeDays: AGM_DEDUPE_DAYS })) sent++;
        }
        continue;
      }

      if (deadline <= warnCutoff) {
        const title = `AGM due soon , ${oc.name}`;
        const body = `${heldLine} The next one must be held by ${humanDate(deadline)}. Allow for the 14-day notice period when you pick a date.`;
        for (const pid of await ocManagers(supabase, oc.id)) {
          if (await notifyManager(supabase, { profileId: pid, type: "agm_due_soon", ocId: oc.id, title, body, link, ctaShortCode: oc.short_code, ctaPath: "meetings", ctaLabel: "Schedule meeting", dedupeDays: AGM_SOON_DEDUPE_DAYS })) sent++;
        }
      }
    }
  }

  return { sent };
}
