import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { requireOCAccess } from "@/lib/auth";
import { getOcLots, getOcBankAccountOptions } from "@/lib/actions/funds";
import { CreateFundForm } from "./create-fund-form";

export default async function CreateFundPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  await requireOCAccess(resolved.id);

  const [lots, bankOptions] = await Promise.all([
    getOcLots(resolved.id),
    getOcBankAccountOptions(resolved.id),
  ]);

  return (
    <CreateFundForm
      ocId={resolved.id}
      ocCode={ocCode}
      lots={lots}
      bankOptions={bankOptions}
    />
  );
}
