"use client";

import { useCallback } from "react";
import { OCPageTitle } from "@/components/shared/page-title";
import { Scale } from "lucide-react";
import { useCachedData } from "@/lib/use-cached-data";
import { EmptyState } from "@/components/shared/empty-state";
import { RulesList } from "./_components/rules-list";
import { getRulesPageData, type RulesPageData } from "./data";
import { RulesSkeleton } from "./rules-skeleton";

export function RulesClient({ ocId, ocCode }: { ocId: string; ocCode: string }) {
  const fetcher = useCallback(() => getRulesPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<RulesPageData>(`rules:${ocId}`, fetcher);

  if (loading || !data) return <RulesSkeleton />;

  const isCustom = data.rulesSource === "custom";

  if (!isCustom || data.rules.length === 0) {
    return (
      <EmptyState
        illustration="documents"
        title={isCustom ? "Rules upload pending" : "Using Victoria's Model Rules"}
        description={
          isCustom
            ? "We couldn't read the custom rules file , visit the OC's documents tab to view the source."
            : "This OC adopted the default Model Rules under the Owners Corporations Regulations. To use custom rules, upload a registered rules PDF from the documents tab."
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <OCPageTitle page="Rules" />
      <RulesList
        ocId={ocId}
        ocCode={ocCode}
        rules={data.rules}
        sourceDocumentName={data.sourceDocumentName}
      />
    </div>
  );
}
