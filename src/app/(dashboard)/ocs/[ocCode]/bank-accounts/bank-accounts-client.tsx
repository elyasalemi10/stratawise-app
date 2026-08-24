"use client";

import { useCallback } from "react";
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

  if (data.accounts.length === 0) return <NoBankAccountsEmpty ocId={ocId} />;

  return <BankAccountsList ocId={ocId} accounts={data.accounts} />;
}
