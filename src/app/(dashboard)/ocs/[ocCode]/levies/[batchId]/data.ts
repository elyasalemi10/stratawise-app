"use server";

import { getOC } from "@/lib/actions/oc";
import { resolveId } from "@/lib/short-code";
import { getLevyBatchDetail } from "@/lib/actions/levy";
import { requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { listManagerInboxes } from "@/lib/actions/manager-username";

// One aggregate fetch for a levy batch.
//
// The auth check lives here, not in page.tsx: page.tsx only runs on the
// initial shell request, so a check left up there would be skipped on every
// refresh the client drives afterwards.

export interface BatchDetailPageData {
  batch: NonNullable<Awaited<ReturnType<typeof getLevyBatchDetail>>>;
  reminderSentLevyIds: string[];
  mailboxOptions: Array<{ value: string; label: string }>;
}

export async function getBatchDetailPageData(
  ocId: string,
  batchId: string,
): Promise<BatchDetailPageData> {
  // The URL carries a short code; everything below joins on the UUID.
  // Resolved HERE rather than in the page shell so the loading
  // boundary, which only has the raw segment, can render the real
  // client and paint from cache exactly as the page does.
  const resolvedBatchId = await resolveId("levy_batches", batchId);
  if (!resolvedBatchId) throw new Error("Not found");
  batchId = resolvedBatchId;

  await requireOCAccess(ocId);

  const supabase = createServerClient();

  const [oc, batch] = await Promise.all([
    getOC(ocId),
    getLevyBatchDetail(ocId, batchId),
  ]);
  if (!oc || !batch) throw new Error("Levy batch not found.");

  // Per-levy reminder_sent flag for the LevyStatusBadge, and the mailbox
  // options for the send dialog. Independent of each other, so one wave.
  //
  // Mailboxes are always real email addresses, never a provider name
  // ("Resend"), so the manager sees exactly what the recipient will see.
  // Two sources: the firm's connected Gmail mailboxes, and the manager's
  // permanent StrataWise alias. De-duped; the dialog renders a single option
  // as static text and two or more as a dropdown.
  const levyIds = batch.levies.map((l) => l.id);
  const [{ data: escalations }, inboxes] = await Promise.all([
    levyIds.length
      ? supabase
          .from("escalation_instances")
          .select("levy_notice_id, current_step")
          .in("levy_notice_id", levyIds)
      : Promise.resolve({ data: [] as Array<{ levy_notice_id: string; current_step: number }> }),
    listManagerInboxes(),
  ]);

  // Mailboxes we can actually send AS. It used to offer profiles.email,
  // the address the manager signed up with, whenever the firm had Gmail
  // connected at all: firm-level connection is not the same as THIS mailbox
  // being subscribed, and we do not own that domain either way.
  // listManagerInboxes reads the subscriptions themselves.
  const mailboxOptions = inboxes.map((inbox) => ({
    value: inbox.email,
    label: inbox.email,
  }));
  if (mailboxOptions.length === 0) {
    mailboxOptions.push({
      value: "noreply@stratawise.com.au",
      label: "noreply@stratawise.com.au",
    });
  }

  return {
    batch,
    reminderSentLevyIds: (escalations ?? [])
      .filter((e) => (e as { current_step: number }).current_step >= 1)
      .map((e) => (e as { levy_notice_id: string }).levy_notice_id),
    mailboxOptions,
  };
}
