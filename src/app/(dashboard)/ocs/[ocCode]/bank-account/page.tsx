import { getOC } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { getBankAccountsForOC } from "@/lib/actions/bank-transactions";
import { getFundTransfers } from "@/lib/actions/fund-transfers";
import { redirect } from "next/navigation";
import { BankAccountContent } from "./bank-account-content";

import { resolveOCFromCode } from "@/lib/oc-resolver";

export default async function BankAccountPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const [oc, profile, bankAccounts, fundTransfers] = await Promise.all([
    getOC(ocId),
    getCurrentProfile(),
    getBankAccountsForOC(ocId),
    getFundTransfers(ocId),
  ]);

  if (!oc) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/ocs/${ocCode}`);

  return (
    <BankAccountContent
      ocId={ocId}
      bankBsb={oc.bank_bsb ?? ""}
      bankAccountNumber={oc.bank_account_number ?? ""}
      bankAccountName={oc.bank_account_name ?? ""}
      bankAccounts={bankAccounts}
      fundTransfers={fundTransfers}
    />
  );
}
