import { task } from "@trigger.dev/sdk";
import { runLevyBatchSend, type LevyBatchSendPayload } from "@/lib/levy-batch-send-runner";

// Background fan-out for a levy batch send/resend so the manager's "Send"
// click returns instantly instead of blocking while every notice email goes
// out. Triggered with tasks.trigger("send-levy-batch", payload) from
// queueBatchSend in src/lib/actions/levy.ts.

export const sendLevyBatch = task({
  id: "send-levy-batch",
  maxDuration: 600,
  run: async (payload: LevyBatchSendPayload) => {
    return await runLevyBatchSend(payload);
  },
});
