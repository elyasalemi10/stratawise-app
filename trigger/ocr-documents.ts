import { schedules, task } from "@trigger.dev/sdk";
import { createServerClient } from "@/lib/supabase";
import { ingestDocumentOcr, isOcrable } from "@/lib/ocr/ingest";

// ============================================================================
// Trigger.dev tasks for document OCR.
//
//   ocrDocumentTask         — one-shot trigger fired per upload from the
//                             documents POST route via tasks.trigger(). Runs
//                             ingestDocumentOcr(documentId) so the user's
//                             browser keeps moving while OCR happens in the
//                             background. Replaces the previous Next.js
//                             after() hook so OCR doesn't share the
//                             serverless function's RAM / time budget.
//
//   sweepPendingOcrJobs     — every 10 minutes; picks up any document row
//                             that's still ocr_status='pending' more than
//                             5 minutes after upload. Catches any one-shot
//                             trigger that didn't fire (queue backlog,
//                             cold-start failure, etc.) so search indexing
//                             stays current without manual intervention.
//
// Both tasks share ingestDocumentOcr — the one source of truth for the OCR
// pipeline. Failures land on the document row as ocr_status='failed' (with
// the reason in ocr_error); the task always exits cleanly so Trigger.dev's
// retry logic doesn't loop on documents we can't process (e.g. corrupt
// uploads).
// ============================================================================

export const ocrDocumentTask = task({
  id: "ocr-document",
  maxDuration: 300, // 5 min — covers worst-case Document AI cold-starts.
  run: async (payload: { documentId: string }) => {
    if (!payload?.documentId) {
      console.warn("ocr-document: missing documentId in payload");
      return { ok: false, reason: "missing_documentId" };
    }
    await ingestDocumentOcr(payload.documentId);
    return { ok: true, documentId: payload.documentId };
  },
});

export const sweepPendingOcr = schedules.task({
  id: "sweep-pending-ocr",
  // Every 10 minutes. Trigger.dev billing is per-run + per-duration, so this
  // is cheap idle (no rows = ~50ms exit). When the sweep finds rows it spawns
  // ocrDocumentTask runs via .batchTrigger so each document gets its own
  // concurrency slot + its own retry policy.
  cron: { pattern: "*/10 * * * *", timezone: "Australia/Melbourne" },
  run: async () => {
    const supabase = createServerClient();

    // Anything still 'pending' for more than 5 minutes is suspect — the
    // upload route already kicks off a one-shot run for fresh uploads.
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("documents")
      .select("id, mime_type")
      .eq("ocr_status", "pending")
      .lt("created_at", cutoff)
      .limit(50);

    if (error) {
      console.error("sweep-pending-ocr: query failed", error);
      return { ok: false, reason: error.message };
    }
    const eligible = (data ?? []).filter((row) =>
      isOcrable(row.mime_type as string | null),
    );
    if (eligible.length === 0) {
      return { ok: true, picked: 0 };
    }

    // batchTrigger spawns one run per doc so a single failing pdf doesn't
    // poison the sweep — each run is isolated.
    await ocrDocumentTask.batchTrigger(
      eligible.map((row) => ({
        payload: { documentId: row.id as string },
      })),
    );
    return { ok: true, picked: eligible.length };
  },
});
