import { notFound } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { MeetingsClient } from "../meetings-client";

export default async function MeetingsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) notFound();

  return <MeetingsClient ocId={resolved.id} ocCode={ocCode} />;
}
