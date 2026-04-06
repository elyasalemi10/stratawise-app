import { getSubdivision } from "@/lib/actions/subdivision";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { DocumentManager } from "@/components/shared/document-manager";

// Import document actions from manage folder (reuse existing)
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
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const [subdivision, documents] = await Promise.all([
    getSubdivision(subdivisionId),
    getSubdivisionDocuments(subdivisionId),
  ]);

  if (!subdivision) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader title="Documents" subtitle={subdivision.name} />
      <DocumentManager subdivisionId={subdivisionId} initialDocuments={documents} />
    </div>
  );
}
