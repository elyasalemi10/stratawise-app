import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { createServerClient } from "@/lib/supabase";
import { requireOCAccess } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";

const FUND_LABEL: Record<string, string> = {
  administrative: "Administrative Fund",
  capital_works: "Capital Works Fund",
  maintenance_plan: "Maintenance Plan Fund",
};

export default async function BankAccountsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  await requireOCAccess(ocId);

  const supabase = createServerClient();
  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, account_name, bsb, account_number, fund_type, bank_name")
    .eq("oc_id", ocId)
    .order("fund_type", { ascending: true });

  const rows = accounts ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="No bank accounts"
        description="This OC has no bank accounts on file yet."
      />
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((a) => (
        <Card key={a.id}>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Landmark className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">
                  {a.account_name || a.bank_name || "Bank account"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {FUND_LABEL[a.fund_type] ?? a.fund_type}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
