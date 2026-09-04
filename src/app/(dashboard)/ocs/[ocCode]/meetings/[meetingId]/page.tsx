import { notFound } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { MeetingDetailClient } from "./meeting-detail-client";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ ocCode: string; meetingId: string }>;
}) {
  const { ocCode, meetingId } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) notFound();

  return <MeetingDetailClient ocId={resolved.id} ocCode={ocCode} meetingId={meetingId} />;
}
