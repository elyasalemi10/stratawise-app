import { task } from "@trigger.dev/sdk";
import { runBulkEmail, type BulkEmailPayload } from "@/lib/bulk-email-runner";

// Generic background fan-out for bulk sends so the manager's action returns
// instantly instead of blocking while every email goes out. Triggered with
// tasks.trigger("send-bulk-email", payload) from server actions (meeting
// notices) and from the recurring-job reminder cron. The payload carries only
// ids , recipients + content are resolved server-side inside runBulkEmail.

export const sendBulkEmail = task({
  id: "send-bulk-email",
  maxDuration: 600,
  run: async (payload: BulkEmailPayload) => {
    return await runBulkEmail(payload);
  },
});
