import { redirect } from "next/navigation";
import { getOC } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { getMappingsForOC } from "@/lib/actions/reconciliation";
import { MappingsContent } from "./mappings-content";

import { resolveOCFromCode } from "@/lib/oc-resolver";

const VALID_STATUSES = ["active", "ambiguous", "disabled", "all"] as const;
type StatusFilter = (typeof VALID_STATUSES)[number];

interface Props {
  params: Promise<{ ocCode: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function MappingsPage({ params, searchParams }: Props) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const sp = await searchParams;

  const [oc, profile] = await Promise.all([
    getOC(ocId),
    getCurrentProfile(),
  ]);
  if (!oc) redirect("/dashboard");
  if (profile?.role === "lot_owner") {
    redirect(`/ocs/${ocCode}`);
  }

  const status: StatusFilter =
    sp.status && (VALID_STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as StatusFilter)
      : "active";

  const mappings = await getMappingsForOC(ocId, status);

  // PP4-D: delete is admin-only (super_admin or strata_manager + admin
  // company_role). Surfaced to the client so the row-actions component can
  // gate the Delete affordance.
  const canDelete =
    profile?.role === "super_admin" || profile?.company_role === "admin";

  return (
    <MappingsContent
      ocId={ocId}
      mappings={mappings}
      activeStatus={status}
      canDelete={canDelete}
    />
  );
}
