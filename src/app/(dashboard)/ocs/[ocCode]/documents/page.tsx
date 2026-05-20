import { redirect } from "next/navigation";
import { getOC } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { DocumentManager } from "@/components/shared/document-manager";

import { resolveOCFromCode } from "@/lib/oc-resolver";

async function getOCDocuments(ocId: string) {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();
  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("oc_id", ocId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const [oc, documents, profile] = await Promise.all([
    getOC(ocId),
    getOCDocuments(ocId),
    getCurrentProfile(),
  ]);

  if (!oc) redirect("/dashboard");

  const isLotOwner = profile?.role === "lot_owner";

  return (
    <div className="space-y-6">
      <DocumentManager ocId={ocId} initialDocuments={documents} readOnly={isLotOwner} />
    </div>
  );
}
