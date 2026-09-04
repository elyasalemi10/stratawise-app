import { notFound } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { OCSettingsClient } from "../oc-settings-client";
import { SectionHeader } from "@/components/shared/section-header";
import { OC_SETTINGS_LABEL } from "../nav";

// Shell only: resolve the OC code and hand off. Data and auth live in data.ts.
export default async function Page({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) notFound();

  return (
    <>
      <SectionHeader title={OC_SETTINGS_LABEL.management} />
      <OCSettingsClient ocId={resolved.id} section="management" />
    </>
  );
}
