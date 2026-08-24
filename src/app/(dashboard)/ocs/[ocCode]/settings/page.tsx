import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { OCSettingsClient } from "./oc-settings-client";

// Shell only: resolve the OC code and hand off. Data and auth live in data.ts.
export default async function OCSettingsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");

  return <OCSettingsClient ocId={resolved.id} />;
}
