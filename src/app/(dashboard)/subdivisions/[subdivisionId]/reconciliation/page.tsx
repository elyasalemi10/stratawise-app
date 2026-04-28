import { redirect } from "next/navigation";
import { getSubdivision } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { getReconciliationQueue } from "@/lib/actions/reconciliation";
import type {
  MatchStatus,
  TransactionSource,
} from "@/lib/validations/reconciliation";
import { ReconciliationQueueContent } from "./reconciliation-queue-content";

const VALID_STATUSES: (MatchStatus | "all")[] = [
  "unmatched",
  "auto_matched",
  "manually_matched",
  "excluded",
  "all",
];

interface Props {
  params: Promise<{ subdivisionId: string }>;
  searchParams: Promise<{
    bank?: string;
    status?: string;
    source?: string;
    page?: string;
    /** comma-delimited match_confidence values */
    mc?: string;
    /** comma-delimited match_method values */
    mm?: string;
    /** "1" → review_required = true */
    rr?: string;
    /** "1" → has fuzzy hint */
    fh?: string;
  }>;
}

function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function ReconciliationPage({ params, searchParams }: Props) {
  const { subdivisionId } = await params;
  const sp = await searchParams;

  const [subdivision, profile] = await Promise.all([
    getSubdivision(subdivisionId),
    getCurrentProfile(),
  ]);
  if (!subdivision) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/subdivisions/${subdivisionId}/dashboard`);

  const status =
    sp.status && (VALID_STATUSES as string[]).includes(sp.status)
      ? (sp.status as MatchStatus | "all")
      : "unmatched";
  const page = Math.max(Number(sp.page) || 1, 1);

  const matchConfidence = parseCsv(sp.mc);
  const matchMethod = parseCsv(sp.mm);
  const reviewRequired = sp.rr === "1";
  const hasFuzzyHint = sp.fh === "1";

  const queue = await getReconciliationQueue(subdivisionId, {
    bankAccountId: sp.bank ?? null,
    source: (sp.source as TransactionSource | "all" | undefined) ?? null,
    status,
    page,
    pageSize: 50,
    matchConfidence: matchConfidence.length > 0 ? matchConfidence : undefined,
    matchMethod: matchMethod.length > 0 ? matchMethod : undefined,
    reviewRequired: reviewRequired ? true : undefined,
    hasFuzzyHint: hasFuzzyHint ? true : undefined,
  });

  return (
    <ReconciliationQueueContent
      subdivisionId={subdivisionId}
      queue={queue}
      activeFilters={{
        bankAccountId: sp.bank ?? null,
        status,
        source: sp.source ?? "all",
      }}
    />
  );
}
