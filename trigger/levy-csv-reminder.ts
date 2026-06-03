import { schedules } from "@trigger.dev/sdk";
import { createServerClient } from "@/lib/supabase";
import { sendLevyCsvReminderEmail } from "@/lib/email";
import { isNotificationOptedOut, resolveCompanyLogo } from "@/lib/notifications";

// Daily reminder: when an OC's next levy run is due within 7 days but no fresh
// bank CSV has been imported in the last 7 days, nudge the manager (email +
// in-app) to upload one so arrears on the notices stay accurate. Fires once
// per run (csv_reminder_sent_for_date sentinel). Opt-outable via the
// "levy_csv_reminder" notification preference.

const WINDOW_DAYS = 7;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function humanDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric",
  });
}

export const levyCsvReminder = schedules.task({
  id: "levy-csv-reminder",
  cron: { pattern: "0 8 * * *", timezone: "Australia/Melbourne" },
  run: async () => {
    const supabase = createServerClient();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
    const windowEnd = addDays(today, WINDOW_DAYS);
    const importedAfter = `${addDays(today, -WINDOW_DAYS)}T00:00:00.000Z`;

    const { data: due } = await supabase
      .from("levy_autosend_schedules")
      .select("id, oc_id, next_send_date, created_by, csv_reminder_sent_for_date")
      .eq("enabled", true)
      .gte("next_send_date", today)
      .lte("next_send_date", windowEnd);

    let nudged = 0;
    for (const s of (due ?? []) as Array<{
      id: string; oc_id: string; next_send_date: string;
      created_by: string | null; csv_reminder_sent_for_date: string | null;
    }>) {
      // Already nudged for this run.
      if (s.csv_reminder_sent_for_date === s.next_send_date) continue;

      // Bank accounts for the OC.
      const { data: accounts } = await supabase
        .from("bank_accounts")
        .select("id")
        .eq("oc_id", s.oc_id);
      const accountIds = (accounts ?? []).map((a) => a.id as string);
      if (accountIds.length === 0) continue;

      // Fresh CSV import in the last 7 days?
      const { data: recent } = await supabase
        .from("bank_transactions")
        .select("imported_at")
        .in("bank_account_id", accountIds)
        .eq("source", "csv_import")
        .gte("imported_at", importedAfter)
        .limit(1);
      if (recent && recent.length > 0) continue; // run is covered, no nudge

      // Last import ever, for the email label.
      const { data: lastEver } = await supabase
        .from("bank_transactions")
        .select("imported_at")
        .in("bank_account_id", accountIds)
        .eq("source", "csv_import")
        .order("imported_at", { ascending: false })
        .limit(1);
      const lastImportLabel = lastEver && lastEver.length > 0
        ? humanDate((lastEver[0].imported_at as string).slice(0, 10))
        : "never";

      // Resolve the recipient manager: the schedule's creator, else the OC's
      // primary manager.
      let managerProfileId = s.created_by;
      if (!managerProfileId) {
        const { data: member } = await supabase
          .from("oc_members")
          .select("profile_id, joined_at")
          .eq("oc_id", s.oc_id)
          .eq("role", "strata_manager")
          .is("left_at", null)
          .order("joined_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        managerProfileId = (member as { profile_id: string } | null)?.profile_id ?? null;
      }
      if (!managerProfileId) continue;

      const { data: manager } = await supabase
        .from("profiles")
        .select("email, first_name")
        .eq("id", managerProfileId)
        .maybeSingle();
      const managerEmail = (manager as { email?: string } | null)?.email ?? null;
      const managerName = (manager as { first_name?: string } | null)?.first_name ?? null;

      const { data: oc } = await supabase
        .from("owners_corporations")
        .select("name, short_code")
        .eq("id", s.oc_id)
        .maybeSingle();
      const ocName = (oc as { name?: string } | null)?.name ?? "Owners Corporation";
      const ocShortCode = (oc as { short_code?: string } | null)?.short_code ?? "";
      const nextSendLabel = humanDate(s.next_send_date);

      // Email (opt-out respecting).
      if (managerEmail && !(await isNotificationOptedOut(supabase, managerProfileId, "levy_csv_reminder", "email"))) {
        const logoUrl = await resolveCompanyLogo(supabase, { ocId: s.oc_id });
        await sendLevyCsvReminderEmail({
          to: managerEmail,
          managerName,
          ocName,
          ocShortCode,
          nextSendDate: nextSendLabel,
          lastImportLabel,
          companyLogoUrl: logoUrl,
          ocId: s.oc_id,
        });
      }

      // In-app (opt-out respecting).
      if (!(await isNotificationOptedOut(supabase, managerProfileId, "levy_csv_reminder", "in_app"))) {
        await supabase.from("notifications").insert({
          profile_id: managerProfileId,
          oc_id: s.oc_id,
          type: "levy_csv_reminder",
          title: `Upload a bank CSV for ${ocName}`,
          body: `The next levy run is due ${nextSendLabel} but no fresh bank CSV has been imported. Import one to keep arrears accurate.`,
          link: ocShortCode ? `/ocs/${ocShortCode}/reconciliation` : null,
        });
      }

      // Mark this run as nudged.
      await supabase
        .from("levy_autosend_schedules")
        .update({ csv_reminder_sent_for_date: s.next_send_date })
        .eq("id", s.id);

      nudged++;
    }

    return { candidates: (due ?? []).length, nudged };
  },
});
