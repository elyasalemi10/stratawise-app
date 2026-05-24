import { redirect } from "next/navigation";
import { Scale } from "lucide-react";
import { getOC } from "@/lib/actions/oc";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { getOCRules } from "@/lib/actions/oc-rules";
import { EmptyState } from "@/components/shared/empty-state";
import { RulesList } from "./_components/rules-list";

export default async function RulesPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");

  const oc = await getOC(resolved.id);
  if (!oc) redirect("/dashboard");

  const { rules, sourceDocument } = await getOCRules(resolved.id);

  if (oc.rules_source !== "custom" || rules.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        title={oc.rules_source === "custom" ? "Rules upload pending" : "Using Victoria's Model Rules"}
        description={
          oc.rules_source === "custom"
            ? "The custom rules PDF didn't parse , visit the OC's documents tab to view the source."
            : "This OC adopted the default Model Rules under the Owners Corporations Regulations. To use custom rules, upload a registered rules PDF from the documents tab."
        }
      />
    );
  }

  return (
    <RulesList
      ocId={resolved.id}
      ocCode={ocCode}
      rules={rules}
      sourceDocumentName={sourceDocument?.file_name ?? null}
    />
  );
}
