import { schedules, tasks } from "@trigger.dev/sdk";
import { createServerClient } from "@/lib/supabase";
import { advance, computeNextOccurrence } from "@/lib/recurring-jobs-helpers";
import type { RecurringFrequency } from "@/lib/validations/recurring-jobs";

// Drops an in-app notification for every lot-owner member of an OC. Inlined
// here (rather than importing the "use server" notifications action) so the
// Trigger.dev build stays free of Next server-action plumbing.
async function notifyOcOwnersInApp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ocId: string,
  title: string,
  message: string,
) {
  const { data: members } = await supabase
    .from("oc_members")
    .select("profile_id")
    .eq("oc_id", ocId)
    .eq("role", "lot_owner")
    .is("left_at", null);
  if (!members || members.length === 0) return;
  await supabase.from("notifications").insert(
    members.map((m: { profile_id: string }) => ({
      profile_id: m.profile_id,
      oc_id: ocId,
      type: "maintenance_update",
      title,
      body: message,
    })),
  );
}

// Daily: for each active recurring job whose next occurrence falls within its
// lead time, notify the chosen lot owners (background bulk-email task) + drop
// an in-app maintenance_update for the OC's owners, then advance the cached
// next_occurrence_date so the same occurrence isn't re-notified.

function humanDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

export const recurringJobReminders = schedules.task({
  id: "recurring-job-reminders",
  cron: { pattern: "0 8 * * *", timezone: "Australia/Melbourne" },
  run: async () => {
    const supabase = createServerClient();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());

    const { data: jobs } = await supabase
      .from("recurring_jobs")
      .select("id, oc_id, title, frequency, start_date, end_date, lead_time_days, notify_scope, next_occurrence_date, last_notified_occurrence")
      .eq("status", "active")
      .not("next_occurrence_date", "is", null);

    let notified = 0;
    for (const j of (jobs ?? []) as Array<{
      id: string; oc_id: string; title: string; frequency: RecurringFrequency;
      start_date: string; end_date: string | null; lead_time_days: number;
      notify_scope: string; next_occurrence_date: string; last_notified_occurrence: string | null;
    }>) {
      const occurrence = j.next_occurrence_date;
      // Days until the occurrence.
      const daysUntil = Math.round(
        (new Date(`${occurrence}T00:00:00.000Z`).getTime() - new Date(`${today}T00:00:00.000Z`).getTime()) / 86_400_000,
      );

      // Only act inside the lead-time window and only once per occurrence.
      const withinLead = daysUntil <= (j.lead_time_days ?? 0) && daysUntil >= 0;
      if (withinLead && j.notify_scope !== "none" && j.last_notified_occurrence !== occurrence) {
        // Background fan-out for the owner emails.
        try {
          await tasks.trigger("send-bulk-email", {
            kind: "recurring_job",
            recurringJobId: j.id,
            occurrenceDate: occurrence,
          });
        } catch (err) {
          console.error("recurring-job-reminders: failed to queue bulk-email", err);
        }

        // In-app notification for the OC's owners (broad signal). Email is the
        // targeted channel; in-app covers everyone on the portal.
        if (j.notify_scope === "all_owners") {
          await notifyOcOwnersInApp(
            supabase,
            j.oc_id,
            `Upcoming maintenance: ${j.title}`,
            `Scheduled for ${humanDate(occurrence)}.`,
          );
        }

        await supabase
          .from("recurring_jobs")
          .update({ last_notified_occurrence: occurrence })
          .eq("id", j.id);
        notified++;
      }

      // If the occurrence has passed, roll the cached next date forward.
      if (daysUntil < 0) {
        const next = computeNextOccurrence({
          startDate: j.start_date,
          frequency: j.frequency,
          endDate: j.end_date,
          fromIso: advance(occurrence, j.frequency),
        });
        await supabase
          .from("recurring_jobs")
          .update({ next_occurrence_date: next })
          .eq("id", j.id);
      }
    }

    return { candidates: (jobs ?? []).length, notified };
  },
});
