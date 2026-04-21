import { getSubdivision } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { getBankAccountsForSubdivision } from "@/lib/actions/bank-transactions";
import { redirect } from "next/navigation";
import { BankAccountContent } from "./bank-account-content";

export default async function BankAccountPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const [subdivision, profile, bankAccounts] = await Promise.all([
    getSubdivision(subdivisionId),
    getCurrentProfile(),
    getBankAccountsForSubdivision(subdivisionId),
  ]);

  if (!subdivision) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/subdivisions/${subdivisionId}/dashboard`);

  return (
    <BankAccountContent
      subdivisionId={subdivisionId}
      bankBsb={subdivision.bank_bsb ?? ""}
      bankAccountNumber={subdivision.bank_account_number ?? ""}
      bankAccountName={subdivision.bank_account_name ?? ""}
      bankAccounts={bankAccounts}
    />
  );
}
