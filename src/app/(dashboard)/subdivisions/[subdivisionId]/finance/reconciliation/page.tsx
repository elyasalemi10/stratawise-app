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
  }>;
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

  const queue = await getReconciliationQueue(subdivisionId, {
    bankAccountId: sp.bank ?? null,
    source: (sp.source as TransactionSource | "all" | undefined) ?? null,
    status,
    page,
    pageSize: 50,
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
