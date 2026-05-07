import { redirect } from "next/navigation";
import { getSubdivision } from "@/lib/actions/subdivision";
import { getLevyBatchDetail } from "@/lib/actions/levy";
import { createServerClient } from "@/lib/supabase";
import { BatchDetailContent } from "./batch-detail-content";

import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ subdivisionCode: string; batchId: string }>;
}) {
  const { subdivisionCode, batchId } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;
  const [subdivision, batch] = await Promise.all([
    getSubdivision(subdivisionId),
    getLevyBatchDetail(subdivisionId, batchId),
  ]);

  if (!subdivision || !batch) redirect(`/subdivisions/${subdivisionCode}/levies`);

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
      subdivisionId={subdivisionId}
      batch={batch}
      reminderSentLevyIds={reminderSentLevyIds}
    />
  );
}
