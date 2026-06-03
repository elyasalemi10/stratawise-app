import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import { getMeetingDetail } from "@/lib/actions/meetings";
import { getOCNotifyOwners } from "@/lib/actions/recurring-jobs";
import { MeetingDetailContent } from "./meeting-detail-content";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ ocCode: string; meetingId: string }>;
}) {
  const { ocCode, meetingId } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  await requireOCAccess(resolved.id);

  const [meeting, profile, owners] = await Promise.all([
    getMeetingDetail(meetingId),
    getCurrentProfile(),
    getOCNotifyOwners(resolved.id),
  ]);
  if (!meeting || meeting.oc_id !== resolved.id) redirect(`/ocs/${ocCode}/meetings`);

  return (
    <MeetingDetailContent
      ocCode={ocCode}
      meeting={meeting}
      owners={owners}
      readOnly={profile?.role === "lot_owner"}
    />
  );
}
