import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { getCurrentProfile } from "@/lib/auth";
import { listMeetings } from "@/lib/actions/meetings";
import { MeetingsContent } from "./meetings-content";

export default async function MeetingsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");

  const [profile, meetings] = await Promise.all([
    getCurrentProfile(),
    listMeetings(resolved.id),
  ]);

  return (
    <MeetingsContent
      ocId={resolved.id}
      ocCode={ocCode}
      meetings={meetings}
      readOnly={profile?.role === "lot_owner"}
    />
  );
}
