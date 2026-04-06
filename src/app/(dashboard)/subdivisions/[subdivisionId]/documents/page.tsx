import { redirect } from "next/navigation";
import { getSubdivision } from "@/lib/actions/subdivision";
import { DocumentManager } from "@/components/shared/document-manager";

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

  return <DocumentManager subdivisionId={subdivisionId} initialDocuments={documents} />;
}
