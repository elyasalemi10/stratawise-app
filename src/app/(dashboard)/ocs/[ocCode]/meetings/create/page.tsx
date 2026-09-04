import { notFound } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { CreateMeetingForm } from "./create-meeting-form";

export default async function CreateMeetingPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) notFound();
  const profile = await requireOCAccess(resolved.id);

  // Sensible defaults for the notice step. The manager chairing their own
  // OC's meeting and taking proxies at the office address is the ordinary
  // case, so typing it every time is busywork. Both stay editable.
  let companyEmail: string | null = null;
  if (profile.management_company_id) {
    const supabase = createServerClient();
    const { data: company } = await supabase
      .from("management_companies")
      .select("email")
      .eq("id", profile.management_company_id)
      .maybeSingle();
    companyEmail = (company as { email: string | null } | null)?.email ?? null;
  }

  const managerName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <CreateMeetingForm
      ocId={resolved.id}
      ocCode={ocCode}
      ocName={resolved.name ?? "Owners Corporation"}
      defaultChairperson={managerName || null}
      defaultProxyReturnTo={companyEmail ?? profile.email ?? null}
    />
  );
}
