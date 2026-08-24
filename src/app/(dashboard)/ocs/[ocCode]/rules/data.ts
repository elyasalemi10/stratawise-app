"use server";

import { getOC } from "@/lib/actions/oc";
import { getOCRules } from "@/lib/actions/oc-rules";
import { requireOCAccess } from "@/lib/auth";

export interface RulesPageData {
  rulesSource: string | null;
  rules: Awaited<ReturnType<typeof getOCRules>>["rules"];
  sourceDocumentName: string | null;
}

export async function getRulesPageData(ocId: string): Promise<RulesPageData> {
  await requireOCAccess(ocId);

  // These two used to run one after the other. Neither depends on the
  // other's result, so they go out together: one round trip instead of two.
  const [oc, { rules, sourceDocument }] = await Promise.all([
    getOC(ocId),
    getOCRules(ocId),
  ]);
  if (!oc) throw new Error("Owners Corporation not found.");

  return {
    rulesSource: oc.rules_source ?? null,
    rules,
    sourceDocumentName: sourceDocument?.file_name ?? null,
  };
}
