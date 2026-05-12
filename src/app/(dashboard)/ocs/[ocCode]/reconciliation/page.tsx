import { redirect } from "next/navigation";
import { getOC } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { getReconciliationQueue } from "@/lib/actions/reconciliation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
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
  params: Promise<{ ocCode: string }>;
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
    /** PP5-D-A: "1" → only show duplicate_status='suspected' rows */
    dup?: string;
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
  if (profile?.role === "lot_owner") redirect(`/ocs/${ocCode}`);

  const status =
    sp.status && (VALID_STATUSES as string[]).includes(sp.status)
      ? (sp.status as MatchStatus | "all")
      : "unmatched";
  const page = Math.max(Number(sp.page) || 1, 1);

  const matchConfidence = parseCsv(sp.mc);
  const matchMethod = parseCsv(sp.mm);
  const reviewRequired = sp.rr === "1";
  const hasFuzzyHint = sp.fh === "1";
  const dupSuspected = sp.dup === "1";

  const queue = await getReconciliationQueue(ocId, {
    bankAccountId: sp.bank ?? null,
    source: (sp.source as TransactionSource | "all" | undefined) ?? null,
    status,
    page,
    pageSize: 50,
    matchConfidence: matchConfidence.length > 0 ? matchConfidence : undefined,
    matchMethod: matchMethod.length > 0 ? matchMethod : undefined,
    reviewRequired: reviewRequired ? true : undefined,
    hasFuzzyHint: hasFuzzyHint ? true : undefined,
    dupSuspected: dupSuspected ? true : undefined,
  });

  return (
    <ReconciliationQueueContent
      ocId={ocId}
      queue={queue}
      activeFilters={{
        bankAccountId: sp.bank ?? null,
        status,
        source: sp.source ?? "all",
      }}
    />
  );
}
