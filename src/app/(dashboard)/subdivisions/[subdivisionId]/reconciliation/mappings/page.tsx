import { redirect } from "next/navigation";
import { getSubdivision } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { getMappingsForSubdivision } from "@/lib/actions/reconciliation";
import { MappingsContent } from "./mappings-content";

const VALID_STATUSES = ["active", "ambiguous", "disabled", "all"] as const;
type StatusFilter = (typeof VALID_STATUSES)[number];

interface Props {
  params: Promise<{ subdivisionId: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function MappingsPage({ params, searchParams }: Props) {
  const { subdivisionId } = await params;
  const sp = await searchParams;

  const [subdivision, profile] = await Promise.all([
    getSubdivision(subdivisionId),
    getCurrentProfile(),
  ]);
  if (!subdivision) redirect("/dashboard");
  if (profile?.role === "lot_owner") {
    redirect(`/subdivisions/${subdivisionId}/dashboard`);
  }

  const status: StatusFilter =
    sp.status && (VALID_STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as StatusFilter)
      : "active";

  const mappings = await getMappingsForSubdivision(subdivisionId, status);

  // PP4-D: delete is admin-only (super_admin or strata_manager + admin
  // company_role). Surfaced to the client so the row-actions component can
  // gate the Delete affordance.
  const canDelete =
    profile?.role === "super_admin" || profile?.company_role === "admin";

  return (
    <MappingsContent
      subdivisionId={subdivisionId}
      mappings={mappings}
      activeStatus={status}
      canDelete={canDelete}
    />
  );
}
