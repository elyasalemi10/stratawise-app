import { schedules } from "@trigger.dev/sdk";
import { createServerClient } from "@/lib/supabase";
import { runAutosendForSchedule } from "@/lib/levy-autosend-runner";

// Daily auto-send levies cron. Reads levy_autosend_schedules, finds
// every enabled row whose next_send_date is today or earlier, and for
// each one runs the full generate → mark sent → send-emails cycle via
// runAutosendForSchedule. Errors land on the row's last_error column
// so the manager sees them in OC settings → Automation.

export const dailyLevyAutosend = schedules.task({
  id: "daily-levy-autosend",
  cron: { pattern: "0 9 * * *", timezone: "Australia/Melbourne" }, // 09:00 local
  run: async () => {
    const supabase = createServerClient();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());

    const { data: due } = await supabase
      .from("levy_autosend_schedules")
      .select("id")
      .eq("enabled", true)
      .lte("next_send_date", today);

    const rows = ((due as { id: string }[]) ?? []);

    let processed = 0;
    let errors = 0;
    const results: Array<{ id: string; status: string; reason?: string }> = [];
    for (const r of rows) {
      try {
        const res = await runAutosendForSchedule(r.id, today);
        if (res.status === "error") {
          errors++;
          await supabase
            .from("levy_autosend_schedules")
            .update({
              last_error: res.reason ?? "Auto-send failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", r.id);
        } else {
          processed++;
        }
        results.push({ id: r.id, status: res.status, reason: res.reason });
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : "Auto-send failed";
        await supabase
          .from("levy_autosend_schedules")
          .update({
            last_error: msg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.id);
        results.push({ id: r.id, status: "error", reason: msg });
      }
    }

    return { processed, errors, candidates: rows.length, results };
  },
});
