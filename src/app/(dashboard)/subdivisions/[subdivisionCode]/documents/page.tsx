import { redirect } from "next/navigation";
import { getSubdivision } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { DocumentManager } from "@/components/shared/document-manager";

import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";

async function getSubdivisionDocuments(subdivisionId: string) {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();
  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("subdivision_id", subdivisionId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ subdivisionCode: string }>;
}) {
  const { subdivisionCode } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;
  const [subdivision, documents, profile] = await Promise.all([
    getSubdivision(subdivisionId),
    getSubdivisionDocuments(subdivisionId),
    getCurrentProfile(),
  ]);

  if (!subdivision) redirect("/dashboard");

  const isLotOwner = profile?.role === "lot_owner";

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Documents</h1>
      <DocumentManager subdivisionId={subdivisionId} initialDocuments={documents} readOnly={isLotOwner} />
    </div>
  );
}
