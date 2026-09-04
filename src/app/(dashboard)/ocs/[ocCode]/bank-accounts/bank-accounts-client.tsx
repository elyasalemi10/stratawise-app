"use client";

import { useCallback } from "react";
import { OCPageTitle } from "@/components/shared/page-title";
import { useCachedData } from "@/lib/use-cached-data";
import { BankAccountsList } from "./bank-accounts-list";
import { NoBankAccountsEmpty } from "./empty-state";
import { getBankAccountsPageData, type BankAccountsPageData } from "./data";
import { BankAccountsSkeleton } from "./bank-accounts-skeleton";

export function BankAccountsClient({ ocId }: { ocId: string }) {
  const fetcher = useCallback(() => getBankAccountsPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<BankAccountsPageData>(
    `bank-accounts:${ocId}`,
    fetcher,
  );

  if (loading || !data) return <BankAccountsSkeleton />;

  return (
    <div className="space-y-6">
      <OCPageTitle page="Bank accounts" />
      {data.accounts.length === 0 ? (
        <NoBankAccountsEmpty ocId={ocId} />
      ) : (
        <BankAccountsList ocId={ocId} accounts={data.accounts} />
      )}
    </div>
  );
}
