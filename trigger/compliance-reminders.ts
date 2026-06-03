import { schedules } from "@trigger.dev/sdk";
import { createServerClient } from "@/lib/supabase";
import { sendComplianceReminderEmail } from "@/lib/email";
import { isNotificationOptedOut, resolveCompanyLogo } from "@/lib/notifications";

// Daily compliance sweep. Notifies managers (in-app + email, opt-out
// respected) about:
//   - OC insurance policies expiring within 30 days  (type insurance_expiring)
//   - contractor public-liability expiring within 30 days (insurance_expiring)
//   - OCs whose last AGM was over 12 months ago  (type agm_due)
// De-duped: skips if the same notification (by link) was sent recently.

const INSURANCE_WINDOW_DAYS = 30;
const INSURANCE_DEDUPE_DAYS = 25;
const AGM_DUE_MONTHS = 12;
const AGM_DEDUPE_DAYS = 45;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function humanDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
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

export const complianceReminders = schedules.task({
  id: "compliance-reminders",
  cron: { pattern: "0 8 * * *", timezone: "Australia/Melbourne" },
  run: async () => {
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

    // 3) AGM due , OCs whose last AGM was over 12 months ago (or never).
    const agmCutoff = new Date(); agmCutoff.setMonth(agmCutoff.getMonth() - AGM_DUE_MONTHS);
    const agmCutoffIso = agmCutoff.toISOString();
    const { data: ocs } = await supabase.from("owners_corporations").select("id, name, short_code").eq("kind", "active");
    for (const oc of (ocs ?? []) as Array<{ id: string; name: string; short_code: string }>) {
      const { data: lastAgm } = await supabase
        .from("meetings").select("date_time").eq("oc_id", oc.id).eq("meeting_type", "agm")
        .order("date_time", { ascending: false }).limit(1).maybeSingle();
      const lastDate = (lastAgm?.date_time as string) ?? null;
      if (lastDate && lastDate > agmCutoffIso) continue; // within the last 12 months
      const link = `/ocs/${oc.short_code}/meetings`;
      const title = `AGM due , ${oc.name}`;
      const body = lastDate
        ? `The last AGM was held on ${humanDate(lastDate)}. An annual general meeting is now due , schedule one to stay compliant.`
        : `No AGM is on record for this Owners Corporation. Schedule the annual general meeting to stay compliant.`;
      for (const pid of await ocManagers(supabase, oc.id)) {
        if (await notifyManager(supabase, { profileId: pid, type: "agm_due", ocId: oc.id, title, body, link, ctaShortCode: oc.short_code, ctaPath: "meetings", ctaLabel: "Schedule meeting", dedupeDays: AGM_DEDUPE_DAYS })) sent++;
      }
    }

    return { sent };
  },
});
