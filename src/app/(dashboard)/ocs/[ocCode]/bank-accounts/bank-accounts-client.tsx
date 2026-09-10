"use client";

import { useCallback } from "react";
import type { EntityKind } from "./data";
import { OCPageTitle } from "@/components/shared/page-title";
import { useCachedData } from "@/lib/use-cached-data";
import { BankAccountsList } from "./bank-accounts-list";
import { NoBankAccountsEmpty } from "./empty-state";
import { getBankAccountsPageData, type BankAccountsPageData } from "./data";
import { BankAccountsSkeleton } from "./bank-accounts-skeleton";

export function BankAccountsClient({ ocId }: { ocId: string }) {
  const fetcher = useCallback(() => getBankAccountsPageData(ocId), [ocId]);
  const { data, loading, setData } = useCachedData<BankAccountsPageData>(
    `bank-accounts:${ocId}`,
    fetcher,
  );

  // Written through the cache, not held beside it, so the pill survives
  // navigating away and back rather than reverting to what the last fetch
  // said.
  const assignEntity = useCallback(
    (txnId: string, entity: { kind: EntityKind; id: string } | null) => {
      setData((prev) => ({
        ...prev,
        accounts: (prev?.accounts ?? []).map((a) => ({
          ...a,
          transactions: a.transactions.map((t) =>
            t.id === txnId ? { ...t, entity } : t,
          ),
        })),
        entityOptions: prev?.entityOptions ?? [],
      }));
    },
    [setData],
  );

  if (loading || !data) return <BankAccountsSkeleton />;

  return (
    <div className="space-y-6">
      <OCPageTitle page="Bank accounts" />
      {data.accounts.length === 0 ? (
        <NoBankAccountsEmpty ocId={ocId} />
      ) : (
        <BankAccountsList
          ocId={ocId}
          accounts={data.accounts}
          entityOptions={data.entityOptions}
          onAssign={assignEntity}
        />
      )}
    </div>
  );
}
