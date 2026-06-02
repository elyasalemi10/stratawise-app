"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { AddBankAccountDrawer } from "./add-bank-account-drawer";

// Shown when the OC has zero bank_accounts rows. The first account created
// here is intentionally the operating account (the one the admin/operating
// fund draws to/from) — createBankAccount defaults fund_type to 'operating'
// and the server action links it to the OC's existing operating fund if one
// is present.
export function NoBankAccountsEmpty({ ocId }: { ocId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <EmptyState
        icon={Landmark}
        title="No bank accounts yet"
        description="Add your first bank account to start importing transactions. The first account becomes the operating account that the admin fund draws to and from."
        action={
          <Button onClick={() => setOpen(true)} className="mt-2">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add bank account
          </Button>
        }
      />
      <AddBankAccountDrawer
        ocId={ocId}
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
