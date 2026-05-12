import { redirect } from "next/navigation";
import { getOC } from "@/lib/actions/oc";
import { getLevyBatchDetail } from "@/lib/actions/levy";
import { createServerClient } from "@/lib/supabase";
import { BatchDetailContent } from "./batch-detail-content";

import { resolveOCFromCode } from "@/lib/oc-resolver";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ ocCode: string; batchId: string }>;
}) {
  const { ocCode, batchId } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const [oc, batch] = await Promise.all([
    getOC(ocId),
    getLevyBatchDetail(ocId, batchId),
  ]);

  if (!oc || !batch) redirect(`/ocs/${ocCode}/levies`);

  // PP6-D-A: per-levy reminder_sent flag for the LevyStatusBadge.
  const supabase = createServerClient();
  const levyIds = batch.levies.map((l) => l.id);
  const { data: escalations } = levyIds.length > 0
    ? await supabase
        .from("escalation_instances")
        .select("levy_notice_id, current_step")
        .in("levy_notice_id", levyIds)
    : { data: [] };
  const reminderSentLevyIds = (escalations ?? [])
    .filter((e) => (e as { current_step: number }).current_step >= 1)
    .map((e) => (e as { levy_notice_id: string }).levy_notice_id);

  return (
    <BatchDetailContent
      ocId={ocId}
      batch={batch}
      reminderSentLevyIds={reminderSentLevyIds}
    />
  );
}
